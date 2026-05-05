import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";

// ── constants ─────────────────────────────────────────────────────────────────
const CAT_COLORS = {
  sys:  { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd", badge: "#2563eb" },
  pkg:  { bg: "#2e1a4a", border: "#8b5cf6", text: "#c4b5fd", badge: "#7c3aed" },
  net:  { bg: "#0c3440", border: "#06b6d4", text: "#67e8f9", badge: "#0891b2" },
  file: { bg: "#3d2a00", border: "#f59e0b", text: "#fcd34d", badge: "#d97706" },
  proc: { bg: "#3d1010", border: "#ef4444", text: "#fca5a5", badge: "#dc2626" },
  diag: { bg: "#0d3022", border: "#10b981", text: "#6ee7b7", badge: "#059669" },
  raw:  { bg: "#1e2030", border: "#6b7280", text: "#9ca3af", badge: "#4b5563" },
};

const PRIORITY_COLORS = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  NORMAL:   "#3b82f6",
  LOW:      "#6b7280",
};

const PRIORITY_LABELS = { CRITICAL: "!!", HIGH: "!", NORMAL: "·", LOW: "~" };

function Badge({ cat }) {
  const c = CAT_COLORS[cat] || CAT_COLORS.raw;
  return (
    <span style={{
      background: c.badge, color: "#fff", fontSize: 9, fontWeight: 700,
      padding: "1px 6px", borderRadius: 4, textTransform: "uppercase",
      letterSpacing: 0.8, flexShrink: 0,
    }}>
      {cat}
    </span>
  );
}

