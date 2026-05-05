import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api";

const packages = [
  "git","curl","wget","nano","vim","htop","bash","openssh","screen","tmux",
  "python3","py3-pip","nodejs","npm","docker","busybox-extras","jq","zip",
  "unzip","tree","rsync","tcpdump","net-tools","bind-tools","openssl","make","gcc","g++",
];

const CMD_CAT_COLORS = { sys:"#3b82f6", pkg:"#8b5cf6", net:"#06b6d4", file:"#f59e0b", proc:"#ef4444", diag:"#10b981", raw:"#6b7280" };

// Dark card style — overrides the white .card CSS background
const DC = { background: "#0d1117", border: "1px solid #21262d" };

function MetricBar({ label, value, max, unit, sub, color, history }) {
  const pct = Math.min((value / max) * 100, 100);
  const barColor = pct > 85 ? "#ef4444" : pct > 65 ? "#f59e0b" : color;
  const hMax = Math.max(...history.map(v => v ?? 0), max * 0.1);
  const W = 70, H = 24;
  const pts = history.map((v, i) => {
    const x = history.length <= 1 ? W : (i / (history.length - 1)) * W;
    const y = H - (v / hMax) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
        <div>
          <span style={{ fontSize:12, color:"#c9d1d9", fontWeight:600 }}>{label}</span>
          <span style={{ fontSize:10, color:"#484f58", marginLeft:8 }}>{sub}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {history.length > 1 && (
            <svg width={W} height={H} style={{ overflow:"visible" }}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.6" />
              {(() => { const ly = H - (history[history.length-1] / hMax) * (H-2) - 1; return <circle cx={W} cy={ly} r="2.5" fill={barColor} />; })()}
            </svg>
          )}
          <span style={{ fontSize:14, fontWeight:700, color:barColor, minWidth:52, textAlign:"right" }}>
            {value.toFixed(1)}{unit}
          </span>
        </div>
      </div>
      <div style={{ height:6, background:"#21262d", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:barColor, borderRadius:3, transition:"width 0.8s ease, background 0.3s", boxShadow: pct > 85 ? `0 0 8px ${barColor}88` : "none" }} />
      </div>
    </div>
  );
}

export default function MultiVM() {
  const navigate = useNavigate();
  const location = useLocation();
  const vmIds = location.state?.vmIds || [];

  // -- Core VM state --
  const [vms, setVms] = useState([]);
  const [vmStates, setVmStates] = useState({});
  const vmsRef = useRef([]);
  vmsRef.current = vms;

  // -- Broadcast --
  const [broadcastCmd, setBroadcastCmd] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState(null);
  const [broadcastExpandedHost, setBroadcastExpandedHost] = useState(null);

  // -- Workflow Builder --
  const wfDragSrcIdx = useRef(null);
  const [workflowItems, setWorkflowItems] = useState([]);
  const [wfDragOver, setWfDragOver] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowResults, setWorkflowResults] = useState([]);

  // -- Saved Workflows --
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [wfSaveName, setWfSaveName] = useState("");
  const [wfSaveDesc, setWfSaveDesc] = useState("");
  const [wfSaveTags, setWfSaveTags] = useState("");
  const [wfSaving, setWfSaving] = useState(false);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [wfSearchQuery, setWfSearchQuery] = useState("");

  // -- Job Scheduler --
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobInputMode, setJobInputMode] = useState("drag");
  const [jobScript, setJobScript] = useState("");
  const [jobDroppedCmd, setJobDroppedCmd] = useState(null);
  const [jobDragOver, setJobDragOver] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobType, setJobType] = useState("interval");
  const [jobRunAt, setJobRunAt] = useState("");
  const [jobIntervalValue, setJobIntervalValue] = useState(5);
  const [jobIntervalUnit, setJobIntervalUnit] = useState("minutes");
  const [jobCreating, setJobCreating] = useState(false);
  const [jobExpandedId, setJobExpandedId] = useState(null);

  // -- Command History --
  const [historyItems, setHistoryItems] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // -- Session name --
  const [sessionName, setSessionName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  // -- Release/disconnect --
  const [releasing, setReleasing] = useState(false);

  // -- Live broadcast progress (per VM) --
  const [liveProgress, setLiveProgress] = useState(null); // { command, vms: { [id]: "pending"|"running"|{ok,output,error} } }

  // -- Alerts --
  const [alertCount, setAlertCount] = useState(0);

  // -- Toast notifications --
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const addToast = useCallback((msg, type = "ok") => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // -- Broadcast results ref for scroll --
  const broadcastResultsRef = useRef(null);

  // ── Auth guard + load VMs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!localStorage.getItem("token")) { navigate("/login"); return; }
    if (vmIds.length === 0) { navigate("/dashboard"); return; }
    api.get("/vm/list").then(res => {
      const filtered = res.data.filter(v => vmIds.includes(v.id) && v.locked_by_me);
      if (filtered.length === 0) { navigate("/dashboard"); return; }
      setVms(filtered);
      // Persist this multi-VM group so dashboard can offer "Rejoin"
      localStorage.setItem("multiVmSession", JSON.stringify({ vmIds: filtered.map(v => v.id), sessionName: "" }));
      const init = {};
      filtered.forEach(vm => {
        init[vm.id] = { metrics: null, metricsHistory: [], metricsLoading: false, metricsError: null, cmd: "", cmdOut: null, cmdLoading: false };
      });
      setVmStates(init);
    }).catch(() => navigate("/dashboard"));
  }, []);

  // ── Metrics polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (vms.length === 0) return;
    vms.forEach(vm => fetchMetricsForVm(vm.id));
    const iv = setInterval(() => { vmsRef.current.forEach(vm => fetchMetricsForVm(vm.id)); }, 15000);
    return () => clearInterval(iv);
  }, [vms.length]);

  // ── Saved workflows ────────────────────────────────────────────────────────
  useEffect(() => { loadSavedWorkflows(); }, []);

  // ── Jobs polling ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (vms.length === 0) return;
    loadJobs();
    const iv = setInterval(loadJobs, 6000);
    return () => clearInterval(iv);
  }, [vms.length]);

  // ── Alert count polling ────────────────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => { try { const r = await api.get("/alerts/count"); setAlertCount(r.data.count); } catch { /* */ } };
    fetch();
    const iv = setInterval(fetch, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── History on open / filter change ───────────────────────────────────────
  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, historyFilter]);
  useEffect(() => {
    if (!showHistory) return;
    const t = setTimeout(() => loadHistory(), 400);
    return () => clearTimeout(t);
  }, [historySearch]);

  // ── Core functions ─────────────────────────────────────────────────────────

  const fetchMetricsForVm = async (vmId) => {
    setVmStates(prev => ({ ...prev, [vmId]: { ...(prev[vmId] || {}), metricsLoading: true, metricsError: null } }));
    try {
      const res = await api.get(`/vm/${vmId}/metrics`);
      setVmStates(prev => {
        const old = prev[vmId] || {};
        const history = [...(old.metricsHistory || []), { ...res.data, ts: Date.now() }].slice(-20);
        return { ...prev, [vmId]: { ...old, metrics: res.data, metricsHistory: history, metricsLoading: false, metricsError: null } };
      });
    } catch (err) {
      setVmStates(prev => ({ ...prev, [vmId]: { ...(prev[vmId] || {}), metricsLoading: false, metricsError: err.response?.data?.detail || "Metrics unavailable" } }));
    }
  };

  const runCommand = async (vm) => {
    const state = vmStates[vm.id];
    if (!state?.cmd?.trim() || state.cmdLoading) return;
    const command = state.cmd.trim();
    setVmStates(prev => ({ ...prev, [vm.id]: { ...prev[vm.id], cmdLoading: true, cmd: "", cmdOut: null } }));
    try {
      const res = await api.post("/vm/command", null, { params: { host: vm.host, command } });
      setVmStates(prev => ({ ...prev, [vm.id]: { ...prev[vm.id], cmdLoading: false, cmdOut: { command, output: res.data.output, error: res.data.error } } }));
      const success = !res.data.error;
      addToast(`${vm.host}: ${success ? "OK" : "Failed"} — ${command.slice(0, 40)}${command.length > 40 ? "..." : ""}`, success ? "ok" : "err");
      if (showHistory) loadHistory();
    } catch (err) {
      const msg = err.response?.data?.detail || "Command failed";
      setVmStates(prev => ({ ...prev, [vm.id]: { ...prev[vm.id], cmdLoading: false, cmdOut: { command, output: "", error: msg } } }));
      addToast(`${vm.host}: ${msg}`, "err");
    }
  };

  const runBroadcast = async (overrideCmd) => {
    const command = (overrideCmd !== undefined ? overrideCmd : broadcastCmd).trim();
    if (!command || broadcastLoading || workflowRunning) return;
    setBroadcastLoading(true);
    setBroadcastResults(null);
    setBroadcastExpandedHost(null);

    // Show live per-VM "running" state immediately
    const vmList = vmsRef.current;
    const initVms = {};
    vmList.forEach(v => { initVms[v.id] = "running"; });
    setLiveProgress({ command, vms: initVms });

    try {
      const res = await api.post("/vm/broadcast", { vm_ids: vmList.map(v => v.id), command });

      // Populate results per VM
      const finalVms = {};
      res.data.results.forEach(r => { finalVms[r.vm_id] = { ok: r.success, output: r.output, error: r.error }; });
      setLiveProgress({ command, vms: finalVms });
      setBroadcastResults(res.data);

      if (overrideCmd === undefined) setBroadcastCmd("");
      const ok = res.data.succeeded;
      const total = res.data.vm_count;
      addToast(`${ok}/${total} VMs: ${command.slice(0, 40)}${command.length > 40 ? "..." : ""}`, ok === total ? "ok" : ok === 0 ? "err" : "warn");

      if (showHistory) loadHistory();

    } catch (err) {
      setLiveProgress(null);
      addToast(err.response?.data?.detail || "Broadcast failed", "err");
    } finally {
      setBroadcastLoading(false);
    }
  };

  // ── Workflow Builder ────────────────────────────────────────────────────────

  const executeWorkflow = async () => {
    if (workflowItems.length === 0 || workflowRunning) return;
    setWorkflowRunning(true);
    setWorkflowResults([]);
    const items = [...workflowItems];
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      results.push({ ...item, status: "running", succeeded: 0, total: vmsRef.current.length });
      setWorkflowResults([...results]);
      try {
        const res = await api.post("/vm/broadcast", { vm_ids: vmsRef.current.map(v => v.id), command: item.cmd });
        results[i] = { ...item, status: "done", success: res.data.succeeded === res.data.vm_count, succeeded: res.data.succeeded, total: res.data.vm_count };
      } catch {
        results[i] = { ...item, status: "failed", success: false, succeeded: 0, total: vmsRef.current.length };
      }
      setWorkflowResults([...results]);
    }
    setWorkflowRunning(false);
    const passed = results.filter(r => r.success).length;
    addToast(`Workflow done: ${passed}/${results.length} steps passed`, passed === results.length ? "ok" : passed === 0 ? "err" : "warn");
    if (showHistory) loadHistory();
  };

  const loadSavedWorkflows = async () => {
    try { const res = await api.get("/workflows/"); setSavedWorkflows(res.data); } catch { /* */ }
  };

  const saveWorkflow = async () => {
    if (!wfSaveName.trim()) return alert("Enter a workflow name");
    if (workflowItems.length === 0) return alert("Add steps first");
    setWfSaving(true);
    try {
      await api.post("/workflows/", {
        name: wfSaveName.trim(), description: wfSaveDesc.trim() || null,
        steps: workflowItems.map(({ label, cmd, cat }) => ({ label, cmd, cat })),
        tags: wfSaveTags.trim() || null,
      });
      setWfSaveName(""); setWfSaveDesc(""); setWfSaveTags(""); setShowSaveForm(false);
      loadSavedWorkflows();
    } catch (err) { alert(err.response?.data?.detail || "Save failed"); }
    finally { setWfSaving(false); }
  };

  const loadWorkflowIntoBuilder = (wf) => {
    setWorkflowItems(JSON.parse(wf.steps).map(s => ({ ...s, id: `${Date.now()}_${Math.random()}` })));
    setWorkflowResults([]);
    setShowSavedPanel(false);
  };

  const runSavedWorkflow = async (wf) => {
    if (workflowRunning) return;
    const steps = JSON.parse(wf.steps).map(s => ({ ...s, id: `${Date.now()}_${Math.random()}` }));
    setWorkflowItems(steps);
    setWorkflowResults([]);
    setShowSavedPanel(false);
    api.post(`/workflows/${wf.id}/run`).catch(() => {});
    setWorkflowRunning(true);
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const item = steps[i];
      results.push({ ...item, status: "running", succeeded: 0, total: vmsRef.current.length });
      setWorkflowResults([...results]);
      try {
        const res = await api.post("/vm/broadcast", { vm_ids: vmsRef.current.map(v => v.id), command: item.cmd });
        results[i] = { ...item, status: "done", success: res.data.succeeded === res.data.vm_count, succeeded: res.data.succeeded, total: res.data.vm_count };
      } catch {
        results[i] = { ...item, status: "failed", success: false, succeeded: 0, total: vmsRef.current.length };
      }
      setWorkflowResults([...results]);
    }
    setWorkflowRunning(false);
    const passed = results.filter(r => r.success).length;
    addToast(`Workflow done: ${passed}/${results.length} steps passed`, passed === results.length ? "ok" : passed === 0 ? "err" : "warn");
    if (showHistory) loadHistory();
    loadSavedWorkflows();
  };

  const deleteWorkflow = async (id) => {
    try { await api.delete(`/workflows/${id}`); loadSavedWorkflows(); } catch { /* */ }
  };

  // ── Job Scheduler ──────────────────────────────────────────────────────────

  const loadJobs = async () => {
    if (vmsRef.current.length === 0) return;
    setJobsLoading(true);
    try {
      const all = await Promise.all(vmsRef.current.map(vm => api.get(`/jobs/vm/${vm.id}`)));
      setJobs(all.flatMap(r => r.data));
    } catch { /* */ } finally { setJobsLoading(false); }
  };

  const createJob = async () => {
    const script = jobInputMode === "drag" ? (jobDroppedCmd ? jobDroppedCmd.cmd : "") : jobScript.trim();
    if (!script) return alert("No command or script provided");
    if (!jobName.trim()) return alert("Please enter a job name");
    if (jobType === "once" && !jobRunAt) return alert("Please select a run time");
    setJobCreating(true);
    try {
      await Promise.all(vmsRef.current.map(vm => api.post("/jobs/", {
        vm_id: vm.id, name: jobName.trim(), script, job_type: jobType,
        ...(jobType === "once"
          ? { run_at: new Date(jobRunAt).toISOString() }
          : { interval_value: Number(jobIntervalValue), interval_unit: jobIntervalUnit }),
      })));
      setJobName(""); setJobScript(""); setJobDroppedCmd(null); setJobRunAt("");
      setJobIntervalValue(5); setJobIntervalUnit("minutes"); setJobType("interval");
      loadJobs();
    } catch (err) { alert(err.response?.data?.detail || "Failed to create job"); }
    finally { setJobCreating(false); }
  };

  const deleteJob = async (id) => { try { await api.delete(`/jobs/${id}`); loadJobs(); } catch { /* */ } };
  const runJobNow = async (id) => { try { await api.post(`/jobs/${id}/run`); setTimeout(loadJobs, 1200); } catch { /* */ } };
  const cancelJobSched = async (id) => { try { await api.patch(`/jobs/${id}/cancel`); loadJobs(); } catch { /* */ } };

  // ── Command History ────────────────────────────────────────────────────────

  const loadHistory = async () => {
    if (vmsRef.current.length === 0) return;
    setHistoryLoading(true);
    try {
      const all = await Promise.all(vmsRef.current.map(vm => {
        const p = new URLSearchParams({ limit: 30, offset: 0, vm_id: vm.id });
        if (historyFilter === "success") p.set("success", "true");
        if (historyFilter === "failed") p.set("success", "false");
        if (historySearch.trim()) p.set("search", historySearch.trim());
        return api.get(`/history/?${p}`).then(r => r.data).catch(() => []);
      }));
      const merged = all.flat().sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
      setHistoryItems(merged);
    } catch { /* */ } finally { setHistoryLoading(false); }
  };

  const clearHistory = async () => {
    if (!window.confirm(`Clear command history for all ${vms.length} VMs?`)) return;
    try {
      await Promise.all(vmsRef.current.map(vm => api.delete(`/history/clear?vm_id=${vm.id}`)));
      setHistoryItems([]);
    } catch { /* */ }
  };

  // ── Release All VMs ────────────────────────────────────────────────────────
  const releaseAllVMs = async () => {
    if (!window.confirm(`Release all ${vms.length} VMs? This will disconnect them for other users.`)) return;
    setReleasing(true);
    try {
      await Promise.all(vmsRef.current.map(vm => api.post("/vm/disconnect", { host: vm.host }).catch(() => {})));
      localStorage.removeItem("multiVmSession");
      addToast(`Released ${vms.length} VMs`, "ok");
      navigate("/dashboard");
    } catch (err) {
      addToast(err.response?.data?.detail || "Release failed", "err");
    } finally {
      setReleasing(false);
    }
  };

  // Track when this multi-VM page was opened (for report duration)
  const sessionStartRef = useRef(Date.now());

  // ── Disconnect + generate report + release ─────────────────────────────────
  const disconnectAndRelease = async () => {
    if (!window.confirm(`Disconnect, generate report, and release all ${vms.length} VMs?`)) return;
    setReleasing(true);
    const now = Date.now();
    try {
      // Fetch full history for all VMs
      const allHistory = await Promise.all(
        vmsRef.current.map(vm =>
          api.get(`/history/?${new URLSearchParams({ limit: 500, offset: 0, vm_id: vm.id })}`).then(r => r.data).catch(() => [])
        )
      );
      const combined = allHistory.flat().sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at));
      const totalCmds = combined.length;
      const successCmds = combined.filter(h => h.success).length;
      const totalMs = combined.reduce((s, h) => s + (h.execution_time_ms || 0), 0);
      const avgMs = totalCmds > 0 ? totalMs / totalCmds : 0;

      // Use earliest history entry as session start, fallback to page-open time
      const sessionStart = combined.length > 0
        ? new Date(combined[0].executed_at + (combined[0].executed_at.endsWith("Z") ? "" : "Z")).getTime()
        : sessionStartRef.current;
      const duration = now - sessionStart;

      const reportPayload = {
        session_id: `MULTI-${vmsRef.current.map(v => v.id).join("-")}-${now}`,
        vm_id: vmsRef.current[0].id,
        session_name: sessionName.trim() || `Multi-VM (${vmsRef.current.map(v => v.host).join(", ")})`,
        vm_host: vmsRef.current.map(v => v.host).join(", "),
        start_time: new Date(sessionStart).toISOString(),
        end_time: new Date(now).toISOString(),
        duration: Math.max(duration, 1000),
        total_commands: totalCmds,
        successful_commands: successCmds,
        failed_commands: totalCmds - successCmds,
        success_rate: totalCmds > 0 ? parseFloat(((successCmds / totalCmds) * 100).toFixed(1)) : 0,
        average_execution_time: parseFloat(avgMs.toFixed(0)),
        commands: combined.map(h => ({
          command: h.command,
          timestamp: new Date(h.executed_at + (h.executed_at.endsWith("Z") ? "" : "Z")).getTime(),
          executionTime: h.execution_time_ms || 0,
          success: h.success,
        })),
      };

      try {
        await api.post("/reports/", reportPayload);
        addToast(`Report saved: ${totalCmds} commands, ${successCmds} succeeded`, "ok");
      } catch (reportErr) {
        // If duplicate session_id, still continue with release
        const detail = reportErr.response?.data?.detail || "";
        if (!detail.includes("already exists")) {
          addToast(`Report save failed: ${detail}`, "warn");
        }
      }

      await Promise.all(vmsRef.current.map(vm => api.post("/vm/disconnect", { host: vm.host }).catch(() => {})));
      localStorage.removeItem("multiVmSession");
      navigate("/dashboard");
    } catch (err) {
      addToast(err.response?.data?.detail || "Disconnect failed", "err");
      setReleasing(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (vms.length === 0) {
    return <div className="app" style={{ padding: 40, color: "#8b949e" }}>Loading VMs...</div>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app">

      {/* ── TOAST LAYER ── */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, maxWidth: 340,
            background: t.type === "ok" ? "#051a12" : t.type === "err" ? "#1c0a0a" : "#1a1205",
            border: `1px solid ${t.type === "ok" ? "#065f46" : t.type === "err" ? "#7f1d1d" : "#78350f"}`,
            color: t.type === "ok" ? "#3fb950" : t.type === "err" ? "#f87171" : "#f59e0b",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            animation: "slideIn 0.2s ease",
          }}>
            {t.type === "ok" ? "✓ " : t.type === "err" ? "✗ " : "⚠ "}{t.msg}
          </div>
        ))}
      </div>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <h2 style={{ color: "#22c55e" }}>Multi-VM</h2>

        <div className="nav-item" onClick={() => navigate("/dashboard")}>
          &larr; Dashboard
        </div>

        {/* Session name */}
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#0d1117", border: "1px solid #21262d", borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Session Name</div>
          {showNameInput ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input value={sessionName} onChange={e => setSessionName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setShowNameInput(false); if (e.key === "Escape") setShowNameInput(false); }}
                placeholder="e.g. Benchmark 3 VMs"
                autoFocus
                style={{ flex: 1, background: "#010409", border: "1px solid #30363d", borderRadius: 4, padding: "4px 8px", color: "#c9d1d9", fontSize: 11, outline: "none" }} />
              <button onClick={() => setShowNameInput(false)} style={{ background: "#1c2a1c", border: "1px solid #238636", color: "#3fb950", borderRadius: 4, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>OK</button>
            </div>
          ) : (
            <div onClick={() => setShowNameInput(true)} style={{ cursor: "pointer", color: sessionName ? "#c9d1d9" : "#484f58", fontSize: 12, padding: "2px 0" }}>
              {sessionName || "Click to name session..."}
            </div>
          )}
        </div>

        {/* Release / Disconnect buttons — right below session name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          <button onClick={releaseAllVMs} disabled={releasing}
            style={{ padding: "7px 12px", background: "#1c1505", border: "1px solid #78350f", color: "#f59e0b", borderRadius: 7, cursor: releasing ? "default" : "pointer", fontSize: 11, fontWeight: 600, opacity: releasing ? 0.6 : 1, textAlign: "left" }}>
            {releasing ? "Releasing..." : `Release All ${vms.length} VMs`}
          </button>
          <button onClick={disconnectAndRelease} disabled={releasing}
            style={{ padding: "7px 12px", background: "#1c0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 7, cursor: releasing ? "default" : "pointer", fontSize: 11, fontWeight: 600, opacity: releasing ? 0.6 : 1, textAlign: "left" }}>
            {releasing ? "Working..." : "Disconnect + Report + Release"}
          </button>
        </div>

        {/* VM list */}
        <div style={{ marginTop: 14, padding: "12px 14px", background: "#0d1117", border: "1px solid #21262d", borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Active VMs ({vms.length})
          </div>
          {vms.map(vm => {
            const state = vmStates[vm.id] || {};
            return (
              <div key={vm.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid #161b22" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: state.metricsError ? "#ef4444" : state.metrics ? "#22c55e" : "#484f58", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#c9d1d9", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vm.host}</span>
                {state.metrics && <span style={{ fontSize: 9, color: "#6b7280" }}>{state.metrics.memory_pct.toFixed(0)}%</span>}
              </div>
            );
          })}
        </div>

        {/* Alert bell */}
        <div onClick={() => navigate("/dashboard")} title="View alerts"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", margin: "12px 0 0", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${alertCount > 0 ? "#78350f" : "#21262d"}`, color: alertCount > 0 ? "#f59e0b" : "#6b7280" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: alertCount > 0 ? 700 : 400 }}>Alerts</span>
          {alertCount > 0 && (
            <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>{alertCount}</span>
          )}
        </div>

        {/* Workflow running indicator */}
        {workflowRunning && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#051a12", border: "1px solid #065f46", borderRadius: 8 }}>
            <div style={{ fontSize: 9, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Workflow Running</div>
            <div style={{ fontSize: 11, color: "#c9d1d9" }}>
              {workflowResults.filter(r => r.status === "done").length} / {workflowItems.length} steps done
            </div>
          </div>
        )}

      </aside>

      {/* ── MAIN ── */}
      {/* Layout: 4-col grid (each unit = 25%). Rows:
            1) Broadcast      — col 1-4 (full)
            2) InstallPkg     — col 1-3  |  SysOps   — col 3-4  (stretch to equal height)
            3) Workflow       — col 1-3  |  Jobs      — col 3-4  (stretch to equal height)
            4) VM cards       — col 1-4 (full, inner flex-wrap)  above Command History
            5) CmdHistory     — col 1-4 (full)                                          */}
      <main className="main" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, overflowY: "auto", alignItems: "start" }}>

        {/* ── BROADCAST COMMAND ── Row 1: full width */}
        <div className="card" style={{ ...DC, gridColumn: "1 / -1", gridRow: "1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: "#e6edf3" }}>Broadcast Command</h3>
            <span style={{ fontSize: 10, color: "#f59e0b", background: "#1a1205", border: "1px solid #78350f", borderRadius: 10, padding: "2px 9px" }}>
              {vms.length} VM{vms.length !== 1 ? "s" : ""} in parallel
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              value={broadcastCmd}
              onChange={e => setBroadcastCmd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runBroadcast()}
              placeholder="Run this command on ALL VMs simultaneously..."
              style={{ flex: 1, background: "#010409", border: "1px solid #30363d", borderRadius: 6, padding: "9px 14px", color: "#c9d1d9", fontSize: 13, fontFamily: "monospace", outline: "none" }}
            />
            <button onClick={() => runBroadcast()} disabled={broadcastLoading || !broadcastCmd.trim() || workflowRunning}
              style={{ padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: "#0d1b2e", border: "1px solid #1d4ed8", color: "#58a6ff",
                opacity: broadcastLoading || !broadcastCmd.trim() || workflowRunning ? 0.4 : 1 }}>
              {broadcastLoading ? "Running..." : "Run All"}
            </button>
          </div>

          {/* Quick pick */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["uptime","df -h","free -m","cat /proc/loadavg","ps aux | head -10","uname -a","hostname"].map(c => (
              <button key={c} onClick={() => setBroadcastCmd(c)}
                style={{ fontSize: 10, padding: "2px 9px", background: "#161b22", border: "1px solid #30363d", color: "#8b949e", borderRadius: 4, cursor: "pointer", fontFamily: "monospace" }}>
                {c}
              </button>
            ))}
          </div>

          {/* Live per-VM progress panel */}
          {liveProgress && (
            <div ref={broadcastResultsRef} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #21262d" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600 }}>
                  {broadcastLoading ? "Running on all VMs..." : "Results"}
                </span>
                {!broadcastLoading && broadcastResults && (
                  <span style={{ fontSize: 11, color: broadcastResults.succeeded === broadcastResults.vm_count ? "#10b981" : "#f59e0b" }}>
                    {broadcastResults.succeeded}/{broadcastResults.vm_count} succeeded
                  </span>
                )}
                <code style={{ fontSize: 10, color: "#484f58" }}>$ {liveProgress.command}</code>
                <button onClick={() => { setLiveProgress(null); setBroadcastResults(null); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>&times;</button>
              </div>
              {vms.map(vm => {
                const st = liveProgress.vms[vm.id];
                const isRunning = st === "running";
                const isDone = st && typeof st === "object";
                const ok = isDone && st.ok;
                return (
                  <div key={vm.id} style={{ marginBottom: 6, borderRadius: 6, overflow: "hidden", border: `1px solid ${isRunning ? "#1d4ed8" : ok ? "#065f46" : isDone ? "#7f1d1d" : "#21262d"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: isRunning ? "#0d1f33" : ok ? "#051a12" : isDone ? "#1c0a0a" : "#0d1117", cursor: isDone ? "pointer" : "default" }}
                      onClick={() => isDone && setBroadcastExpandedHost(prev => prev === vm.host ? null : vm.host)}>
                      {isRunning ? (
                        <span style={{ color: "#58a6ff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#58a6ff", animation: "pulse 1s infinite" }} />
                          RUNNING
                        </span>
                      ) : isDone ? (
                        <span style={{ color: ok ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 700 }}>{ok ? "✓ OK" : "✗ FAIL"}</span>
                      ) : (
                        <span style={{ color: "#484f58", fontSize: 11 }}>PENDING</span>
                      )}
                      <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace", flex: 1, fontWeight: 600 }}>{vm.host}</span>
                      {isDone && <span style={{ fontSize: 9, color: "#484f58" }}>{broadcastExpandedHost === vm.host ? "hide" : "show output"}</span>}
                    </div>
                    {isDone && broadcastExpandedHost === vm.host && (
                      <pre style={{ background: "#010409", margin: 0, padding: "8px 12px", fontSize: 10, color: ok ? "#8b949e" : "#f87171", maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {st.error && !st.output ? st.error : st.output || "(no output)"}
                      </pre>
                    )}
                  </div>
                );
              })}
              {broadcastResults?.skipped?.length > 0 && (
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, padding: "8px 12px", background: "#1c1505", border: "1px solid #78350f", borderRadius: 6 }}>
                  Skipped {broadcastResults.skipped.length}: {broadcastResults.skipped.map(s => s.host || `VM #${s.vm_id}`).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SYSTEM OPERATIONS ── Row 2: right half */}
        <div className="card" style={{ ...DC, padding: "14px 16px", gridColumn: "3 / 5", gridRow: "2", alignSelf: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h3 style={{ margin: 0, color: "#e6edf3" }}>System Operations</h3>
            <span style={{ fontSize: 10, color: "#6b7280" }}>runs on all {vms.length} VMs</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="warn" onClick={() => { if (window.confirm(`Reboot all ${vms.length} VMs?`)) runBroadcast("reboot"); }}>
              Reboot All
            </button>
            <button className="danger" onClick={() => { if (window.confirm(`Power off all ${vms.length} VMs?`)) runBroadcast("poweroff"); }}>
              Power Off All
            </button>
          </div>
        </div>

        {/* ── INSTALL PACKAGES ── Row 2: left half — must come first in DOM so grid places it col 1 */}
        <div className="card" style={{ ...DC, padding: "14px 16px", gridColumn: "1 / 3", gridRow: "2", alignSelf: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h3 style={{ margin: 0, color: "#e6edf3" }}>Install Packages</h3>
            <span style={{ fontSize: 10, color: "#6b7280" }}>via apk on all {vms.length} VMs</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {packages.map(p => (
              <button key={p} className="primary" disabled={broadcastLoading}
                style={{ fontSize: 11, padding: "4px 10px", opacity: broadcastLoading ? 0.5 : 1 }}
                onClick={() => runBroadcast(`apk add ${p}`)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* ── WORKFLOW BUILDER ── Row 3: left half */}
        <div className="card" style={{ ...DC, gridColumn: "1 / 3", gridRow: "3", alignSelf: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: "#e6edf3" }}>Workflow Builder</h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{workflowItems.length} step{workflowItems.length !== 1 ? "s" : ""}</span>
              {workflowItems.length > 0 && !workflowRunning && (
                <button onClick={() => setShowSaveForm(s => !s)}
                  style={{ fontSize: 10, padding: "2px 8px", background: showSaveForm ? "#1c2a1c" : "#21262d", border: `1px solid ${showSaveForm ? "#238636" : "#30363d"}`, color: showSaveForm ? "#3fb950" : "#8b949e", borderRadius: 4, cursor: "pointer" }}>
                  {showSaveForm ? "Cancel" : "Save"}
                </button>
              )}
              <button onClick={() => setShowSavedPanel(s => !s)}
                style={{ fontSize: 10, padding: "2px 8px", background: showSavedPanel ? "#0d1b2e" : "#21262d", border: `1px solid ${showSavedPanel ? "#1d4ed8" : "#30363d"}`, color: showSavedPanel ? "#58a6ff" : "#8b949e", borderRadius: 4, cursor: "pointer" }}>
                My Workflows {savedWorkflows.length > 0 ? `(${savedWorkflows.length})` : ""}
              </button>
              {workflowItems.length > 0 && !workflowRunning && (
                <button onClick={() => { setWorkflowItems([]); setWorkflowResults([]); }}
                  style={{ fontSize: 10, padding: "2px 8px", background: "#21262d", border: "1px solid #30363d", color: "#8b949e", borderRadius: 4, cursor: "pointer" }}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, padding: "8px 12px", background: "#010409", border: "1px solid #21262d", borderRadius: 6 }}>
            Each step broadcasts to <strong style={{ color: "#e6edf3" }}>all {vms.length} VMs</strong> before the next step runs.
          </div>

          {/* Command palette */}
          <div style={{ marginBottom: 14, padding: "10px 12px", background: "#010409", border: "1px solid #21262d", borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Drag commands into the queue below
            </div>

            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", marginRight: 8 }}>System</span>
              {[
                { label:"Status",    cmd:"hostname && uptime && free -m && df -h", cat:"sys" },
                { label:"Uptime",    cmd:"uptime",                                 cat:"sys" },
                { label:"Memory",    cmd:"free -m",                                cat:"sys" },
                { label:"CPU Load",  cmd:"cat /proc/loadavg",                      cat:"sys" },
                { label:"Disk",      cmd:"df -h",                                  cat:"sys" },
                { label:"Hostname",  cmd:"hostname",                               cat:"sys" },
              ].map(item => (
                <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("wf-new", JSON.stringify(item))}
                  style={{ display:"inline-block", cursor:"grab", background:"#0d1b2e", border:"1px solid #1d4ed8", color:"#60a5fa", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                  {item.label}
                </span>
              ))}
            </div>

            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: "#06b6d4", fontWeight: 700, textTransform: "uppercase", marginRight: 8 }}>Network</span>
              {[
                { label:"Ping 8.8.8.8", cmd:"ping -c 4 8.8.8.8", cat:"net" },
                { label:"Interfaces",   cmd:"ip addr show",       cat:"net" },
                { label:"Open Ports",   cmd:"ss -tlnp",           cat:"net" },
                { label:"Routes",       cmd:"ip route",           cat:"net" },
              ].map(item => (
                <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("wf-new", JSON.stringify(item))}
                  style={{ display:"inline-block", cursor:"grab", background:"#071e26", border:"1px solid #0e7490", color:"#22d3ee", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                  {item.label}
                </span>
              ))}
            </div>

            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: "#10b981", fontWeight: 700, textTransform: "uppercase", marginRight: 8 }}>Diagnostics</span>
              {[
                { label:"Health Report", cmd:"hostname && uptime && free -m && df -h", cat:"diag" },
                { label:"Processes",     cmd:"ps aux | head -20",                       cat:"proc" },
                { label:"Top CPU",       cmd:"ps aux --sort=-%cpu | head -10",          cat:"proc" },
                { label:"Sys Logs",      cmd:"tail -50 /var/log/syslog 2>/dev/null || journalctl -n 50 2>/dev/null || dmesg | tail -50", cat:"diag" },
              ].map(item => (
                <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("wf-new", JSON.stringify(item))}
                  style={{ display:"inline-block", cursor:"grab", background:"#051a12", border:"1px solid #065f46", color:"#34d399", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                  {item.label}
                </span>
              ))}
            </div>

            <div>
              <span style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, textTransform: "uppercase", marginRight: 8 }}>Packages</span>
              {packages.map(p => (
                <span key={p} draggable onDragStart={e => e.dataTransfer.setData("wf-new", JSON.stringify({ label: "install " + p, cmd: "apk add " + p, cat: "pkg" }))}
                  style={{ display:"inline-block", cursor:"grab", background:"#110c1e", border:"1px solid #5b21b6", color:"#c4b5fd", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setWfDragOver(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setWfDragOver(false); }}
            onDrop={e => {
              e.preventDefault(); setWfDragOver(false);
              const raw = e.dataTransfer.getData("wf-new");
              if (raw) { try { const item = JSON.parse(raw); setWorkflowItems(prev => [...prev, { ...item, id: `${Date.now()}_${Math.random()}` }]); } catch { /* */ } }
            }}
            style={{ minHeight: 90, border: `2px dashed ${wfDragOver ? "#3b82f6" : "#30363d"}`, borderRadius: 6, padding: "10px 12px", background: wfDragOver ? "#0d1f33" : "#0d1117", transition: "all 0.15s", marginBottom: 14 }}>
            {workflowItems.length === 0 ? (
              <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "18px 0", userSelect: "none" }}>
                Drop commands here to build your workflow
              </div>
            ) : workflowItems.map((item, idx) => {
              const CC = { sys:"#3b82f6", pkg:"#8b5cf6", net:"#06b6d4", file:"#f59e0b", proc:"#ef4444", diag:"#10b981", raw:"#6b7280" };
              const r = workflowResults[idx];
              const isCurrent = r && r.status === "running";
              const isDone = r && r.status === "done";
              return (
                <div key={item.id}
                  draggable={!workflowRunning}
                  onDragStart={e => { if (workflowRunning) return; wfDragSrcIdx.current = idx; e.dataTransfer.setData("wf-reorder", String(idx)); }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation();
                    const raw = e.dataTransfer.getData("wf-new");
                    if (raw) { try { const ni = JSON.parse(raw); setWorkflowItems(prev => { const a = [...prev]; a.splice(idx, 0, { ...ni, id: `${Date.now()}_${Math.random()}` }); return a; }); } catch { /* */ } return; }
                    const from = wfDragSrcIdx.current;
                    if (from === null || from === idx) return;
                    setWorkflowItems(prev => { const a = [...prev]; const [m] = a.splice(from, 1); a.splice(idx, 0, m); return a; });
                    wfDragSrcIdx.current = null;
                  }}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", marginBottom:4, background: isDone ? (r.success ? "#051a12" : "#1c0a0a") : isCurrent ? "#0d1f33" : "#161b22", border:`1px solid ${isDone ? (r.success ? "#065f46" : "#7f1d1d") : isCurrent ? "#1d4ed8" : "#30363d"}`, borderRadius:5, cursor: workflowRunning ? "default" : "grab", transition:"all 0.2s" }}>
                  <span style={{ color:"#484f58", fontSize:11, minWidth:20 }}>{idx + 1}.</span>
                  <span style={{ background: CC[item.cat] || "#6b7280", color:"#fff", fontSize:8, padding:"1px 6px", borderRadius:3, fontWeight:700, textTransform:"uppercase" }}>{item.cat}</span>
                  <span style={{ color:"#e6edf3", fontSize:12, flex:1, fontWeight:500 }}>{item.label}</span>
                  <span style={{ color:"#484f58", fontSize:10, fontFamily:"monospace" }}>{item.cmd.length > 35 ? item.cmd.slice(0, 35) + "..." : item.cmd}</span>
                  {isCurrent && <span style={{ color:"#58a6ff", fontSize:10 }}>running...</span>}
                  {isDone && <span style={{ color: r.success ? "#10b981" : "#f59e0b", fontSize:10, fontWeight:600 }}>{r.succeeded}/{r.total}</span>}
                  {!workflowRunning && (
                    <button onClick={() => setWorkflowItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background:"none", border:"none", color:"#484f58", cursor:"pointer", fontSize:15, lineHeight:1, padding:"0 2px" }}>
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Execute */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button disabled={workflowItems.length === 0 || workflowRunning} onClick={executeWorkflow}
              style={{ padding: "8px 18px", background: workflowItems.length === 0 || workflowRunning ? "#1a1a1a" : "#1c2a1c", border: `1px solid ${workflowItems.length === 0 || workflowRunning ? "#21262d" : "#238636"}`, color: workflowItems.length === 0 || workflowRunning ? "#484f58" : "#3fb950", borderRadius: 6, cursor: workflowItems.length === 0 || workflowRunning ? "default" : "pointer", fontSize: 12, fontWeight: 600 }}>
              {workflowRunning
                ? `Running ${workflowResults.filter(r => r.status === "done").length}/${workflowItems.length}...`
                : `Run Workflow on ${vms.length} VMs (${workflowItems.length} step${workflowItems.length !== 1 ? "s" : ""})`}
            </button>
            {workflowResults.length > 0 && !workflowRunning && (
              <span style={{ fontSize: 11, color: workflowResults.every(r => r.success) ? "#10b981" : "#f59e0b", fontWeight: 600 }}>
                {workflowResults.filter(r => r.success).length}/{workflowResults.length} steps fully passed
              </span>
            )}
          </div>

          {/* Workflow output */}
          {workflowResults.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #21262d", paddingTop: 12 }}>
              <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Workflow Output</div>
              {workflowResults.map((r, i) => (
                <div key={i} style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#484f58", fontSize: 11, minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ color: r.status === "running" ? "#58a6ff" : r.success ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 700, minWidth: 32 }}>
                    {r.status === "running" ? "..." : r.success ? "OK" : "FAIL"}
                  </span>
                  <span style={{ color: "#c9d1d9", fontSize: 12, flex: 1 }}>{r.label}</span>
                  {r.status === "done" && (
                    <span style={{ color: r.success ? "#10b981" : "#f59e0b", fontSize: 10 }}>{r.succeeded}/{r.total} VMs</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Save form */}
          {showSaveForm && (
            <div style={{ marginTop: 14, padding: 14, background: "#010409", border: "1px solid #238636", borderRadius: 8 }}>
              <div style={{ fontSize: 9, color: "#3fb950", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 700 }}>Save Current Workflow</div>
              <input value={wfSaveName} onChange={e => setWfSaveName(e.target.value)} placeholder="Workflow name"
                style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "7px 10px", color: "#c9d1d9", fontSize: 13, boxSizing: "border-box", outline: "none", marginBottom: 8 }} />
              <input value={wfSaveDesc} onChange={e => setWfSaveDesc(e.target.value)} placeholder="Description (optional)"
                style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "7px 10px", color: "#c9d1d9", fontSize: 12, boxSizing: "border-box", outline: "none", marginBottom: 8 }} />
              <input value={wfSaveTags} onChange={e => setWfSaveTags(e.target.value)} placeholder="Tags (optional)"
                style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "7px 10px", color: "#c9d1d9", fontSize: 12, boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
              <button onClick={saveWorkflow} disabled={wfSaving}
                style={{ padding: "6px 16px", background: "#1c2a1c", border: "1px solid #238636", color: "#3fb950", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: wfSaving ? 0.6 : 1 }}>
                {wfSaving ? "Saving..." : "Save Workflow"}
              </button>
            </div>
          )}

          {/* Saved workflows panel */}
          {showSavedPanel && (
            <div style={{ marginTop: 14, padding: 14, background: "#010409", border: "1px solid #1d4ed8", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 9, color: "#58a6ff", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Saved Workflows</span>
                <span style={{ fontSize: 10, color: "#6b7280", background: "#21262d", borderRadius: 10, padding: "1px 8px" }}>{savedWorkflows.length}</span>
                <input value={wfSearchQuery} onChange={e => setWfSearchQuery(e.target.value)} placeholder="Search..."
                  style={{ marginLeft: "auto", background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "3px 10px", color: "#c9d1d9", fontSize: 11, outline: "none", width: 120 }} />
              </div>
              {savedWorkflows.length === 0 ? (
                <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "16px 0" }}>No saved workflows yet. Build one above and click Save.</div>
              ) : savedWorkflows
                .filter(wf => !wfSearchQuery || wf.name.toLowerCase().includes(wfSearchQuery.toLowerCase()) || (wf.tags || "").toLowerCase().includes(wfSearchQuery.toLowerCase()))
                .map(wf => {
                  let steps = []; try { steps = JSON.parse(wf.steps); } catch { /* */ }
                  const cats = [...new Set(steps.map(s => s.cat))];
                  const catColors = { sys:"#3b82f6", pkg:"#8b5cf6", net:"#06b6d4", proc:"#ef4444", diag:"#10b981", raw:"#6b7280" };
                  return (
                    <div key={wf.id} style={{ marginBottom: 8, background: "#0d1117", border: "1px solid #21262d", borderRadius: 7, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600 }}>{wf.name}</span>
                            {cats.map(c => (
                              <span key={c} style={{ fontSize: 8, background: catColors[c] || "#6b7280", color: "#fff", borderRadius: 3, padding: "1px 5px", fontWeight: 700, textTransform: "uppercase" }}>{c}</span>
                            ))}
                          </div>
                          {wf.description && <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{wf.description}</div>}
                          <div style={{ color: "#484f58", fontSize: 10, marginTop: 3 }}>{steps.length} step{steps.length !== 1 ? "s" : ""} &bull; ran {wf.run_count}x</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                        <button onClick={() => runSavedWorkflow(wf)} disabled={workflowRunning}
                          style={{ fontSize: 10, padding: "3px 10px", background: "#0d1b2e", border: "1px solid #1d4ed8", color: workflowRunning ? "#484f58" : "#58a6ff", borderRadius: 4, cursor: workflowRunning ? "default" : "pointer", fontWeight: 600 }}>
                          Run All VMs
                        </button>
                        <button onClick={() => loadWorkflowIntoBuilder(wf)}
                          style={{ fontSize: 10, padding: "3px 10px", background: "#161b22", border: "1px solid #30363d", color: "#c9d1d9", borderRadius: 4, cursor: "pointer" }}>
                          Load
                        </button>
                        <button onClick={() => { if (confirm(`Delete "${wf.name}"?`)) deleteWorkflow(wf.id); }}
                          style={{ fontSize: 10, padding: "3px 10px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: "pointer", marginLeft: "auto" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── JOB SCHEDULER ── Row 3: right half */}
        <div className="card" style={{ ...DC, gridColumn: "3 / 5", gridRow: "3", alignSelf: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0, color: "#e6edf3" }}>Job Scheduler</h3>
              <span style={{ fontSize: 10, color: "#6b7280", background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "2px 9px" }}>
                {jobs.filter(j => j.status !== "cancelled" && !(j.job_type === "once" && j.status === "completed")).length} active
              </span>
            </div>
          </div>

          {/* New job form */}
          <div style={{ background: "#010409", border: "1px solid #21262d", borderRadius: 8, padding: "14px", marginBottom: 18 }}>
            <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              New Scheduled Job &mdash; runs on all {vms.length} VMs
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {[["drag","Drag & Drop"],["script","Paste Script"]].map(([mode, label]) => (
                <button key={mode} onClick={() => setJobInputMode(mode)}
                  style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, cursor: "pointer", fontWeight: jobInputMode === mode ? 700 : 400,
                    background: jobInputMode === mode ? "#1c2a1c" : "#161b22", border: `1px solid ${jobInputMode === mode ? "#238636" : "#30363d"}`, color: jobInputMode === mode ? "#3fb950" : "#8b949e" }}>
                  {label}
                </button>
              ))}
            </div>

            {jobInputMode === "drag" ? (
              <div>
                <div style={{ marginBottom: 10, padding: "10px", background: "#0d1117", border: "1px solid #21262d", borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Drag a command to schedule it</div>
                  <div style={{ marginBottom: 7 }}>
                    <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", marginRight: 6 }}>Monitor</span>
                    {[
                      { label:"CPU Usage", cmd:"cat /proc/loadavg", cat:"sys" },
                      { label:"Memory",    cmd:"free -m",           cat:"sys" },
                      { label:"Disk",      cmd:"df -h",             cat:"sys" },
                      { label:"Uptime",    cmd:"uptime",            cat:"sys" },
                    ].map(item => (
                      <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("job-cmd", JSON.stringify(item))}
                        style={{ display:"inline-block", cursor:"grab", background:"#2a1f00", border:"1px solid #78350f", color:"#fbbf24", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginBottom: 7 }}>
                    <span style={{ fontSize: 9, color: "#06b6d4", fontWeight: 700, textTransform: "uppercase", marginRight: 6 }}>Network</span>
                    {[
                      { label:"Ping 8.8.8.8", cmd:"ping -c 4 8.8.8.8", cat:"net" },
                      { label:"Open Ports",   cmd:"ss -tlnp",           cat:"net" },
                    ].map(item => (
                      <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("job-cmd", JSON.stringify(item))}
                        style={{ display:"inline-block", cursor:"grab", background:"#071e26", border:"1px solid #0e7490", color:"#22d3ee", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: "#10b981", fontWeight: 700, textTransform: "uppercase", marginRight: 6 }}>Diagnostics</span>
                    {[
                      { label:"Health Report", cmd:"hostname && uptime && free -m && df -h", cat:"diag" },
                      { label:"Process List",  cmd:"ps aux | head -20",                       cat:"proc" },
                    ].map(item => (
                      <span key={item.label} draggable onDragStart={e => e.dataTransfer.setData("job-cmd", JSON.stringify(item))}
                        style={{ display:"inline-block", cursor:"grab", background:"#051a12", border:"1px solid #065f46", color:"#34d399", borderRadius:4, fontSize:10, padding:"2px 8px", margin:"2px 3px 2px 0", userSelect:"none" }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setJobDragOver(true); }}
                  onDragLeave={() => setJobDragOver(false)}
                  onDrop={e => { e.preventDefault(); setJobDragOver(false); const raw = e.dataTransfer.getData("job-cmd"); if (raw) { try { setJobDroppedCmd(JSON.parse(raw)); } catch { /* */ } } }}
                  style={{ minHeight: 52, border: `2px dashed ${jobDragOver ? "#3b82f6" : "#30363d"}`, borderRadius: 6, padding: "10px 14px", background: jobDragOver ? "#0d1f33" : "#0d1117", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
                  {jobDroppedCmd ? (
                    <>
                      <span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600 }}>{jobDroppedCmd.label}</span>
                      <span style={{ color: "#484f58", fontSize: 11, fontFamily: "monospace" }}>{jobDroppedCmd.cmd}</span>
                      <button onClick={() => setJobDroppedCmd(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>&times;</button>
                    </>
                  ) : (
                    <span style={{ color: "#484f58", fontSize: 12, userSelect: "none" }}>Drop a command here to schedule it</span>
                  )}
                </div>
              </div>
            ) : (
              <textarea value={jobScript} onChange={e => setJobScript(e.target.value)}
                placeholder={"# Paste your bash script here\necho 'Disk usage:'\ndf -h\necho 'Memory:'\nfree -m"}
                style={{ width: "100%", minHeight: 110, background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "10px 12px", color: "#c9d1d9", fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
            )}

            <input value={jobName} onChange={e => setJobName(e.target.value)} placeholder="Job name (e.g. CPU Monitor, Daily Backup)"
              style={{ width: "100%", marginTop: 10, background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 12px", color: "#c9d1d9", fontSize: 13, boxSizing: "border-box", outline: "none" }} />

            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {[["interval","Recurring"],["once","Run Once"]].map(([t, label]) => (
                <button key={t} onClick={() => setJobType(t)}
                  style={{ fontSize: 11, padding: "4px 14px", borderRadius: 5, cursor: "pointer", fontWeight: jobType === t ? 700 : 400,
                    background: jobType === t ? "#0d1b2e" : "#161b22", border: `1px solid ${jobType === t ? "#1d4ed8" : "#30363d"}`, color: jobType === t ? "#58a6ff" : "#8b949e" }}>
                  {label}
                </button>
              ))}
            </div>

            {jobType === "interval" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ color: "#6b7280", fontSize: 12 }}>Every</span>
                <input type="number" min={1} value={jobIntervalValue} onChange={e => setJobIntervalValue(e.target.value)}
                  style={{ width: 60, background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "5px 8px", color: "#c9d1d9", fontSize: 13, outline: "none", textAlign: "center" }} />
                <select value={jobIntervalUnit} onChange={e => setJobIntervalUnit(e.target.value)}
                  style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "5px 10px", color: "#c9d1d9", fontSize: 13, outline: "none", cursor: "pointer" }}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
                <span style={{ color: "#484f58", fontSize: 11 }}>starting now</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ color: "#6b7280", fontSize: 12 }}>Run at</span>
                <input type="datetime-local" value={jobRunAt} onChange={e => setJobRunAt(e.target.value)}
                  style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 5, padding: "5px 10px", color: "#c9d1d9", fontSize: 13, outline: "none", colorScheme: "dark" }} />
              </div>
            )}

            <button onClick={createJob} disabled={jobCreating}
              style={{ marginTop: 12, padding: "7px 18px", background: jobCreating ? "#1a1a1a" : "#1c2a1c", border: "1px solid #238636", color: jobCreating ? "#484f58" : "#3fb950", borderRadius: 6, cursor: jobCreating ? "default" : "pointer", fontSize: 12, fontWeight: 600 }}>
              {jobCreating ? "Scheduling..." : `+ Schedule Job on All ${vms.length} VMs`}
            </button>
          </div>

          {/* Job list */}
          {jobsLoading && jobs.length === 0 ? (
            <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "12px 0" }}>Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "12px 0" }}>No scheduled jobs yet</div>
          ) : (
            <div>
              <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Scheduled Jobs ({jobs.length} across {vms.length} VMs)
              </div>
              {jobs.map(job => {
                const SC = { pending:"#58a6ff", running:"#f59e0b", completed:"#10b981", failed:"#ef4444", cancelled:"#484f58" };
                const sc = SC[job.status] || "#8b949e";
                const expanded = jobExpandedId === job.id;
                const isActive = job.status !== "cancelled" && !(job.job_type === "once" && job.status === "completed");
                const jobVm = vms.find(v => v.id === job.vm_id);
                return (
                  <div key={job.id} style={{ marginBottom: 8, background: "#0d1117", border: `1px solid ${expanded ? "#30363d" : "#21262d"}`, borderRadius: 7, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer" }} onClick={() => setJobExpandedId(expanded ? null : job.id)}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, flexShrink: 0, boxShadow: job.status === "running" ? `0 0 6px ${sc}` : "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.name}</span>
                          <span style={{ fontSize: 9, color: sc, background: sc + "22", border: `1px solid ${sc}44`, borderRadius: 8, padding: "1px 7px", flexShrink: 0, fontWeight: 700, textTransform: "uppercase" }}>{job.status}</span>
                          {jobVm && <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace", flexShrink: 0 }}>{jobVm.host}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                          <span style={{ color: "#484f58", fontSize: 10, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{job.script}</span>
                          {job.job_type === "interval"
                            ? <span style={{ color: "#6b7280", fontSize: 10, flexShrink: 0 }}>every {job.interval_value} {job.interval_unit}</span>
                            : <span style={{ color: "#6b7280", fontSize: 10, flexShrink: 0 }}>once</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        {isActive && <button onClick={e => { e.stopPropagation(); runJobNow(job.id); }} style={{ fontSize: 10, padding: "2px 8px", background: "#0d1b2e", border: "1px solid #1d4ed8", color: "#58a6ff", borderRadius: 4, cursor: "pointer" }}>Run</button>}
                        {isActive && job.job_type === "interval" && <button onClick={e => { e.stopPropagation(); cancelJobSched(job.id); }} style={{ fontSize: 10, padding: "2px 8px", background: "#1c1505", border: "1px solid #78350f", color: "#f59e0b", borderRadius: 4, cursor: "pointer" }}>Stop</button>}
                        <button onClick={e => { e.stopPropagation(); deleteJob(job.id); }} style={{ fontSize: 10, padding: "2px 8px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: "pointer" }}>Del</button>
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ borderTop: "1px solid #21262d", padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 20, marginBottom: 8 }}>
                          <div><span style={{ color: "#484f58", fontSize: 10 }}>Runs: </span><span style={{ color: "#8b949e", fontSize: 11 }}>{job.run_count}</span></div>
                          {job.last_run_at && <div><span style={{ color: "#484f58", fontSize: 10 }}>Last: </span><span style={{ color: "#8b949e", fontSize: 11 }}>{new Date(job.last_run_at + "Z").toLocaleString()}</span></div>}
                          {job.next_run_at && isActive && <div><span style={{ color: "#484f58", fontSize: 10 }}>Next: </span><span style={{ color: "#58a6ff", fontSize: 11 }}>{new Date(job.next_run_at + "Z").toLocaleString()}</span></div>}
                        </div>
                        {job.last_output ? (
                          <pre style={{ background: "#010409", border: "1px solid #21262d", borderRadius: 5, padding: "8px 10px", fontSize: 11, color: job.last_success ? "#8b949e" : "#f87171", margin: 0, maxHeight: 140, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {job.last_output}
                          </pre>
                        ) : <div style={{ color: "#484f58", fontSize: 11 }}>No output yet</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── COMMAND HISTORY ── Row 4: right 25% */}
        <div className="card" style={{ ...DC, gridColumn: "4 / 5", gridRow: "4", alignSelf: "stretch", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showHistory ? 14 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0, color: "#e6edf3" }}>Command History</h3>
              <span style={{ fontSize: 10, color: "#6b7280", background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "2px 9px" }}>
                {historyItems.length}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {showHistory && historyItems.length > 0 && (
                <button onClick={clearHistory}
                  style={{ fontSize: 10, padding: "3px 10px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 4, cursor: "pointer" }}>
                  Clear All
                </button>
              )}
              <button onClick={() => setShowHistory(s => !s)}
                style={{ fontSize: 10, padding: "3px 10px", background: showHistory ? "#0d1b2e" : "#21262d", border: `1px solid ${showHistory ? "#1d4ed8" : "#30363d"}`, color: showHistory ? "#58a6ff" : "#8b949e", borderRadius: 4, cursor: "pointer" }}>
                {showHistory ? "Hide" : "Show History"}
              </button>
            </div>
          </div>

          {showHistory && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search commands..."
                  style={{ flex: 1, background: "#010409", border: "1px solid #30363d", borderRadius: 6, padding: "6px 10px", color: "#c9d1d9", fontSize: 12, outline: "none" }} />
                <div style={{ display: "flex", gap: 3 }}>
                  {[["all","All"],["success","Success"],["failed","Failed"]].map(([f, label]) => (
                    <button key={f} onClick={() => setHistoryFilter(f)}
                      style={{ fontSize: 10, padding: "4px 10px", borderRadius: 5, cursor: "pointer", fontWeight: historyFilter === f ? 700 : 400,
                        background: historyFilter === f ? (f === "success" ? "#051a12" : f === "failed" ? "#1c0a0a" : "#0d1b2e") : "#161b22",
                        border: `1px solid ${historyFilter === f ? (f === "success" ? "#065f46" : f === "failed" ? "#7f1d1d" : "#1d4ed8") : "#30363d"}`,
                        color: historyFilter === f ? (f === "success" ? "#3fb950" : f === "failed" ? "#f87171" : "#58a6ff") : "#6b7280" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {historyLoading && historyItems.length === 0 ? (
                <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "16px 0" }}>Loading...</div>
              ) : historyItems.length === 0 ? (
                <div style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                  No command history yet.{historyFilter !== "all" ? " Try changing the filter." : ""}
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {historyItems.map((entry) => {
                    const ts = new Date(entry.executed_at + "Z");
                    const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    const isToday = ts.toDateString() === new Date().toDateString();
                    const entryVm = vms.find(v => v.id === entry.vm_id);
                    return (
                      <div key={entry.id} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 6, background: entry.success ? "#051a12" : "#1c0a0a", border: `1px solid ${entry.success ? "#0d2a1a" : "#2d1010"}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ color: entry.success ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {entry.success ? "OK" : "ERR"}
                          </span>
                          <span style={{ background: CMD_CAT_COLORS[entry.category] || "#6b7280", color: "#fff", fontSize: 8, padding: "1px 5px", borderRadius: 3, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                            {entry.category}
                          </span>
                          <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.command}
                          </span>
                          {entryVm && <span style={{ color: "#484f58", fontSize: 9, fontFamily: "monospace", flexShrink: 0 }}>{entryVm.host}</span>}
                          <span style={{ color: "#484f58", fontSize: 10, flexShrink: 0 }}>
                            {isToday ? timeStr : ts.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + timeStr}
                          </span>
                          <button
                            onClick={() => { setBroadcastCmd(entry.command); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                            style={{ fontSize: 9, padding: "2px 7px", background: "#0d1b2e", border: "1px solid #1d4ed8", color: "#58a6ff", borderRadius: 4, cursor: "pointer", flexShrink: 0 }}>
                            Rerun
                          </button>
                        </div>
                        {entry.output && (
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8b949e", marginLeft: 22, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 60, overflow: "hidden" }}>
                            {entry.output.slice(0, 200)}{entry.output.length > 200 ? "..." : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── VM CARDS GRID ── Row 4: left 75% */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", gridColumn: "1 / 4", gridRow: "4" }}>
          {vms.map(vm => {
            const state = vmStates[vm.id] || {};
            const { metrics, metricsHistory, metricsLoading, metricsError, cmd, cmdOut, cmdLoading } = state;
            return (
              <div key={vm.id} className="card" style={{ ...DC, flex: "1 1 360px", minWidth: 0, maxWidth: vms.length === 1 ? "100%" : "calc(50% - 8px)", boxSizing: "border-box" }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: metricsError ? "#ef4444" : metrics ? "#22c55e" : "#484f58", flexShrink: 0 }} />
                    <span style={{ color: "#e6edf3", fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>{vm.host}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {metrics && !metricsLoading && (
                      <span style={{ fontSize: 9, color: "#10b981", background: "#051a12", border: "1px solid #065f46", borderRadius: 10, padding: "2px 7px" }}>Live 15s</span>
                    )}
                    {metricsLoading && <span style={{ fontSize: 9, color: "#484f58" }}>fetching...</span>}
                    <button onClick={() => fetchMetricsForVm(vm.id)} disabled={metricsLoading}
                      style={{ fontSize: 9, padding: "2px 8px", background: "#21262d", border: "1px solid #30363d", color: metricsLoading ? "#484f58" : "#8b949e", borderRadius: 4, cursor: metricsLoading ? "default" : "pointer" }}>
                      Refresh
                    </button>
                    <button onClick={() => window.open(`/vm/${vm.id}`, "_blank")}
                      style={{ fontSize: 9, padding: "2px 8px", background: "#21262d", border: "1px solid #30363d", color: "#8b949e", borderRadius: 4, cursor: "pointer" }}>
                      Full View
                    </button>
                  </div>
                </div>

                {/* Resource monitor */}
                {metricsError ? (
                  <div style={{ fontSize: 11, color: "#f87171", padding: "8px 10px", background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 6, marginBottom: 12 }}>
                    {metricsError}
                  </div>
                ) : !metrics ? (
                  <div style={{ fontSize: 11, color: "#484f58", textAlign: "center", padding: "20px 0", marginBottom: 12 }}>
                    Loading metrics...
                  </div>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>Host: <span style={{ color: "#e6edf3", fontFamily: "monospace" }}>{metrics.hostname}</span></div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>Cores: <span style={{ color: "#e6edf3" }}>{metrics.cpu_cores}</span></div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>Uptime: <span style={{ color: "#e6edf3" }}>{(() => {
                        const s = Math.floor(metrics.uptime_seconds);
                        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
                        return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
                      })()}</span></div>
                      <div style={{ fontSize: 9, color: "#484f58", marginLeft: "auto" }}>{new Date(metrics.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <MetricBar label="Memory" value={metrics.memory_pct} max={100} unit="%" color="#3b82f6" sub={`${metrics.mem_used_mb}MB / ${metrics.mem_total_mb}MB`} history={metricsHistory.map(h => h.memory_pct)} />
                    <MetricBar label="Disk (/)" value={metrics.disk_pct} max={100} unit="%" color="#f59e0b" sub="root partition" history={metricsHistory.map(h => h.disk_pct)} />
                    <MetricBar label="CPU Load" value={metrics.cpu_load} max={Math.max(metrics.cpu_cores * 2, 4)} unit="" color="#10b981" sub={`${metrics.cpu_cores} core${metrics.cpu_cores !== 1 ? "s" : ""} · 1m avg`} history={metricsHistory.map(h => h.cpu_load)} />
                  </div>
                )}

                <div style={{ height: 1, background: "#21262d", margin: "0 0 12px" }} />

                {/* Individual command */}
                <div>
                  <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>
                    Run on this VM only
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={cmd || ""}
                      onChange={e => setVmStates(prev => ({ ...prev, [vm.id]: { ...prev[vm.id], cmd: e.target.value } }))}
                      onKeyDown={e => e.key === "Enter" && runCommand(vm)}
                      placeholder="$ command..."
                      style={{ flex: 1, background: "#010409", border: "1px solid #21262d", borderRadius: 5, padding: "6px 10px", color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", outline: "none" }}
                    />
                    <button onClick={() => runCommand(vm)} disabled={cmdLoading || !cmd?.trim()}
                      style={{ padding: "6px 14px", borderRadius: 5, fontSize: 11, flexShrink: 0, cursor: cmdLoading || !cmd?.trim() ? "default" : "pointer",
                        background: cmdLoading || !cmd?.trim() ? "#161b22" : "#21262d",
                        border: `1px solid ${cmdLoading || !cmd?.trim() ? "#21262d" : "#30363d"}`,
                        color: cmdLoading || !cmd?.trim() ? "#484f58" : "#c9d1d9" }}>
                      {cmdLoading ? "..." : "Run"}
                    </button>
                  </div>
                  {cmdOut && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: "#484f58", fontFamily: "monospace", marginBottom: 4 }}>$ {cmdOut.command}</div>
                      <pre style={{ background: "#010409", border: "1px solid #21262d", borderRadius: 5, padding: "8px 10px", margin: 0, fontSize: 10, color: cmdOut.error && !cmdOut.output ? "#f87171" : "#8b949e", maxHeight: 160, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {cmdOut.output || cmdOut.error || "(no output)"}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}
