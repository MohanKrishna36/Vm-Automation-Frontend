import { useEffect, useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { useVM } from "../contexts/VMContext";

const METRIC_LABELS = { memory: "Memory Usage", disk: "Disk Usage (/)", cpu_load: "CPU Load (1m avg)" };
const METRIC_UNITS  = { memory: "%", disk: "%", cpu_load: "" };
const OP_LABELS     = { gt: ">", lt: "<", gte: ">=", lte: "<=" };

const BellIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

export default function Dashboard() {
  const [vms, setVMs] = useState([]);
  const [form, setForm] = useState({ host: "", username: "", password: "" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(null);
  const { hasActiveSession } = useVM();
  const token = localStorage.getItem("token");

  // -- Broadcast state --------------------------------------------------------
  const [selectedVMs, setSelectedVMs] = useState(new Set());

  // -- Alert state ------------------------------------------------------------
  const [alertCount, setAlertCount] = useState(0);
  const [alertEvents, setAlertEvents] = useState([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [alertRules, setAlertRules] = useState([]);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({ vm_id: "", name: "", metric: "memory", operator: "gt", threshold: 80 });
  const [savingRule, setSavingRule] = useState(false);

  /* ---------- DATA LOADERS ---------- */
  const loadVMs = async () => {
    if (!token) return;
    try { const res = await api.get("/vm/list"); setVMs(res.data); } catch { /* silent */ }
  };

  const fetchAlertCount = async () => {
    try { const r = await api.get("/alerts/count"); setAlertCount(r.data.count); } catch { /* silent */ }
  };

  const fetchAlertEvents = async () => {
    try { const r = await api.get("/alerts/events?active_only=true"); setAlertEvents(r.data); } catch { /* silent */ }
  };

  const fetchAlertRules = async () => {
    try { const r = await api.get("/alerts/rules"); setAlertRules(r.data); } catch { /* silent */ }
  };

  useEffect(() => {
    loadVMs();
    fetchAlertCount();
    const vmInt = setInterval(loadVMs, 10000);
    const bellInt = setInterval(fetchAlertCount, 30000);
    return () => { clearInterval(vmInt); clearInterval(bellInt); };
  }, []);

  // Refresh events when panel opens
  useEffect(() => { if (showAlertPanel) fetchAlertEvents(); }, [showAlertPanel]);
  useEffect(() => { if (showRulesModal) fetchAlertRules(); }, [showRulesModal]);

  /* ---------- CONNECT VM ---------- */
  const connectVM = async () => {
    if (!token) { alert("Please login first"); window.location.href = "/login"; return; }
    const { host, username, password } = form;
    if (!host || !username || !password) { alert("Please fill all fields"); return; }
    setLoading(true);
    try {
      await api.post("/vm/connect", form);
      setForm({ host: "", username: "", password: "" });
      loadVMs();
    } catch (err) {
      alert(err.response?.data?.detail || "Connection failed");
    } finally { setLoading(false); }
  };

  const releaseVM = async (e, vmId) => {
    e.stopPropagation();
    setReleasing(vmId);
    try { await api.post(`/vm/disconnect/${vmId}`); loadVMs(); }
    catch (err) { alert(err.response?.data?.detail || "Failed to release VM"); }
    finally { setReleasing(null); }
  };

  /* ---------- ALERT ACTIONS ---------- */
  const acknowledgeAlert = async (eventId) => {
    try {
      await api.post(`/alerts/events/${eventId}/acknowledge`);
      setAlertEvents(prev => prev.filter(e => e.id !== eventId));
      setAlertCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const toggleRule = async (ruleId) => {
    try { await api.patch(`/alerts/rules/${ruleId}/toggle`); fetchAlertRules(); } catch { /* silent */ }
  };

  const deleteRule = async (ruleId) => {
    try { await api.delete(`/alerts/rules/${ruleId}`); fetchAlertRules(); fetchAlertCount(); } catch { /* silent */ }
  };

  const createRule = async () => {
    if (!ruleForm.vm_id) return alert("Select a VM");
    if (!ruleForm.name.trim()) return alert("Enter a rule name");
    setSavingRule(true);
    try {
      await api.post("/alerts/rules", {
        vm_id: Number(ruleForm.vm_id),
        name: ruleForm.name.trim(),
        metric: ruleForm.metric,
        operator: ruleForm.operator,
        threshold: Number(ruleForm.threshold),
      });
      setRuleForm({ vm_id: "", name: "", metric: "memory", operator: "gt", threshold: 80 });
      fetchAlertRules();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create rule");
    } finally { setSavingRule(false); }
  };

  /* ---------- BROADCAST ---------- */
  const toggleVMSelect = (vmId) => {
    setSelectedVMs(prev => {
      const next = new Set(prev);
      next.has(vmId) ? next.delete(vmId) : next.add(vmId);
      return next;
    });
  };

  /* ---------- DERIVED ---------- */
  const myLockedVMs = vms.filter(vm => vm.locked_by_me);

  // Multi-VM rejoin: check if a saved multi-VM session is still fully locked by us
  const savedMultiSession = (() => {
    try { return JSON.parse(localStorage.getItem("multiVmSession") || "null"); } catch { return null; }
  })();
  const rejoinVmIds = savedMultiSession?.vmIds || [];
  const rejoinVms = rejoinVmIds.length >= 2
    ? rejoinVmIds.map(id => vms.find(v => v.id === id)).filter(v => v?.locked_by_me)
    : [];
  const canRejoin = rejoinVms.length === rejoinVmIds.length && rejoinVmIds.length >= 2;
  const activeEvents = alertEvents.filter(e => !e.acknowledged);

  const fmtValue = (ev) => `${ev.current_value}${METRIC_UNITS[ev.metric] || ""}`;
  const fmtThreshold = (ev) => `${ev.threshold}${METRIC_UNITS[ev.metric] || ""}`;
  const timeSince = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso + "Z")) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  };

  /* ---------- RENDER ---------- */
  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h2>Automation Tool</h2>

        <div className="nav-item active">Dashboard</div>
        <div className="nav-item" onClick={() => (window.location.href = "/reports")}>Reports</div>
        <div className="nav-item" onClick={() => (window.location.href = "/dispatcher")}>Dispatcher</div>

        {/* -- Alert Bell -- */}
        <div
          onClick={() => setShowAlertPanel(s => !s)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", margin: "4px 0", borderRadius: 8,
            cursor: "pointer",
            background: showAlertPanel ? "#1a1205" : "transparent",
            border: `1px solid ${alertCount > 0 ? "#78350f" : "#21262d"}`,
            color: alertCount > 0 ? "#f59e0b" : "#6b7280",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#1a1205"}
          onMouseLeave={e => { if (!showAlertPanel) e.currentTarget.style.background = "transparent"; }}
        >
          <BellIcon size={14} />
          <span style={{ fontSize: 13, fontWeight: alertCount > 0 ? 700 : 400 }}>Alerts</span>
          {alertCount > 0 && (
            <span style={{
              marginLeft: "auto", background: "#ef4444", color: "#fff",
              fontSize: 10, fontWeight: 700, borderRadius: 10,
              padding: "1px 7px", minWidth: 18, textAlign: "center",
            }}>{alertCount}</span>
          )}
        </div>

        {token && (
          <div className="logout" onClick={() => { localStorage.clear(); window.location.href = "/login"; }}>
            Logout
          </div>
        )}
      </aside>

      {/* MAIN */}
      <main className="main">
        {/* LEFT COLUMN */}
        <div>
          {/* CONNECT VM */}
          <div className="card">
            <h3>Connect to VM</h3>
            <input placeholder="Host / IP address" value={form.host}
              onChange={e => setForm({ ...form, host: e.target.value })} />
            <input placeholder="Username" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })} />
            <input type="password" placeholder="Password" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
            <button className="primary mt-12" disabled={loading} onClick={connectVM}>
              {loading ? "Connecting..." : "Connect"}
            </button>
          </div>

          {/* REJOIN MULTI-VM BANNER */}
          {canRejoin && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: "#0d1f33", border: "1px solid #1d4ed8", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#58a6ff", fontWeight: 700, marginBottom: 2 }}>
                  Active Multi-VM Session
                </div>
                <div style={{ fontSize: 11, color: "#8b949e" }}>
                  {rejoinVms.map(v => v.host).join(", ")}
                </div>
              </div>
              <button
                onClick={() => navigate("/vm/multi", { state: { vmIds: rejoinVmIds } })}
                style={{ padding: "6px 14px", background: "#1d4ed8", border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                Rejoin Session
              </button>
              <button
                onClick={() => { localStorage.removeItem("multiVmSession"); window.location.reload(); }}
                style={{ padding: "6px 10px", background: "none", border: "1px solid #30363d", color: "#484f58", borderRadius: 6, cursor: "pointer", fontSize: 11, flexShrink: 0 }}>
                Dismiss
              </button>
            </div>
          )}

          {/* VM LIST */}
          <div className="card vm-container mt-24">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <h3 style={{ margin:0 }}>VM List</h3>
              {selectedVMs.size > 0 && (
                <button
                  onClick={() => navigate("/vm/multi", { state: { vmIds: [...selectedVMs] } })}
                  style={{ fontSize:11, padding:"5px 14px", background:"#0d1b2e", border:"1px solid #1d4ed8", color:"#58a6ff", borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                  Open {selectedVMs.size} VM{selectedVMs.size !== 1 ? "s" : ""} Together
                </button>
              )}
            </div>
            {vms.length === 0 && <p style={{ color: "#6b7280" }}>No virtual machines found</p>}
            {vms.map(vm => (
              <div key={vm.host} className="card vm-item"
                onClick={() => {
                  if (!token) { alert("Please login first"); window.location.href = "/login"; return; }
                  if (!vm.is_busy) { alert("VM is not connected yet"); return; }
                  window.location.href = `/vm/${vm.id}`;
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {vm.locked_by_me && (
                      <div onClick={e => { e.stopPropagation(); toggleVMSelect(vm.id); }}
                        style={{
                          width:16, height:16, borderRadius:4, flexShrink:0, cursor:"pointer",
                          border:`2px solid ${selectedVMs.has(vm.id) ? "#3b82f6" : "#30363d"}`,
                          background: selectedVMs.has(vm.id) ? "#3b82f6" : "transparent",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          transition:"all 0.15s",
                        }}>
                        {selectedVMs.has(vm.id) && <span style={{ color:"#fff", fontSize:10, lineHeight:1, fontWeight:700 }}>{"✓"}</span>}
                      </div>
                    )}
                    <strong>{vm.host}</strong>
                  </div>
                  {vm.locked_by_me && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "#2a1f00", border: "1px solid #78350f", borderRadius: 10, padding: "2px 8px", letterSpacing: "0.05em" }}>
                      LOCKED BY YOU
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6 }}>
                  {vm.is_busy
                    ? vm.locked_by_me
                      ? <span style={{ color: "#f59e0b", fontSize: 15, fontWeight: 600 }}>{"\u25CF"} Active session</span>
                      : <span style={{ color: "#6b7280", fontSize: 15, fontWeight: 500 }}>{"\u25CF"} Busy (other user)</span>
                    : <span style={{ color: "#22c55e", fontSize: 15, fontWeight: 600 }}>{"\u25CF"} Available</span>
                  }
                </div>
                {vm.is_busy && vm.locked_by_me && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); window.location.href = `/vm/${vm.id}`; }}
                      style={{ fontSize: 10, padding: "3px 8px", background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9", borderRadius: 4, cursor: "pointer" }}>
                      Terminal
                    </button>
                    <button onClick={e => { e.stopPropagation(); window.location.href = `/dispatcher/${vm.id}`; }}
                      style={{ fontSize: 10, padding: "3px 8px", background: "#0d1b2e", border: "1px solid #1d4ed8", color: "#58a6ff", borderRadius: 4, cursor: "pointer" }}>
                      Dispatcher
                    </button>
                    <button onClick={e => releaseVM(e, vm.id)} disabled={releasing === vm.id}
                      style={{ fontSize: 10, padding: "3px 8px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: releasing === vm.id ? "default" : "pointer", marginLeft: "auto" }}>
                      {releasing === vm.id ? "Releasing..." : "Release"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "stretch" }}>

          {/* LOCKED BY YOU PANEL */}
          {myLockedVMs.length > 0 && (
            <div className="card" style={{ borderColor: "#f59e0b", background: "#111" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>Locked by You</span>
                <span style={{ fontSize: 11, color: "#6b7280", background: "#21262d", borderRadius: 10, padding: "1px 8px" }}>
                  {myLockedVMs.length}
                </span>
              </div>
              {myLockedVMs.map(vm => (
                <div key={vm.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", marginBottom: 6,
                  background: "#0d1117", border: "1px solid #2a1f00", borderRadius: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", display: "inline-block", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600 }}>{vm.host}</div>
                      <div style={{ color: "#6b7280", fontSize: 10, marginTop: 1 }}>Session active</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => window.location.href = `/vm/${vm.id}`}
                      style={{ fontSize: 11, padding: "4px 10px", background: "#161b22", border: "1px solid #30363d", color: "#58a6ff", borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>
                      Open
                    </button>
                    <button onClick={e => releaseVM(e, vm.id)} disabled={releasing === vm.id}
                      style={{ fontSize: 11, padding: "4px 10px", background: releasing === vm.id ? "#1a0a0a" : "#2d0a0a", border: "1px solid #7f1d1d", color: releasing === vm.id ? "#6b7280" : "#f87171", borderRadius: 5, cursor: releasing === vm.id ? "default" : "pointer", fontWeight: 500 }}>
                      {releasing === vm.id ? "Releasing..." : "Release"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ACTIVE ALERTS PANEL */}
          {showAlertPanel && (
            <div className="card" style={{ borderColor: alertCount > 0 ? "#ef4444" : "#30363d", background: "#0d0808" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: alertCount > 0 ? "#f87171" : "#6b7280", fontWeight: 700, fontSize: 13 }}>
                    Active Alerts
                  </span>
                  {alertCount > 0 && (
                    <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 8px" }}>
                      {alertCount}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowRulesModal(true)}
                  style={{ fontSize: 11, padding: "4px 12px", background: "#161b22", border: "1px solid #30363d", color: "#8b949e", borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>
                  Manage Rules
                </button>
              </div>

              {activeEvents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#484f58" }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>v</div>
                  <div style={{ fontSize: 12 }}>All clear  -  no active threshold breaches</div>
                  <button onClick={() => setShowRulesModal(true)}
                    style={{ marginTop: 12, fontSize: 11, padding: "5px 14px", background: "#161b22", border: "1px solid #30363d", color: "#58a6ff", borderRadius: 5, cursor: "pointer" }}>
                    + Add Alert Rule
                  </button>
                </div>
              ) : (
                activeEvents.map(ev => (
                  <div key={ev.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                    marginBottom: 8, background: "#1a0a0a", border: "1px solid #7f1d1d",
                    borderRadius: 7, borderLeft: "3px solid #ef4444",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ color: "#f87171", fontSize: 12, fontWeight: 700 }}>{ev.rule_name}</span>
                        <span style={{ color: "#6b7280", fontSize: 10 }}>on</span>
                        <span style={{ color: "#e6edf3", fontSize: 11, fontFamily: "monospace" }}>{ev.vm_host}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#c9d1d9" }}>
                        <span style={{ color: "#8b949e" }}>{METRIC_LABELS[ev.metric]}</span>
                        {" "}
                        <span style={{ color: "#f87171", fontWeight: 700 }}>{OP_LABELS[ev.operator]} {fmtThreshold(ev)}</span>
                        {" · "}
                        <span style={{ color: "#fbbf24", fontWeight: 600 }}>Currently: {fmtValue(ev)}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#484f58", marginTop: 3 }}>
                        Triggered {timeSince(ev.triggered_at)}
                      </div>
                    </div>
                    <button onClick={() => acknowledgeAlert(ev.id)}
                      style={{ fontSize: 10, padding: "3px 10px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
                      Dismiss
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* INFO CONSOLE */}
          <div className="console" style={{ flex: 1 }}>
            <div className="console-header">
              <div className="dot red"></div>
              <div className="dot yellow"></div>
              <div className="dot green"></div>
            </div>
            <div>
              <strong>Welcome</strong>
              <br /><br />
              This dashboard allows you to:
              <br />- Connect to Alpine Linux VMs
              <br />- Manage system operations
              <br />- Install packages safely
              <br />- Run remote commands
              <br /><br />
              Select a VM from the list once connected.
            </div>
          </div>
        </div>
      </main>


      {/* -- ALERT RULES MODAL -- */}
      {showRulesModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }} onClick={() => setShowRulesModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#0d1117", border: "1px solid #30363d", borderRadius: 12,
            width: 560, maxHeight: "80vh", overflow: "auto",
            padding: "24px 24px", boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: "#e6edf3", fontSize: 16 }}>Alert Rules</h3>
              <button onClick={() => setShowRulesModal(false)}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>x</button>
            </div>

            {/* Add New Rule Form */}
            <div style={{ background: "#010409", border: "1px solid #21262d", borderRadius: 8, padding: "16px", marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
                New Rule
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>VM</label>
                  <select value={ruleForm.vm_id} onChange={e => setRuleForm(f => ({ ...f, vm_id: e.target.value }))}
                    style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "6px 10px", color: "#c9d1d9", fontSize: 12 }}>
                    <option value="">Select VM...</option>
                    {vms.map(vm => <option key={vm.id} value={vm.id}>{vm.host}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Rule Name</label>
                  <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. High Memory"
                    style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "6px 10px", color: "#c9d1d9", fontSize: 12, boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Metric</label>
                  <select value={ruleForm.metric} onChange={e => setRuleForm(f => ({ ...f, metric: e.target.value }))}
                    style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "6px 8px", color: "#c9d1d9", fontSize: 12 }}>
                    <option value="memory">Memory %</option>
                    <option value="disk">Disk % (/)</option>
                    <option value="cpu_load">CPU Load</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Condition</label>
                  <select value={ruleForm.operator} onChange={e => setRuleForm(f => ({ ...f, operator: e.target.value }))}
                    style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "6px 8px", color: "#c9d1d9", fontSize: 12 }}>
                    <option value="gt">{">"} greater than</option>
                    <option value="lt">{"<"} less than</option>
                    <option value="gte">{">="} at least</option>
                    <option value="lte">{"<="} at most</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                    Threshold {ruleForm.metric !== "cpu_load" ? "(%)" : ""}
                  </label>
                  <input type="number" value={ruleForm.threshold}
                    onChange={e => setRuleForm(f => ({ ...f, threshold: e.target.value }))}
                    style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "6px 10px", color: "#c9d1d9", fontSize: 12, boxSizing: "border-box" }} />
                </div>
              </div>

              <button onClick={createRule} disabled={savingRule}
                style={{ width: "100%", padding: "8px", background: "#0f2d1c", border: "1px solid #238636", color: "#3fb950", borderRadius: 6, cursor: savingRule ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}>
                {savingRule ? "Saving..." : "+ Create Alert Rule"}
              </button>
            </div>

            {/* Existing Rules */}
            <div style={{ fontSize: 10, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Your Rules ({alertRules.length})
            </div>

            {alertRules.length === 0 ? (
              <div style={{ color: "#484f58", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                No rules yet. Create one above.
              </div>
            ) : (
              alertRules.map(rule => {
                const vm = vms.find(v => v.id === rule.vm_id);
                return (
                  <div key={rule.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    marginBottom: 8, background: "#161b22",
                    border: `1px solid ${rule.enabled ? "#30363d" : "#21262d"}`,
                    borderRadius: 7, opacity: rule.enabled ? 1 : 0.55,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{rule.name}</div>
                      <div style={{ fontSize: 11, color: "#8b949e" }}>
                        {vm?.host || `VM #${rule.vm_id}`}
                        {" · "}
                        <span style={{ color: "#58a6ff" }}>{METRIC_LABELS[rule.metric]}</span>
                        {" "}
                        <span style={{ color: "#f87171", fontWeight: 700 }}>{OP_LABELS[rule.operator]} {rule.threshold}{METRIC_UNITS[rule.metric]}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button onClick={() => toggleRule(rule.id)}
                        style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontWeight: 600,
                          background: rule.enabled ? "#0f2d1c" : "#161b22",
                          border: `1px solid ${rule.enabled ? "#238636" : "#30363d"}`,
                          color: rule.enabled ? "#3fb950" : "#6b7280",
                        }}>
                        {rule.enabled ? "ON" : "OFF"}
                      </button>
                      <button onClick={() => deleteRule(rule.id)}
                        style={{ fontSize: 10, padding: "3px 10px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: "pointer" }}>
                        x
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