function PriorityDot({ priority }) {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: "50%",
      background: PRIORITY_COLORS[priority] || "#6b7280",
      display: "inline-block", flexShrink: 0,
    }} title={priority} />
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function Dispatcher() {
  const { vmId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef(null);
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  const [vmHost, setVmHost] = useState("");
  const [wsStatus, setWsStatus] = useState("disconnected"); // connecting | connected | disconnected | error
  const [registry, setRegistry] = useState({});
  const [metrics, setMetrics] = useState(null);
  const [feed, setFeed] = useState([]);           // activity feed items
  const [selectedResult, setSelectedResult] = useState(null);
  const [command, setCommand] = useState("");
  const [batchText, setBatchText] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [vms, setVms] = useState([]);
  const [selectedVmId, setSelectedVmId] = useState(vmId || "");

  // ── load available VMs & registry on mount ───────────────────────────────
  useEffect(() => {
    api.get("/vm/list").then(r => setVms(r.data)).catch(() => {});
    api.get("/dispatcher/registry").then(r => {
      setRegistry(r.data.grouped || {});
    }).catch(() => {});
  }, []);

  // ── connect WebSocket ─────────────────────────────────────────────────────
  const connect = useCallback((vid) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const token = localStorage.getItem("token");
    if (!token || !vid) return;

    setWsStatus("connecting");
    const ws = new WebSocket(`ws://localhost:8000/dispatcher/ws/${vid}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    };

    ws.onerror = () => {
      setWsStatus("error");
      setDispatching(false);
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      setDispatching(false);
    };
  }, []);

  useEffect(() => {
    if (selectedVmId) connect(selectedVmId);
    return () => wsRef.current?.close();
  }, [selectedVmId, connect]);

  // ── message handler ───────────────────────────────────────────────────────
  const handleMessage = (msg) => {
    if (msg.type === "connected") {
      setWsStatus("connected");
      setVmHost(msg.vm_host);
      addFeedItem({ type: "system", text: msg.message, ts: msg.timestamp });
      // fetch metrics after connect
      wsRef.current?.send(JSON.stringify({ type: "metrics" }));
    }

    else if (msg.type === "dispatching") {
      setDispatching(true);
      addFeedItem({
        type: "dispatching",
        command_id: msg.command_id,
        category: msg.category,
        action: msg.action,
        priority: msg.priority,
        ts: msg.timestamp,
      });
    }

    else if (msg.type === "result") {
      setDispatching(false);
      const item = {
        type: "result",
        command_id: msg.command_id,
        raw_command: msg.raw_command,
        category: msg.category,
        action: msg.action,
        output: msg.output,
        success: msg.success,
        execution_time_ms: msg.execution_time_ms,
        error: msg.error,
        ts: msg.timestamp,
      };
      addFeedItem(item);
      setSelectedResult(item);
      // refresh metrics after every result
      wsRef.current?.send(JSON.stringify({ type: "metrics" }));
    }

    else if (msg.type === "batch_start") {
      addFeedItem({
        type: "system",
        text: `Batch started: ${msg.count} commands (sorted by priority)`,
        ts: new Date().toISOString(),
        commands: msg.commands,
      });
    }

    else if (msg.type === "batch_complete") {
      setDispatching(false);
      addFeedItem({
        type: "system",
        text: `Batch complete: ${msg.count} commands executed`,
        ts: new Date().toISOString(),
      });
      if (msg.metrics) setMetrics(msg.metrics);
    }

    else if (msg.type === "metrics") {
      setMetrics(msg.data);
    }

    else if (msg.type === "error") {
      setDispatching(false);
      addFeedItem({ type: "error", text: msg.message, ts: new Date().toISOString() });
    }
  };

  const addFeedItem = (item) => {
    setFeed(prev => {
      const next = [...prev, { ...item, id: Math.random().toString(36).slice(2) }];
      return next.slice(-200);
    });
  };

  // auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  // ── dispatch helpers ──────────────────────────────────────────────────────
  const sendCommand = (cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "dispatch", command: cmd }));
    setCmdHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 50));
    setHistoryIndex(-1);
  };

  const handleDispatch = () => {
    const cmd = command.trim();
    if (!cmd) return;
    sendCommand(cmd);
    setCommand("");
  };

  const handleBatch = () => {
    const cmds = batchText.split("\n").map(s => s.trim()).filter(Boolean);
    if (!cmds.length || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "batch", commands: cmds }));
    setDispatching(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { handleDispatch(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIndex + 1, cmdHistory.length - 1);
      setHistoryIndex(idx);
      setCommand(cmdHistory[idx] || "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIndex - 1, -1);
      setHistoryIndex(idx);
      setCommand(idx === -1 ? "" : cmdHistory[idx]);
    }
  };

  // ── registry filter ───────────────────────────────────────────────────────
  const filteredRegistry = Object.entries(registry).reduce((acc, [cat, cmds]) => {
    if (activeCategory && cat !== activeCategory) return acc;
    const filtered = cmds.filter(c =>
      !searchQuery ||
      c.action.includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length) acc[cat] = filtered;
    return acc;
  }, {});

  // ── render ────────────────────────────────────────────────────────────────
  const statusColor = { connected: "#10b981", connecting: "#f59e0b", error: "#ef4444", disconnected: "#6b7280" };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0d1117", color: "#e2e8f0", fontFamily: "'Segoe UI', monospace", overflow: "hidden" }}>

      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside style={{ width: 200, background: "#161b22", borderRight: "1px solid #21262d", display: "flex", flexDirection: "column", padding: "16px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #21262d" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#58a6ff", marginBottom: 4 }}>Automation Tool</div>
          <div style={{ fontSize: 10, color: "#484f58" }}>Command Dispatcher</div>
        </div>
        {[
          { label: "Dashboard", path: "/dashboard" },
          { label: "Dispatcher", path: `/dispatcher/${selectedVmId}`, active: true },
          { label: "Reports", path: "/reports" },
        ].map(item => (
          <div key={item.label}
            onClick={() => navigate(item.path)}
            style={{
              padding: "10px 16px", fontSize: 13, cursor: "pointer",
              color: item.active ? "#58a6ff" : "#8b949e",
              background: item.active ? "#1c2333" : "transparent",
              borderLeft: item.active ? "2px solid #58a6ff" : "2px solid transparent",
            }}>
            {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div
          onClick={() => { localStorage.clear(); navigate("/login"); }}
          style={{ padding: "10px 16px", fontSize: 13, color: "#f85149", cursor: "pointer" }}>
          Logout
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div style={{ background: "#161b22", borderBottom: "1px solid #21262d", padding: "10px 20px", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#c9d1d9" }}>Command Dispatcher</span>
            {vmHost && <span style={{ fontSize: 12, color: "#484f58", marginLeft: 10 }}>{vmHost}</span>}
          </div>

          {/* VM selector */}
          <select
            value={selectedVmId}
            onChange={e => { setSelectedVmId(e.target.value); }}
            style={{ background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
            <option value="">-- Select VM --</option>
            {vms.filter(v => v.is_busy).map(v => (
              <option key={v.id} value={v.id}>{v.host}</option>
            ))}
          </select>

          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[wsStatus] || "#6b7280", display: "inline-block" }} />
            <span style={{ fontSize: 12, color: statusColor[wsStatus], textTransform: "capitalize" }}>{wsStatus}</span>
          </div>

          {/* Metrics bar */}
          {metrics && (
            <div style={{ display: "flex", gap: 20, fontSize: 11 }}>
              {[
                ["Dispatched", metrics.total_dispatched],
                ["Success", `${metrics.success_rate}%`],
                ["Avg Time", `${metrics.avg_execution_time_ms}ms`],
                ["Commands", metrics.registered_commands],
              ].map(([label, val]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ color: "#58a6ff", fontWeight: 700 }}>{val}</div>
                  <div style={{ color: "#484f58", fontSize: 9 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── BODY (3 columns) ────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT: Command Palette ────────────────────────────────────── */}
          <div style={{ width: 230, background: "#161b22", borderRight: "1px solid #21262d", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #21262d" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#484f58", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Command Palette</div>
              <input
                placeholder="Search commands..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "5px 8px", borderRadius: 6, fontSize: 11, boxSizing: "border-box" }}
              />
              {/* Category filters */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                <span
                  onClick={() => setActiveCategory(null)}
                  style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontWeight: 700,
                    background: !activeCategory ? "#21262d" : "transparent",
                    border: "1px solid #30363d", color: !activeCategory ? "#c9d1d9" : "#6b7280",
                  }}>ALL</span>
                {Object.keys(CAT_COLORS).filter(c => c !== "raw").map(cat => {
                  const c = CAT_COLORS[cat];
                  return (
                    <span key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                      style={{
                        fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontWeight: 700,
                        background: activeCategory === cat ? c.badge : "transparent",
                        border: `1px solid ${activeCategory === cat ? c.badge : "#30363d"}`,
                        color: activeCategory === cat ? "#fff" : "#6b7280",
                        textTransform: "uppercase",
                      }}>{cat}</span>
                  );
                })}
              </div>
            </div>

            {/* Command list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {Object.entries(filteredRegistry).map(([cat, cmds]) => {
                const c = CAT_COLORS[cat] || CAT_COLORS.raw;
                return (
                  <div key={cat}>
                    <div style={{ padding: "6px 12px 2px", fontSize: 9, fontWeight: 700, color: c.text, textTransform: "uppercase", letterSpacing: 1 }}>
                      {cat}
                    </div>
                    {cmds.map(cmd => (
                      <div key={cmd.key}
                        onClick={() => {
                          const needs = ["pkg:install","pkg:remove","pkg:search","pkg:info","net:ping","net:dns","net:curl","file:ls","file:cat","file:mkdir","file:find","file:tail","file:wc","proc:kill"];
                          const snippet = needs.includes(cmd.key) ? `${cmd.key} ` : cmd.key;
                          setCommand(snippet);
                          inputRef.current?.focus();
                        }}
                        style={{
                          padding: "6px 12px", cursor: "pointer", fontSize: 11,
                          borderLeft: `2px solid transparent`,
                          transition: "all 0.1s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = c.bg;
                          e.currentTarget.style.borderLeftColor = c.border;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.borderLeftColor = "transparent";
                        }}>
                        <div style={{ color: "#c9d1d9", fontWeight: 600 }}>{cmd.action}</div>
                        <div style={{ color: "#484f58", fontSize: 9.5, marginTop: 1 }}>{cmd.description}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {Object.keys(filteredRegistry).length === 0 && (
                <div style={{ padding: 16, color: "#484f58", fontSize: 11 }}>No commands match your search.</div>
              )}
            </div>
          </div>

          {/* ── CENTER: Dispatch Feed ───────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            {/* Syntax hint */}
            <div style={{ padding: "6px 16px", background: "#0d1117", borderBottom: "1px solid #21262d", fontSize: 10, color: "#484f58", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span><span style={{ color: "#58a6ff" }}>category:action [args]</span> &nbsp;|&nbsp; prefix: <span style={{ color: "#ef4444" }}>!!</span> CRITICAL &nbsp;<span style={{ color: "#f97316" }}>!</span> HIGH &nbsp;<span style={{ color: "#6b7280" }}>~</span> LOW</span>
              <span style={{ marginLeft: "auto" }}>Arrow Up/Down = history</span>
            </div>

            {/* Activity feed */}
            <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {feed.length === 0 && (
                <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", marginTop: 40 }}>
                  {wsStatus === "connected"
                    ? "Dispatcher ready. Type a command or click from the palette."
                    : wsStatus === "connecting"
                    ? "Connecting to dispatcher..."
                    : "Select a VM to connect the dispatcher."}
                </div>
              )}

              {feed.map(item => {
                if (item.type === "system") return (
                  <div key={item.id} style={{ fontSize: 10.5, color: "#484f58", padding: "3px 0", display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#21262d" }}>{item.ts ? new Date(item.ts).toLocaleTimeString() : ""}</span>
                    <span style={{ color: "#3b82f6" }}>⊙</span>
                    <span>{item.text}</span>
                  </div>
                );

                if (item.type === "error") return (
                  <div key={item.id} style={{ fontSize: 10.5, color: "#f85149", padding: "4px 8px", background: "#2d1515", borderRadius: 6, border: "1px solid #8b1a1a" }}>
                    ERROR: {item.text}
                  </div>
                );

                if (item.type === "dispatching") {
                  const c = CAT_COLORS[item.category] || CAT_COLORS.raw;
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, animation: "pulse 1s infinite" }}>
                      <span style={{ fontSize: 9, color: "#484f58" }}>{item.ts ? new Date(item.ts).toLocaleTimeString() : ""}</span>
                      <PriorityDot priority={item.priority} />
                      <Badge cat={item.category} />
                      <span style={{ fontSize: 11, color: c.text, fontWeight: 600 }}>{item.action}</span>
                      <span style={{ fontSize: 10, color: "#484f58", marginLeft: "auto" }}>
                        <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span> dispatching...
                      </span>
                    </div>
                  );
                }

                if (item.type === "result") {
                  const c = CAT_COLORS[item.category] || CAT_COLORS.raw;
                  const isSelected = selectedResult?.id === item.id;
                  return (
                    <div key={item.id}
                      onClick={() => setSelectedResult(isSelected ? null : item)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 8px",
                        background: isSelected ? "#1c2333" : "transparent",
                        border: `1px solid ${isSelected ? "#30363d" : "transparent"}`,
                        borderRadius: 6, cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#161b22"; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: 9, color: "#484f58", minWidth: 55 }}>{item.ts ? new Date(item.ts).toLocaleTimeString() : ""}</span>
                      <span style={{ fontSize: 13 }}>{item.success ? "✓" : "✗"}</span>
                      <Badge cat={item.category} />
                      <span style={{ fontSize: 11, color: "#c9d1d9", fontWeight: 600 }}>{item.action}</span>
                      {item.action !== item.raw_command && item.raw_command !== `${item.category}:${item.action}` && (
                        <span style={{ fontSize: 10, color: "#484f58", fontFamily: "monospace" }}>
                          {item.raw_command.replace(`${item.category}:${item.action}`, "").trim().slice(0, 20)}
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 10, color: item.success ? "#10b981" : "#ef4444", fontFamily: "monospace" }}>
                        {item.execution_time_ms}ms
                      </span>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* ── Command input ─────────────────────────────────────────── */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid #21262d", background: "#161b22" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  ref={inputRef}
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="sys:status  |  pkg:install git  |  net:ping 8.8.8.8  |  !! sys:reboot"
                  style={{
                    flex: 1, background: "#0d1117", border: "1px solid #30363d",
                    color: "#c9d1d9", padding: "8px 12px", borderRadius: 6,
                    fontSize: 12, fontFamily: "monospace", outline: "none",
                  }}
                  disabled={wsStatus !== "connected" || dispatching}
                />
                <button
                  onClick={handleDispatch}
                  disabled={wsStatus !== "connected" || dispatching || !command.trim()}
                  style={{
                    background: dispatching ? "#21262d" : "#1f6b2a",
                    border: "none", color: "#fff", padding: "8px 16px",
                    borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700,
                    opacity: (wsStatus !== "connected" || !command.trim()) ? 0.4 : 1,
                  }}>
                  {dispatching ? "..." : "Dispatch"}
                </button>
              </div>

              {/* Batch input */}
              <details style={{ fontSize: 11 }}>
                <summary style={{ color: "#484f58", cursor: "pointer", userSelect: "none" }}>
                  Batch dispatch (one command per line)
                </summary>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <textarea
                    value={batchText}
                    onChange={e => setBatchText(e.target.value)}
                    placeholder={"sys:status\nsys:memory\nnet:ifconfig\ndiag:health"}
                    rows={4}
                    style={{
                      flex: 1, background: "#0d1117", border: "1px solid #30363d",
                      color: "#c9d1d9", padding: "8px", borderRadius: 6,
                      fontSize: 11, fontFamily: "monospace", resize: "vertical",
                    }}
                  />
                  <button
                    onClick={handleBatch}
                    disabled={wsStatus !== "connected" || dispatching || !batchText.trim()}
                    style={{
                      background: "#1a3a5c", border: "none", color: "#fff",
                      padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: 700, alignSelf: "flex-start",
                      opacity: (wsStatus !== "connected" || !batchText.trim()) ? 0.4 : 1,
                    }}>
                    Run Batch
                  </button>
                </div>
              </details>
            </div>
          </div>

          {/* ── RIGHT: Result Detail ─────────────────────────────────────── */}
          <div style={{ width: 340, background: "#161b22", borderLeft: "1px solid #21262d", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
            {selectedResult ? (
              <>
                {/* Result header */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #21262d" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{selectedResult.success ? "✓" : "✗"}</span>
                    <Badge cat={selectedResult.category} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#c9d1d9" }}>{selectedResult.raw_command}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
                    {[
                      ["Time", `${selectedResult.execution_time_ms}ms`],
                      ["Status", selectedResult.success ? "success" : "failed"],
                      ["ID", selectedResult.command_id],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ color: "#484f58" }}>{k}</div>
                        <div style={{ color: selectedResult.success ? "#10b981" : "#ef4444", fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Output */}
                <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                  <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Output</div>
                  <pre style={{
                    background: "#0d1117", border: "1px solid #21262d",
                    borderRadius: 6, padding: 10, fontSize: 10.5,
                    color: "#c9d1d9", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    maxHeight: "60vh", overflowY: "auto", margin: 0,
                    fontFamily: "'Courier New', monospace",
                  }}>
                    {selectedResult.output || selectedResult.error || "(no output)"}
                  </pre>

                  {selectedResult.error && (
                    <div style={{ marginTop: 8, padding: 8, background: "#2d1515", borderRadius: 6, fontSize: 10, color: "#f85149" }}>
                      {selectedResult.error}
                    </div>
                  )}
                </div>

                {/* Quick re-dispatch */}
                <div style={{ padding: "10px 12px", borderTop: "1px solid #21262d" }}>
                  <button
                    onClick={() => sendCommand(selectedResult.raw_command)}
                    disabled={wsStatus !== "connected" || dispatching}
                    style={{
                      width: "100%", background: "#1c2333", border: "1px solid #30363d",
                      color: "#c9d1d9", padding: "7px", borderRadius: 6,
                      cursor: "pointer", fontSize: 11, fontWeight: 600,
                    }}>
                    Re-dispatch: {selectedResult.raw_command}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, padding: 24 }}>
                <div style={{ fontSize: 32, opacity: 0.3 }}>⬡</div>
                <div style={{ fontSize: 12, color: "#484f58", textAlign: "center" }}>
                  Click any result in the feed to view its output here.
                </div>

                {/* Metrics panel when no result selected */}
                {metrics && (
                  <div style={{ width: "100%", marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "#484f58", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Dispatcher Metrics</div>
                    {[
                      ["Total Dispatched", metrics.total_dispatched, "#58a6ff"],
                      ["Successful", metrics.total_success, "#10b981"],
                      ["Failed", metrics.total_failed, "#ef4444"],
                      ["Success Rate", `${metrics.success_rate}%`, "#10b981"],
                      ["Avg Exec Time", `${metrics.avg_execution_time_ms}ms`, "#f59e0b"],
                      ["Registered Commands", metrics.registered_commands, "#8b5cf6"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid #21262d" }}>
                        <span style={{ color: "#6b7280" }}>{label}</span>
                        <span style={{ color, fontWeight: 700 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        details summary::-webkit-details-marker { color: #484f58; }
      `}</style>
    </div>
  );
}
