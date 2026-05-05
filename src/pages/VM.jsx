import { useParams, useNavigate } from "react-router-dom";







import { useEffect, useRef, useState } from "react";















import api from "../api";



import { useVM } from "../contexts/VMContext";















const packages = [







  "git","curl","wget","nano","vim","htop","bash","openssh","screen","tmux",







  "python3","py3-pip","nodejs","npm","docker","busybox-extras","jq","zip",







  "unzip","tree","rsync","tcpdump","net-tools","bind-tools","openssl",







  "make","gcc","g++"







];















function stripAnsi(text) {







  if (!text) return "";















  return text







    // Remove ANSI escape sequences







    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")







    // Remove other control chars except newline & tab







    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");







}







export default function VM() {







  const { vmId } = useParams(); // Only vmId is in URL







  const navigate = useNavigate();







  const [host, setHost] = useState(""); // Get host from VM data







  // Debug: Log URL parameters



  useEffect(() => {



    console.log("VM Page - vmId:", vmId);



    



    // Fetch VM details to get host



    const fetchVMDetails = async () => {



      try {



        const res = await api.get("/vm/list");



        const vm = res.data.find(v => v.id == vmId);



        if (vm) {



          setHost(vm.host);



          console.log("VM host found:", vm.host);



        }



      } catch (error) {



        console.error("Failed to fetch VM details:", error);



      }



    };



    



    fetchVMDetails();



  }, [vmId]);







  const consoleRef = useRef(null);















  const socketRef = useRef(null);

  const workflowResolveRef = useRef(null);
  const wfDragSrcIdx = useRef(null);






  const { 



    registerSession, 



    getSession, 



    updateSessionActivity, 



    removeSession, 



    hasActiveSession,



    incrementReconnectAttempts,



    resetReconnectAttempts,



    reconnectAttempts,



    trackCommand,



    generateSessionReport,



    updateSessionName



  } = useVM();















  const [logs, setLogs] = useState([]);







  const [cwd, setCwd] = useState("~");
  const [vmHostname, setVmHostname] = useState("vm");
  const [workflowItems, setWorkflowItems] = useState([]);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowResults, setWorkflowResults] = useState([]);
  const [wfDragOver, setWfDragOver] = useState(false);

  // ── Saved Workflows state ──────────────────────────────────────────────────
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [wfSaveName, setWfSaveName] = useState("");
  const [wfSaveDesc, setWfSaveDesc] = useState("");
  const [wfSaveTags, setWfSaveTags] = useState("");
  const [wfSaving, setWfSaving] = useState(false);
  const [wfSearchQuery, setWfSearchQuery] = useState("");
  const [showSavedPanel, setShowSavedPanel] = useState(false);

  // ── Job Scheduler state ────────────────────────────────────────────────────
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobInputMode, setJobInputMode] = useState("drag"); // "drag" | "script"
  const [jobScript, setJobScript] = useState("");
  const [jobDroppedCmd, setJobDroppedCmd] = useState(null); // {label, cmd, cat}
  const [jobDragOver, setJobDragOver] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobType, setJobType] = useState("interval"); // "once" | "interval"
  const [jobRunAt, setJobRunAt] = useState("");
  const [jobIntervalValue, setJobIntervalValue] = useState(5);
  const [jobIntervalUnit, setJobIntervalUnit] = useState("minutes");
  const [jobCreating, setJobCreating] = useState(false);
  const [jobExpandedId, setJobExpandedId] = useState(null);

  // ── Command History state ──────────────────────────────────────────────────
  const [historyItems, setHistoryItems] = useState([]);
  const [historyFilter, setHistoryFilter] = useState("all"); // "all" | "success" | "failed"
  const [historySearch, setHistorySearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTrigger, setHistoryTrigger] = useState(0); // bumped on each ws result
  const [alertCount, setAlertCount] = useState(0);

  // ── Resource Monitor state ─────────────────────────────────────────────────
  const [showMonitor, setShowMonitor] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState([]); // last 20 readings
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);

  const cmd_cat_colors = { sys:"#3b82f6", pkg:"#8b5cf6", net:"#06b6d4", file:"#f59e0b", proc:"#ef4444", diag:"#10b981", raw:"#6b7280" };

  const [cmd, setCmd] = useState("");







  const [connected, setConnected] = useState(false);







  const [loading, setLoading] = useState(true);







  const [sessionInfo, setSessionInfo] = useState(null);







  const [sessionName, setSessionName] = useState("");







  const [showNameDialog, setShowNameDialog] = useState(false);







  const clearTerminal = () => {







  setLogs([]);







};







  // 🔐 auth guard







  useEffect(() => {







    if (!localStorage.getItem("token")) {







      alert("Please login first");







      navigate("/login");







    }







  }, [navigate]);







  // console effect







  useEffect(() => {







  const el = consoleRef.current;







  if (!el) return;















  const isAtBottom =







    el.scrollHeight - el.scrollTop <= el.clientHeight + 40;















  if (isAtBottom) {







    el.scrollTop = el.scrollHeight;







  }







}, [logs]);







  // 🚀 Smart session management: reconnect or create new







  useEffect(() => {







    // Don't connect if we don't have host yet



    if (!host) return;







    let ws;















    const connectToVM = async (isReconnect = false) => {







      try {







        // 1️⃣ Check for existing session first







        const checkRes = await api.get(`/session/check/${vmId}`);



        



        let sessionId;



        



        if (checkRes.data.has_session) {



          // Reuse existing session



          sessionId = checkRes.data.session_id;



          if (!isReconnect) {



            setLogs(["🔄 Reconnecting to existing session..."]);



          }



          



          // Only register session if it doesn't exist (preserve existing session data)



          const existingSession = getSession(vmId);



          if (!existingSession) {



            console.log("No existing session found, registering new one");



            registerSession(vmId, { sessionId, host });



          } else {



            console.log("Existing session found, preserving session data:", existingSession.sessionName);



            // Just update session info, don't reset session data



            setSessionInfo({ sessionId, vmId });



          }



        } else {



          // Create new session



          const res = await api.post(`/session/create/${vmId}`);



          sessionId = res.data.session_id;



          setLogs(["🟢 Connected to VM terminal"]);



          setSessionInfo({ sessionId, vmId });



          registerSession(vmId, { sessionId, host });



        }















        // 2️⃣ open websocket







        ws = new WebSocket(`ws://localhost:8000/session/ws/${sessionId}`);







        socketRef.current = ws;















        ws.onopen = () => {







          setConnected(true);



          if (!isReconnect) {



            setLogs(prev => [...prev, "✅ Ready for commands"]);



          }







          setLoading(false);







        };















        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);

            if (msg.type === "connected") {
              setConnected(true);
              if (msg.cwd) setCwd(msg.cwd);
              if (msg.hostname) setVmHostname(msg.hostname);
              setLogs(prev => [...prev, `\x00SYS\x00${msg.message}`]);
              return;
            }

            if (msg.type === "clear") {
              setLogs([]);
              return;
            }

            if (msg.type === "dispatching") {
              setLogs(prev => [...prev,
                `\x00ROUTE\x00${msg.category}\x00${msg.action}\x00${msg.priority}\x00${msg.command_id}`
              ]);
              return;
            }

            if (msg.type === "result") {
              if (msg.cwd) setCwd(msg.cwd);
              if (msg.hostname) setVmHostname(msg.hostname);

              if (msg.output) {
                // Clean apk install output — replace raw download junk with a summary
                const rawCmd = (msg.raw_command || "").trim();
                let displayOutput = msg.output;
                if (/^apk\s+add\s+/i.test(rawCmd)) {
                  const pkgMatch = rawCmd.match(/^apk\s+add\s+(.+)/i);
                  const pkgName = pkgMatch ? pkgMatch[1].trim() : "package";
                  if (msg.success) {
                    // Extract "Installing X (version)" lines
                    const installed = [...msg.output.matchAll(/Installing (\S+) \(([^)]+)\)/g)].map(m => `  ${m[1]} (${m[2]})`);
                    displayOutput = installed.length > 0
                      ? `OK: Installed successfully\n${installed.join("\n")}`
                      : `OK: ${pkgName} installed`;
                  } else {
                    const errLine = msg.output.split("\n").find(l => /error|ERROR|not found|APKINDEX/i.test(l)) || msg.output.slice(0, 120);
                    displayOutput = `FAILED: ${errLine}`;
                  }
                }
                setLogs(prev => [...prev, displayOutput]);
              }
              if (msg.error && !msg.output) {
                setLogs(prev => [...prev, `Error: ${msg.error}`]);
              }

              // Dispatcher metadata badge
              setLogs(prev => [...prev,
                `\x00META\x00${msg.category}\x00${msg.action}\x00${msg.execution_time_ms}\x00${msg.success}\x00${!!msg.cached}`
              ]);

              updateSessionActivity(vmId);
              // Track with REAL success + timing from dispatcher
              trackCommand(vmId, msg.raw_command, msg.execution_time_ms, msg.success, msg.output);
              // Trigger history refresh (if panel is open)
              setHistoryTrigger(prev => prev + 1);
              // Advance workflow if one is running
              if (workflowResolveRef.current) {
                const wfRes = workflowResolveRef.current;
                workflowResolveRef.current = null;
                wfRes(msg);
              }
              return;
            }

            if (msg.type === "error") {
              setLogs(prev => [...prev, `\x00SYS\x00ERROR: ${msg.message}`]);
              return;
            }
          } catch {
            // Fallback: plain text (non-JSON legacy)
            const clean = stripAnsi(e.data);
            if (!clean.trim()) return;
            setLogs(prev => [...prev, clean]);
            updateSessionActivity(vmId);
          }
        };















        ws.onerror = (error) => {







          if (!isReconnect) {



            setLogs(prev => [...prev, "⚠ WebSocket error"]);



          }



          console.error('WebSocket error:', error);



        };















        ws.onclose = () => {







          setConnected(false);



          



          // NO AUTO-RECONNECT - User must manually reconnect if needed



          // This prevents endless loops and log flooding



          if (!isReconnect) {



            setLogs(prev => [...prev, "🔴 Connection closed - Navigate back to reconnect"]);



          }



        };















      } catch (err) {







        console.error('Failed to connect to VM:', err);



        



        if (!isReconnect) {



          alert("Failed to start VM session");



          navigate("/dashboard");



        }







      }



    };















    connectToVM();















    // 🧹 cleanup on page exit (but don't disconnect VM!)







    return () => {







      if (ws) {



        ws.onclose = null; // Prevent reconnection attempts



        ws.close();



      }



    };







  }, [vmId, navigate, host]);















  // ⌨️ send command







  const sendCommand = (command) => {



    if (!command || !socketRef.current || socketRef.current.readyState !== 1) {



      if (!connected) {



        setLogs(prev => [...prev, "❌ Not connected - Navigate back and reconnect"]);



      }



      return;



    }










    setLogs(prev => [...prev, `$ ${command}`]);



    socketRef.current.send(JSON.stringify({ cmd: command }));



    setCmd("");







  };

  // ── Workflow Builder: sequential execution engine ──────────────────────────
  const executeWorkflow = async () => {
    if (workflowItems.length === 0 || workflowRunning) return;
    setWorkflowRunning(true);
    setWorkflowResults([]);
    const items = [...workflowItems];
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      results.push({ cmd: item.cmd, label: item.label, cat: item.cat, status: "running", output: "", success: false, ms: 0 });
      setWorkflowResults([...results]);
      const msg = await new Promise((resolve) => {
        workflowResolveRef.current = resolve;
        sendCommand(item.cmd);
      });
      results[i] = { ...results[i], status: "done", success: !!msg.success, output: msg.output || msg.error || "", ms: msg.execution_time_ms };
      setWorkflowResults([...results]);
    }
    setWorkflowRunning(false);
    workflowResolveRef.current = null;
  };

  // ── Saved Workflows helpers ───────────────────────────────────────────────
  const loadSavedWorkflows = async () => {
    try {
      const res = await api.get("/workflows/");
      setSavedWorkflows(res.data);
    } catch { /* silent */ }
  };

  useEffect(() => { loadSavedWorkflows(); }, []);

  const saveWorkflow = async () => {
    if (!wfSaveName.trim()) return alert("Enter a workflow name");
    if (workflowItems.length === 0) return alert("Add steps to the workflow first");
    setWfSaving(true);
    try {
      const steps = workflowItems.map(({ label, cmd, cat }) => ({ label, cmd, cat }));
      await api.post("/workflows/", {
        name: wfSaveName.trim(),
        description: wfSaveDesc.trim() || null,
        steps,
        tags: wfSaveTags.trim() || null,
      });
      setWfSaveName(""); setWfSaveDesc(""); setWfSaveTags("");
      setShowSaveForm(false);
      loadSavedWorkflows();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to save workflow");
    } finally {
      setWfSaving(false);
    }
  };

  const loadWorkflowIntoBuilder = (wf) => {
    const steps = JSON.parse(wf.steps).map(s => ({ ...s, id: `${Date.now()}_${Math.random()}` }));
    setWorkflowItems(steps);
    setWorkflowResults([]);
    setShowSavedPanel(false);
  };

  const runSavedWorkflow = async (wf) => {
    if (workflowRunning) return;
    const steps = JSON.parse(wf.steps).map(s => ({ ...s, id: `${Date.now()}_${Math.random()}` }));
    setWorkflowItems(steps);
    setWorkflowResults([]);
    setShowSavedPanel(false);
    // increment run count in background
    api.post(`/workflows/${wf.id}/run`).then(loadSavedWorkflows).catch(() => {});
    // execute using the steps directly (don't wait for state update)
    setWorkflowRunning(true);
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      const item = steps[i];
      results.push({ cmd: item.cmd, label: item.label, cat: item.cat, status: "running", output: "", success: false, ms: 0 });
      setWorkflowResults([...results]);
      const msg = await new Promise((resolve) => {
        workflowResolveRef.current = resolve;
        sendCommand(item.cmd);
      });
      results[i] = { ...results[i], status: "done", success: !!msg.success, output: msg.output || msg.error || "", ms: msg.execution_time_ms };
      setWorkflowResults([...results]);
    }
    setWorkflowRunning(false);
    workflowResolveRef.current = null;
  };

  const deleteWorkflow = async (id) => {
    try { await api.delete(`/workflows/${id}`); loadSavedWorkflows(); } catch { /* silent */ }
  };

  const updateWorkflow = async (wf) => {
    // Overwrite saved workflow with current builder queue
    if (workflowItems.length === 0) return alert("Builder queue is empty");
    try {
      const steps = workflowItems.map(({ label, cmd, cat }) => ({ label, cmd, cat }));
      await api.put(`/workflows/${wf.id}`, {
        name: wf.name,
        description: wf.description || null,
        steps,
        tags: wf.tags || null,
      });
      loadSavedWorkflows();
    } catch { /* silent */ }
  };

  // ── Job Scheduler helpers ──────────────────────────────────────────────────
  const loadJobs = async () => {
    if (!vmId) return;
    setJobsLoading(true);
    try {
      const res = await api.get(`/jobs/vm/${vmId}`);
      setJobs(res.data);
    } catch { /* silent */ } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const iv = setInterval(loadJobs, 6000); // poll every 6s
    return () => clearInterval(iv);
  }, [vmId]);

  const createJob = async () => {
    const script = jobInputMode === "drag"
      ? (jobDroppedCmd ? jobDroppedCmd.cmd : "")
      : jobScript.trim();
    if (!script) return alert("No command or script provided");
    if (!jobName.trim()) return alert("Please enter a job name");
    if (jobType === "once" && !jobRunAt) return alert("Please select when to run");

    setJobCreating(true);
    try {
      const payload = {
        vm_id: Number(vmId),
        name: jobName.trim(),
        script,
        job_type: jobType,
        ...(jobType === "once"
          ? { run_at: new Date(jobRunAt).toISOString() }
          : { interval_value: Number(jobIntervalValue), interval_unit: jobIntervalUnit }),
      };
      await api.post("/jobs/", payload);
      setJobName(""); setJobScript(""); setJobDroppedCmd(null); setJobRunAt("");
      setJobIntervalValue(5); setJobIntervalUnit("minutes"); setJobType("interval");
      loadJobs();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create job");
    } finally {
      setJobCreating(false);
    }
  };

  const deleteJob = async (jobId) => {
    try { await api.delete(`/jobs/${jobId}`); loadJobs(); } catch { /* silent */ }
  };

  const runJobNow = async (jobId) => {
    try { await api.post(`/jobs/${jobId}/run`); setTimeout(loadJobs, 1200); } catch { /* silent */ }
  };

  const cancelJobSched = async (jobId) => {
    try { await api.patch(`/jobs/${jobId}/cancel`); loadJobs(); } catch { /* silent */ }
  };

  // ── Command History helpers ────────────────────────────────────────────────
  const loadHistory = async (reset = false) => {
    const newOffset = reset ? 0 : historyOffset;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: 50, offset: newOffset, vm_id: vmId });
      if (historyFilter === "success") params.set("success", "true");
      if (historyFilter === "failed")  params.set("success", "false");
      if (historySearch.trim()) params.set("search", historySearch.trim());
      const res = await api.get(`/history/?${params.toString()}`);
      if (reset) {
        setHistoryItems(res.data);
        setHistoryOffset(res.data.length);
      } else {
        setHistoryItems(prev => [...prev, ...res.data]);
        setHistoryOffset(prev => prev + res.data.length);
      }
      setHistoryHasMore(res.data.length === 50);
    } catch { /* silent */ } finally { setHistoryLoading(false); }
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear all command history for this VM?")) return;
    try { await api.delete(`/history/clear?vm_id=${vmId}`); setHistoryItems([]); setHistoryOffset(0); } catch { /* silent */ }
  };

  useEffect(() => { if (showHistory) loadHistory(true); }, [showHistory, historyFilter]);

  // Reload history on search (debounced via timeout)
  useEffect(() => {
    if (!showHistory) return;
    const t = setTimeout(() => loadHistory(true), 400);
    return () => clearTimeout(t);
  }, [historySearch]);

  // Live-reload history when a new command result arrives via WebSocket
  useEffect(() => {
    if (showHistory && historyTrigger > 0) loadHistory(true);
  }, [historyTrigger]);

  // ── Resource Monitor helpers ───────────────────────────────────────────────
  const fetchMetrics = async () => {
    if (!connected || !vmId) return;
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await api.get(`/vm/${vmId}/metrics`);
      setMetrics(res.data);
      setMetricsHistory(prev => {
        const next = [...prev, { ...res.data, ts: Date.now() }];
        return next.slice(-20); // keep last 20 readings
      });
    } catch (err) {
      setMetricsError(err.response?.data?.detail || "Failed to fetch metrics");
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    if (!showMonitor || !connected) return;
    fetchMetrics();
    const iv = setInterval(fetchMetrics, 15000);
    return () => clearInterval(iv);
  }, [showMonitor, connected, vmId]);

  // Alert bell polling
  useEffect(() => {
    const fetchCount = async () => {
      try { const r = await api.get("/alerts/count"); setAlertCount(r.data.count); } catch { /* silent */ }
    };
    fetchCount();
    const iv = setInterval(fetchCount, 30000);
    return () => clearInterval(iv);
  }, []);













  // Debug: Log session naming state



  useEffect(() => {



    const currentSession = getSession(vmId);



    console.log("VM page session debug:", { 



      vmId, 



      connected, 



      sessionName, 



      currentSession: currentSession?.sessionName,



      sessionExists: !!currentSession,



      sessionData: currentSession ? {



        sessionName: currentSession.sessionName,



        commandsCount: currentSession.commands?.length,



        totalCommands: currentSession.totalCommands,



        startTime: currentSession.startTime



      } : null



    });



  }, [vmId, connected, sessionName, getSession]);







  // Session naming functions



  const saveSessionName = () => {



    if (sessionName.trim()) {



      updateSessionName(vmId, sessionName.trim());



      setShowNameDialog(false);



      setLogs(prev => [...prev, `📝 Session named: "${sessionName.trim()}"`]);



    }



  };







  const showSessionNameDialog = () => {



    const currentSession = getSession(vmId);



    setSessionName(currentSession?.sessionName || "");



    setShowNameDialog(true);



  };







  const disconnectVM = async () => {







    if (window.confirm("Disconnect VM and release it for other users?")) {







      try {







        // Get current session info and host from VM context

        const currentSession = getSession(vmId);

        const currentHost = currentSession?.host || host;



        // Close WebSocket







        if (socketRef.current) {



          socketRef.current.onclose = null; // Prevent reconnection



          socketRef.current.close();



        }





        // Generate session report before disconnecting







        if (currentSession && currentHost) {



          console.log("Disconnecting VM with host:", currentHost);





          



          // Generate and save the session report







          try {



            const report = await generateSessionReport(vmId, currentHost);





            if (report) {



              setLogs(prev => [...prev, `📊 Session report generated: ${report.totalCommands} commands, ${report.duration}ms duration`]);





            } else {



              setLogs(prev => [...prev, `⚠️ No session data available for report generation`]);



            }





          } catch (error) {



            console.error('Failed to generate session report:', error);





            setLogs(prev => [...prev, `❌ Failed to generate session report: ${error.message}`]);





          }



          await api.post("/vm/disconnect", { host: currentHost });



        } else {



          console.error("No sessionInfo or host available for disconnect");



          // Try to disconnect using vmId as fallback



          await api.post(`/vm/disconnect/${vmId}`);



        }







        // Remove from context



        removeSession(vmId);







        navigate("/dashboard");







      } catch (error) {



        console.error("Disconnect error:", error);



        alert(`Failed to disconnect VM: ${error.response?.data?.detail || error.message}`);



      }







    }







  };















  if (loading) {







    return <div className="app">Connecting to VM…</div>;







  }















  return (







    <div className="app">







      <aside className="sidebar">



        <h2>{host}</h2>



        



        <div className="nav-item" onClick={() => navigate("/dashboard")}>



          ← Back (Session Preserved)



        </div>



        



        {connected && (



          <div 



            className="nav-item" 



            onClick={showSessionNameDialog}



            style={{ backgroundColor: "#3b82f6", color: "white" }}



          >



            📝 Name Session



          </div>



        )}



        



        {!connected && (



          <div 



            className="nav-item" 



            onClick={() => window.location.reload()}



            style={{ backgroundColor: "#f59e0b", color: "white" }}



          >



            🔄 Reconnect



          </div>



        )}







        {/* Session Name Display */}



        {(() => {



          const currentSession = getSession(vmId);



          return currentSession?.sessionName ? (



            <div style={{ 



              marginTop: "10px", 



              padding: "8px", 



              backgroundColor: "#f8fafc", 



              borderRadius: "6px",



              fontSize: "12px",



              color: "#64748b"



            }}>



              📋 {currentSession.sessionName}



            </div>



          ) : null;



        })()}







        {/* Alert Bell */}
        <div
          onClick={() => navigate("/dashboard")}
          title="View alerts on Dashboard"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", margin: "4px 0 0", borderRadius: 8,
            cursor: "pointer",
            background: "transparent",
            border: `1px solid ${alertCount > 0 ? "#78350f" : "#21262d"}`,
            color: alertCount > 0 ? "#f59e0b" : "#6b7280",
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: alertCount > 0 ? 700 : 400 }}>Alerts</span>
          {alertCount > 0 && (
            <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>
              {alertCount}
            </span>
          )}
        </div>

      </aside>















      <main className="main">







        <div>







          {/* STATUS */}







          <div className="card">







            <h3>VM Status</h3>







            <div className="status-row">







              <span>Status</span>







              <span>{connected ? "Connected" : "Disconnected"}</span>







            </div>







            <div className="status-row">







              <span>Owner</span>







              <span>You</span>







            </div>







            <div className="status-row">







              <span>Host</span>







              <span>{host}</span>







            </div>







          </div>















          {/* ── RESOURCE MONITOR ─────────────────────────────────── */}
          <div className="card mt-20">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: showMonitor ? 14 : 0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <h3 style={{ margin:0 }}>Resource Monitor</h3>
                {metrics && (
                  <span style={{ fontSize:10, color:"#10b981", background:"#051a12", border:"1px solid #065f46", borderRadius:10, padding:"2px 9px" }}>
                    Live · 15s refresh
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {showMonitor && metrics && (
                  <button onClick={fetchMetrics} disabled={metricsLoading}
                    style={{ fontSize:10, padding:"3px 10px", background:"#0d1b2e", border:"1px solid #1d4ed8", color: metricsLoading ? "#484f58" : "#58a6ff", borderRadius:4, cursor: metricsLoading ? "default" : "pointer" }}>
                    {metricsLoading ? "…" : "↻ Refresh"}
                  </button>
                )}
                <button onClick={() => setShowMonitor(s => !s)}
                  style={{ fontSize:10, padding:"3px 10px", background: showMonitor ? "#0d1b2e" : "#21262d", border:`1px solid ${showMonitor ? "#1d4ed8" : "#30363d"}`, color: showMonitor ? "#58a6ff" : "#8b949e", borderRadius:4, cursor:"pointer" }}>
                  {showMonitor ? "Hide" : "Monitor"}
                </button>
              </div>
            </div>

            {showMonitor && (
              <>
                {!connected ? (
                  <div style={{ color:"#484f58", fontSize:12, textAlign:"center", padding:"16px 0" }}>Connect to VM to see live metrics</div>
                ) : metricsError ? (
                  <div style={{ color:"#f87171", fontSize:12, padding:"10px 0" }}>{metricsError}</div>
                ) : !metrics ? (
                  <div style={{ color:"#484f58", fontSize:12, textAlign:"center", padding:"16px 0" }}>Loading metrics…</div>
                ) : (
                  <>
                    {/* Uptime + hostname header */}
                    <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
                      <div style={{ fontSize:11, color:"#6b7280" }}>
                        Host: <span style={{ color:"#e6edf3", fontFamily:"monospace" }}>{metrics.hostname}</span>
                      </div>
                      <div style={{ fontSize:11, color:"#6b7280" }}>
                        CPU Cores: <span style={{ color:"#e6edf3" }}>{metrics.cpu_cores}</span>
                      </div>
                      <div style={{ fontSize:11, color:"#6b7280" }}>
                        Uptime: <span style={{ color:"#e6edf3" }}>{(() => {
                          const s = Math.floor(metrics.uptime_seconds);
                          const d = Math.floor(s / 86400);
                          const h = Math.floor((s % 86400) / 3600);
                          const m = Math.floor((s % 3600) / 60);
                          return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
                        })()}</span>
                      </div>
                      <div style={{ fontSize:10, color:"#484f58", marginLeft:"auto" }}>
                        {new Date(metrics.timestamp).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Metric bars */}
                    {[
                      { key:"memory_pct",  label:"Memory",   value: metrics.memory_pct,  max:100, unit:"%", sub:`${metrics.mem_used_mb}MB / ${metrics.mem_total_mb}MB`, color:"#3b82f6" },
                      { key:"disk_pct",    label:"Disk (/)", value: metrics.disk_pct,    max:100, unit:"%", sub:"root partition",                                       color:"#f59e0b" },
                      { key:"cpu_load",    label:"CPU Load", value: metrics.cpu_load,    max: Math.max(metrics.cpu_cores * 2, 4), unit:"", sub:`${metrics.cpu_cores} core${metrics.cpu_cores !== 1 ? "s" : ""} · 1m avg`, color:"#10b981" },
                    ].map(({ key, label, value, max, unit, sub, color }) => {
                      const pct = Math.min((value / max) * 100, 100);
                      const barColor = pct > 85 ? "#ef4444" : pct > 65 ? "#f59e0b" : color;
                      const history = metricsHistory.map(h => h[key] ?? 0);
                      const hMax = Math.max(...history, max * 0.1);

                      // SVG sparkline
                      const W = 80, H = 28;
                      const pts = history.map((v, i) => {
                        const x = history.length <= 1 ? W : (i / (history.length - 1)) * W;
                        const y = H - (v / hMax) * (H - 2) - 1;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      }).join(" ");

                      return (
                        <div key={key} style={{ marginBottom:14 }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                            <div>
                              <span style={{ fontSize:12, color:"#c9d1d9", fontWeight:600 }}>{label}</span>
                              <span style={{ fontSize:10, color:"#484f58", marginLeft:8 }}>{sub}</span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              {history.length > 1 && (
                                <svg width={W} height={H} style={{ overflow:"visible" }}>
                                  <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.6" />
                                  {history.length > 0 && (() => {
                                    const lx = history.length <= 1 ? W : W;
                                    const ly = H - (history[history.length - 1] / hMax) * (H - 2) - 1;
                                    return <circle cx={lx} cy={ly} r="2.5" fill={barColor} />;
                                  })()}
                                </svg>
                              )}
                              <span style={{ fontSize:14, fontWeight:700, color: barColor, minWidth:52, textAlign:"right" }}>
                                {value.toFixed(1)}{unit}
                              </span>
                            </div>
                          </div>
                          <div style={{ height:6, background:"#21262d", borderRadius:3, overflow:"hidden" }}>
                            <div style={{
                              height:"100%", width:`${pct}%`,
                              background: barColor,
                              borderRadius:3,
                              transition:"width 0.8s ease, background 0.3s",
                              boxShadow: pct > 85 ? `0 0 8px ${barColor}88` : "none",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
          {/* END RESOURCE MONITOR */}

          {/* SYSTEM OPS */}







          <div className="card mt-20">







            <h3>System Operations</h3>







            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>







              <button className="warn" onClick={()=>sendCommand("reboot")}>







                Reboot VM







              </button>







              <button className="danger" onClick={()=>sendCommand("poweroff")}>







                Power Off VM







              </button>







              <button className="accent" onClick={disconnectVM}>







                🔌 Disconnect & Release VM







              </button>







            </div>







          </div>















          {/* PACKAGES */}







          <div className="card mt-20">







            <h3>Install Packages</h3>







            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>







              {packages.map(p => (







                <button







                  key={p}







                  className="primary"







                  onClick={()=>sendCommand(`apk add ${p}`)}







                >







                  {p}







                </button>







              ))}







            </div>







          </div>















          {/* CUSTOM COMMAND */}







          <div className="card mt-20">







            <h3>Run Command</h3>

            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#58a6ff", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#3fb950" }}>{vmHostname}</span>
              <span style={{ color: "#8b949e" }}>:</span>
              <span style={{ color: "#79c0ff" }}>{cwd}</span>
              <span style={{ color: "#f78166", marginLeft: 2 }}>$</span>
            </div>







            <input







              placeholder="e.g. ls -la"







              value={cmd}







              onChange={e => setCmd(e.target.value)}







              onKeyDown={e => e.key === "Enter" && sendCommand(cmd)}







            />







            <button className="accent mt-12" onClick={()=>sendCommand(cmd)}>







              Execute







            </button>







          </div>

          {/* ── WORKFLOW BUILDER ────────────────────────────────────── */}
          <div className="card mt-20">

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <h3 style={{margin:0}}>Workflow Builder</h3>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:"#6b7280"}}>{workflowItems.length} step{workflowItems.length!==1?"s":""}</span>
                {/* Save workflow button */}
                {workflowItems.length>0&&!workflowRunning&&(
                  <button onClick={()=>setShowSaveForm(s=>!s)}
                    style={{fontSize:10,padding:"2px 8px",background:showSaveForm?"#1c2a1c":"#21262d",border:`1px solid ${showSaveForm?"#238636":"#30363d"}`,color:showSaveForm?"#3fb950":"#8b949e",borderRadius:4,cursor:"pointer"}}>
                    {showSaveForm?"✕ Cancel":"💾 Save"}
                  </button>
                )}
                {/* My Workflows button */}
                <button onClick={()=>setShowSavedPanel(s=>!s)}
                  style={{fontSize:10,padding:"2px 8px",background:showSavedPanel?"#0d1b2e":"#21262d",border:`1px solid ${showSavedPanel?"#1d4ed8":"#30363d"}`,color:showSavedPanel?"#58a6ff":"#8b949e",borderRadius:4,cursor:"pointer"}}>
                  📂 My Workflows {savedWorkflows.length>0&&`(${savedWorkflows.length})`}
                </button>
                {workflowItems.length>0&&!workflowRunning&&(
                  <button onClick={()=>{setWorkflowItems([]);setWorkflowResults([]);}}
                    style={{fontSize:10,padding:"2px 8px",background:"#21262d",border:"1px solid #30363d",color:"#8b949e",borderRadius:4,cursor:"pointer"}}>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* COMMAND PALETTE */}
            <div style={{marginBottom:14,padding:"10px 12px",background:"#010409",border:"1px solid #21262d",borderRadius:6}}>
              <div style={{fontSize:9,color:"#484f58",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Drag commands into the workflow queue below</div>

              {/* System */}
              <div style={{marginBottom:8}}>
                <span style={{fontSize:9,color:"#3b82f6",fontWeight:700,textTransform:"uppercase",marginRight:8}}>System</span>
                {[{label:"Status",cmd:"sys:status",cat:"sys"},{label:"Uptime",cmd:"sys:uptime",cat:"sys"},{label:"Memory",cmd:"sys:memory",cat:"sys"},{label:"CPU",cmd:"sys:cpu",cat:"sys"},{label:"Disk",cmd:"sys:disk",cat:"sys"},{label:"Hostname",cmd:"sys:hostname",cat:"sys"},{label:"Reboot",cmd:"sys:reboot",cat:"sys"},{label:"Power Off",cmd:"sys:poweroff",cat:"sys"}].map(item=>(
                  <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("wf-new",JSON.stringify(item))}
                    style={{display:"inline-block",cursor:"grab",background:"#0d1b2e",border:"1px solid #1d4ed8",color:"#60a5fa",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#3b82f6"} onMouseLeave={e=>e.currentTarget.style.borderColor="#1d4ed8"}>
                    &#8942; {item.label}
                  </span>
                ))}
              </div>

              {/* Network */}
              <div style={{marginBottom:8}}>
                <span style={{fontSize:9,color:"#06b6d4",fontWeight:700,textTransform:"uppercase",marginRight:8}}>Network</span>
                {[{label:"Ping 8.8.8.8",cmd:"net:ping 8.8.8.8",cat:"net"},{label:"Interfaces",cmd:"net:ifconfig",cat:"net"},{label:"Ports",cmd:"net:ports",cat:"net"},{label:"Routes",cmd:"net:routes",cat:"net"},{label:"Connectivity",cmd:"diag:connectivity",cat:"diag"}].map(item=>(
                  <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("wf-new",JSON.stringify(item))}
                    style={{display:"inline-block",cursor:"grab",background:"#071e26",border:"1px solid #0e7490",color:"#22d3ee",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#06b6d4"} onMouseLeave={e=>e.currentTarget.style.borderColor="#0e7490"}>
                    &#8942; {item.label}
                  </span>
                ))}
              </div>

              {/* Diagnostics */}
              <div style={{marginBottom:8}}>
                <span style={{fontSize:9,color:"#10b981",fontWeight:700,textTransform:"uppercase",marginRight:8}}>Diagnostics</span>
                {[{label:"Health Report",cmd:"diag:health",cat:"diag"},{label:"Processes",cmd:"proc:list",cat:"proc"},{label:"Top Procs",cmd:"proc:top",cat:"proc"},{label:"Sys Logs",cmd:"diag:logs",cat:"diag"},{label:"Benchmark",cmd:"diag:benchmark",cat:"diag"}].map(item=>(
                  <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("wf-new",JSON.stringify(item))}
                    style={{display:"inline-block",cursor:"grab",background:"#051a12",border:"1px solid #065f46",color:"#34d399",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#10b981"} onMouseLeave={e=>e.currentTarget.style.borderColor="#065f46"}>
                    &#8942; {item.label}
                  </span>
                ))}
              </div>

              {/* Packages */}
              <div>
                <span style={{fontSize:9,color:"#a78bfa",fontWeight:700,textTransform:"uppercase",marginRight:8}}>Packages</span>
                {packages.map(p=>(
                  <span key={p} draggable onDragStart={e=>e.dataTransfer.setData("wf-new",JSON.stringify({label:"install "+p,cmd:"pkg:install "+p,cat:"pkg"}))}
                    style={{display:"inline-block",cursor:"grab",background:"#110c1e",border:"1px solid #5b21b6",color:"#c4b5fd",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#7c3aed"} onMouseLeave={e=>e.currentTarget.style.borderColor="#5b21b6"}>
                    &#8942; {p}
                  </span>
                ))}
              </div>
            </div>

            {/* DROP ZONE */}
            <div
              onDragOver={e=>{e.preventDefault();setWfDragOver(true);}}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setWfDragOver(false);}}
              onDrop={e=>{
                e.preventDefault();setWfDragOver(false);
                const raw=e.dataTransfer.getData("wf-new");
                if(raw){try{const item=JSON.parse(raw);setWorkflowItems(prev=>[...prev,{...item,id:Date.now()+"_"+Math.random()}]);}catch{}}
              }}
              style={{minHeight:90,border:"2px dashed "+(wfDragOver?"#3b82f6":"#30363d"),borderRadius:6,padding:"10px 12px",background:wfDragOver?"#0d1f33":"#0d1117",transition:"all 0.15s",marginBottom:14}}
            >
              {workflowItems.length===0?(
                <div style={{color:"#484f58",fontSize:12,textAlign:"center",padding:"18px 0",userSelect:"none"}}>
                  Drop commands here to build your workflow
                </div>
              ):(
                workflowItems.map((item,idx)=>{
                  const CC={sys:"#3b82f6",pkg:"#8b5cf6",net:"#06b6d4",file:"#f59e0b",proc:"#ef4444",diag:"#10b981",raw:"#6b7280"};
                  const r=workflowResults[idx];
                  const isCurrent=r&&r.status==="running";
                  const isDone=r&&r.status==="done";
                  return(
                    <div key={item.id}
                      draggable={!workflowRunning}
                      onDragStart={e=>{if(workflowRunning)return;wfDragSrcIdx.current=idx;e.dataTransfer.setData("wf-reorder",String(idx));}}
                      onDragOver={e=>{e.preventDefault();e.stopPropagation();}}
                      onDrop={e=>{
                        e.preventDefault();e.stopPropagation();
                        const raw=e.dataTransfer.getData("wf-new");
                        if(raw){try{const ni=JSON.parse(raw);setWorkflowItems(prev=>{const a=[...prev];a.splice(idx,0,{...ni,id:Date.now()+"_"+Math.random()});return a;});}catch{} return;}
                        const from=wfDragSrcIdx.current;
                        if(from===null||from===idx)return;
                        setWorkflowItems(prev=>{const a=[...prev];const[m]=a.splice(from,1);a.splice(idx,0,m);return a;});
                        wfDragSrcIdx.current=null;
                      }}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:4,background:isDone?(r.success?"#051a12":"#1c0a0a"):isCurrent?"#0d1f33":"#161b22",border:"1px solid "+(isDone?(r.success?"#065f46":"#7f1d1d"):isCurrent?"#1d4ed8":"#30363d"),borderRadius:5,cursor:workflowRunning?"default":"grab",transition:"all 0.2s"}}
                    >
                      <span style={{color:"#484f58",fontSize:11,minWidth:20}}>{idx+1}.</span>
                      <span style={{background:CC[item.cat]||"#6b7280",color:"#fff",fontSize:8,padding:"1px 6px",borderRadius:3,fontWeight:700,textTransform:"uppercase"}}>{item.cat}</span>
                      <span style={{color:"#e6edf3",fontSize:12,flex:1,fontWeight:500}}>{item.label}</span>
                      <span style={{color:"#484f58",fontSize:10,fontFamily:"monospace"}}>{item.cmd}</span>
                      {isCurrent&&<span style={{color:"#58a6ff",fontSize:10}}>&#9679; running</span>}
                      {isDone&&<span style={{color:r.success?"#10b981":"#ef4444",fontSize:10,fontWeight:600}}>{r.success?"ok":"err"} {r.ms}ms</span>}
                      {!workflowRunning&&(
                        <button onClick={()=>setWorkflowItems(prev=>prev.filter((_,i)=>i!==idx))}
                          style={{background:"none",border:"none",color:"#484f58",cursor:"pointer",fontSize:15,lineHeight:1,padding:"0 2px"}}
                          title="Remove step">
                          &times;
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* EXECUTE BUTTON */}
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <button
                className="accent"
                disabled={workflowItems.length===0||workflowRunning||!connected}
                onClick={executeWorkflow}
                style={{opacity:workflowItems.length===0||!connected?0.4:1,fontWeight:600}}
              >
                {workflowRunning
                  ?"Running "+workflowResults.filter(r=>r.status==="done").length+"/"+workflowItems.length+"..."
                  :"> Run Workflow ("+workflowItems.length+" step"+(workflowItems.length!==1?"s":"")+")"}
              </button>
              {workflowResults.length>0&&!workflowRunning&&(
                <span style={{fontSize:11,color:workflowResults.every(r=>r.success)?"#10b981":"#f59e0b",fontWeight:600}}>
                  {workflowResults.filter(r=>r.success).length}/{workflowResults.length} steps succeeded
                </span>
              )}
            </div>

            {/* WORKFLOW OUTPUT */}
            {workflowResults.length>0&&(
              <div style={{marginTop:14,borderTop:"1px solid #21262d",paddingTop:12}}>
                <div style={{fontSize:9,color:"#484f58",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Workflow Output</div>
                {workflowResults.map((r,i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{color:"#484f58",fontSize:11,minWidth:20}}>{i+1}.</span>
                      <span style={{color:r.status==="running"?"#58a6ff":r.success?"#10b981":"#ef4444",fontSize:11,fontWeight:700}}>
                        {r.status==="running"?"...":r.success?"OK":"FAIL"}
                      </span>
                      <span style={{color:"#c9d1d9",fontSize:12}}>{r.label}</span>
                      {r.status==="done"&&<span style={{color:"#484f58",fontSize:10,marginLeft:"auto"}}>{r.ms}ms</span>}
                    </div>
                    {r.output&&(
                      <pre style={{background:"#010409",border:"1px solid #21262d",borderRadius:4,padding:"6px 10px",fontSize:10,color:"#8b949e",margin:"0 0 0 26px",maxHeight:120,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                        {r.output.length>600?r.output.substring(0,600)+"\n...(truncated)":r.output}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}


            {/* ── SAVE WORKFLOW FORM ── */}
            {showSaveForm&&(
              <div style={{marginTop:14,padding:"14px",background:"#010409",border:"1px solid #238636",borderRadius:8}}>
                <div style={{fontSize:9,color:"#3fb950",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10,fontWeight:700}}>Save Current Workflow</div>
                <input value={wfSaveName} onChange={e=>setWfSaveName(e.target.value)}
                  placeholder="Workflow name (e.g. Morning Health Check)"
                  style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"7px 10px",color:"#c9d1d9",fontSize:13,boxSizing:"border-box",outline:"none",marginBottom:8}}/>
                <input value={wfSaveDesc} onChange={e=>setWfSaveDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"7px 10px",color:"#c9d1d9",fontSize:12,boxSizing:"border-box",outline:"none",marginBottom:8}}/>
                <input value={wfSaveTags} onChange={e=>setWfSaveTags(e.target.value)}
                  placeholder="Tags (e.g. monitoring, daily, network)"
                  style={{width:"100%",background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"7px 10px",color:"#c9d1d9",fontSize:12,boxSizing:"border-box",outline:"none",marginBottom:10}}/>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={saveWorkflow} disabled={wfSaving}
                    style={{padding:"6px 16px",background:wfSaving?"#1a1a1a":"#1c2a1c",border:"1px solid #238636",color:wfSaving?"#484f58":"#3fb950",borderRadius:5,cursor:wfSaving?"default":"pointer",fontSize:12,fontWeight:600}}>
                    {wfSaving?"Saving…":"Save Workflow"}
                  </button>
                  <span style={{color:"#484f58",fontSize:11}}>{workflowItems.length} step{workflowItems.length!==1?"s":""} will be saved</span>
                </div>
              </div>
            )}

            {/* ── MY SAVED WORKFLOWS PANEL ── */}
            {showSavedPanel&&(
              <div style={{marginTop:14,padding:"14px",background:"#010409",border:"1px solid #1d4ed8",borderRadius:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:9,color:"#58a6ff",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>Saved Workflows</span>
                  <span style={{fontSize:10,color:"#6b7280",background:"#21262d",borderRadius:10,padding:"1px 8px"}}>{savedWorkflows.length}</span>
                  <input value={wfSearchQuery} onChange={e=>setWfSearchQuery(e.target.value)}
                    placeholder="Search…"
                    style={{marginLeft:"auto",background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"3px 10px",color:"#c9d1d9",fontSize:11,outline:"none",width:120}}/>
                </div>

                {savedWorkflows.length===0?(
                  <div style={{color:"#484f58",fontSize:12,textAlign:"center",padding:"16px 0"}}>No saved workflows yet. Build one and click 💾 Save.</div>
                ):(
                  savedWorkflows
                    .filter(wf=>!wfSearchQuery||wf.name.toLowerCase().includes(wfSearchQuery.toLowerCase())||(wf.tags||"").toLowerCase().includes(wfSearchQuery.toLowerCase()))
                    .map(wf=>{
                      let steps=[];try{steps=JSON.parse(wf.steps);}catch{}
                      const cats=[...new Set(steps.map(s=>s.cat))];
                      const catColors={sys:"#3b82f6",pkg:"#8b5cf6",net:"#06b6d4",proc:"#ef4444",diag:"#10b981",raw:"#6b7280"};
                      return(
                        <div key={wf.id} style={{marginBottom:8,background:"#0d1117",border:"1px solid #21262d",borderRadius:7,padding:"10px 12px"}}>
                          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{color:"#e6edf3",fontSize:13,fontWeight:600}}>{wf.name}</span>
                                {cats.map(c=>(
                                  <span key={c} style={{fontSize:8,background:catColors[c]||"#6b7280",color:"#fff",borderRadius:3,padding:"1px 5px",fontWeight:700,textTransform:"uppercase"}}>{c}</span>
                                ))}
                                <span style={{color:"#484f58",fontSize:10,marginLeft:"auto"}}>{steps.length} step{steps.length!==1?"s":""}</span>
                              </div>
                              {wf.description&&<div style={{color:"#6b7280",fontSize:11,marginTop:2}}>{wf.description}</div>}
                              <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
                                {wf.tags&&wf.tags.split(",").map(t=>t.trim()).filter(Boolean).map(tag=>(
                                  <span key={tag} style={{fontSize:9,color:"#58a6ff",background:"#0d1b2e",border:"1px solid #1d4ed844",borderRadius:8,padding:"1px 6px"}}>{tag}</span>
                                ))}
                                {wf.run_count>0&&<span style={{fontSize:10,color:"#484f58"}}>▶ ran {wf.run_count}×</span>}
                              </div>
                              {/* Step preview */}
                              <div style={{display:"flex",gap:3,marginTop:6,flexWrap:"wrap"}}>
                                {steps.slice(0,6).map((s,i)=>(
                                  <span key={i} style={{fontSize:9,color:"#484f58",background:"#161b22",border:"1px solid #21262d",borderRadius:3,padding:"1px 5px",fontFamily:"monospace"}}>{s.label}</span>
                                ))}
                                {steps.length>6&&<span style={{fontSize:9,color:"#484f58"}}>+{steps.length-6} more</span>}
                              </div>
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div style={{display:"flex",gap:5,marginTop:8}}>
                            <button onClick={()=>runSavedWorkflow(wf)} disabled={workflowRunning||!connected}
                              style={{fontSize:10,padding:"3px 10px",background:"#0d1b2e",border:"1px solid #1d4ed8",color:workflowRunning||!connected?"#484f58":"#58a6ff",borderRadius:4,cursor:workflowRunning||!connected?"default":"pointer",fontWeight:600}}>
                              ▶ Run
                            </button>
                            <button onClick={()=>loadWorkflowIntoBuilder(wf)}
                              style={{fontSize:10,padding:"3px 10px",background:"#161b22",border:"1px solid #30363d",color:"#c9d1d9",borderRadius:4,cursor:"pointer"}}>
                              Load into Builder
                            </button>
                            {workflowItems.length>0&&(
                              <button onClick={()=>{if(confirm(`Overwrite "${wf.name}" with current builder queue?`))updateWorkflow(wf);}}
                                style={{fontSize:10,padding:"3px 10px",background:"#1c1505",border:"1px solid #78350f",color:"#f59e0b",borderRadius:4,cursor:"pointer"}}>
                                Update
                              </button>
                            )}
                            <button onClick={()=>{if(confirm(`Delete "${wf.name}"?`))deleteWorkflow(wf.id);}}
                              style={{fontSize:10,padding:"3px 10px",background:"#2d0a0a",border:"1px solid #7f1d1d",color:"#f87171",borderRadius:4,cursor:"pointer",marginLeft:"auto"}}>
                              ✕ Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}

          </div>
          {/* END WORKFLOW BUILDER */}

          {/* ── JOB SCHEDULER ────────────────────────────────────────── */}
          <div className="card mt-20">

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <h3 style={{margin:0}}>Job Scheduler</h3>
                <span style={{fontSize:10,color:"#6b7280",background:"#161b22",border:"1px solid #30363d",borderRadius:10,padding:"2px 9px"}}>
                  {jobs.filter(j=>j.status!=="cancelled"&&j.status!=="failed"&&!(j.job_type==="once"&&j.status==="completed")).length} active
                </span>
              </div>
            </div>

            {/* ── NEW JOB FORM ── */}
            <div style={{background:"#010409",border:"1px solid #21262d",borderRadius:8,padding:"14px 14px",marginBottom:18}}>
              <div style={{fontSize:9,color:"#484f58",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>New Scheduled Job</div>

              {/* Input mode tabs */}
              <div style={{display:"flex",gap:4,marginBottom:12}}>
                {[["drag","Drag & Drop"],["script","Paste Script"]].map(([mode,label])=>(
                  <button key={mode} onClick={()=>setJobInputMode(mode)}
                    style={{fontSize:11,padding:"4px 12px",borderRadius:5,cursor:"pointer",fontWeight:jobInputMode===mode?700:400,
                      background:jobInputMode===mode?"#1c2a1c":"#161b22",
                      border:`1px solid ${jobInputMode===mode?"#238636":"#30363d"}`,
                      color:jobInputMode===mode?"#3fb950":"#8b949e"}}>
                    {label}
                  </button>
                ))}
              </div>

              {jobInputMode==="drag"?(
                <div>
                  {/* Schedulable command palette */}
                  <div style={{marginBottom:10,padding:"10px 10px",background:"#0d1117",border:"1px solid #21262d",borderRadius:6}}>
                    <div style={{fontSize:9,color:"#484f58",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Drag a command to schedule it</div>

                    {/* Monitoring */}
                    <div style={{marginBottom:7}}>
                      <span style={{fontSize:9,color:"#f59e0b",fontWeight:700,textTransform:"uppercase",marginRight:6}}>Monitor</span>
                      {[
                        {label:"CPU Usage",cmd:"sys:cpu",cat:"sys"},
                        {label:"Memory",cmd:"sys:memory",cat:"sys"},
                        {label:"Disk Space",cmd:"sys:disk",cat:"sys"},
                        {label:"Uptime",cmd:"sys:uptime",cat:"sys"},
                        {label:"Load Avg",cmd:"cat /proc/loadavg",cat:"raw"},
                      ].map(item=>(
                        <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("job-cmd",JSON.stringify(item))}
                          style={{display:"inline-block",cursor:"grab",background:"#2a1f00",border:"1px solid #78350f",color:"#fbbf24",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="#f59e0b"} onMouseLeave={e=>e.currentTarget.style.borderColor="#78350f"}>
                          ⠿ {item.label}
                        </span>
                      ))}
                    </div>

                    {/* Network */}
                    <div style={{marginBottom:7}}>
                      <span style={{fontSize:9,color:"#06b6d4",fontWeight:700,textTransform:"uppercase",marginRight:6}}>Network</span>
                      {[
                        {label:"Ping 8.8.8.8",cmd:"net:ping 8.8.8.8",cat:"net"},
                        {label:"Interfaces",cmd:"net:ifconfig",cat:"net"},
                        {label:"Open Ports",cmd:"net:ports",cat:"net"},
                        {label:"Connectivity",cmd:"diag:connectivity",cat:"diag"},
                      ].map(item=>(
                        <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("job-cmd",JSON.stringify(item))}
                          style={{display:"inline-block",cursor:"grab",background:"#071e26",border:"1px solid #0e7490",color:"#22d3ee",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="#06b6d4"} onMouseLeave={e=>e.currentTarget.style.borderColor="#0e7490"}>
                          ⠿ {item.label}
                        </span>
                      ))}
                    </div>

                    {/* Diagnostics */}
                    <div>
                      <span style={{fontSize:9,color:"#10b981",fontWeight:700,textTransform:"uppercase",marginRight:6}}>Diagnostics</span>
                      {[
                        {label:"Health Report",cmd:"diag:health",cat:"diag"},
                        {label:"Process List",cmd:"proc:list",cat:"proc"},
                        {label:"Top Processes",cmd:"proc:top",cat:"proc"},
                        {label:"System Logs",cmd:"diag:logs",cat:"diag"},
                      ].map(item=>(
                        <span key={item.cmd} draggable onDragStart={e=>e.dataTransfer.setData("job-cmd",JSON.stringify(item))}
                          style={{display:"inline-block",cursor:"grab",background:"#051a12",border:"1px solid #065f46",color:"#34d399",borderRadius:4,fontSize:10,padding:"2px 8px",margin:"2px 3px 2px 0",userSelect:"none"}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor="#10b981"} onMouseLeave={e=>e.currentTarget.style.borderColor="#065f46"}>
                          ⠿ {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Drop zone */}
                  <div
                    onDragOver={e=>{e.preventDefault();setJobDragOver(true);}}
                    onDragLeave={()=>setJobDragOver(false)}
                    onDrop={e=>{
                      e.preventDefault();setJobDragOver(false);
                      const raw=e.dataTransfer.getData("job-cmd");
                      if(raw){try{setJobDroppedCmd(JSON.parse(raw));}catch{}}
                    }}
                    style={{minHeight:52,border:`2px dashed ${jobDragOver?"#3b82f6":"#30363d"}`,borderRadius:6,padding:"10px 14px",
                      background:jobDragOver?"#0d1f33":"#0d1117",transition:"all 0.15s",display:"flex",alignItems:"center",gap:10}}>
                    {jobDroppedCmd?(
                      <>
                        <span style={{background:{sys:"#0d1b2e",net:"#071e26",diag:"#051a12",proc:"#051a12",raw:"#161b22"}[jobDroppedCmd.cat]||"#161b22",
                          color:{sys:"#58a6ff",net:"#22d3ee",diag:"#34d399",proc:"#f87171",raw:"#8b949e"}[jobDroppedCmd.cat]||"#8b949e",
                          border:`1px solid ${({sys:"#1d4ed8",net:"#0e7490",diag:"#065f46",proc:"#7f1d1d",raw:"#30363d"})[jobDroppedCmd.cat]||"#30363d"}`,
                          borderRadius:4,fontSize:10,padding:"2px 8px",fontWeight:700,textTransform:"uppercase"}}>
                          {jobDroppedCmd.cat}
                        </span>
                        <span style={{color:"#e6edf3",fontSize:13,fontWeight:600}}>{jobDroppedCmd.label}</span>
                        <span style={{color:"#484f58",fontSize:11,fontFamily:"monospace"}}>{jobDroppedCmd.cmd}</span>
                        <button onClick={()=>setJobDroppedCmd(null)}
                          style={{marginLeft:"auto",background:"none",border:"none",color:"#484f58",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
                      </>
                    ):(
                      <span style={{color:"#484f58",fontSize:12,userSelect:"none"}}>Drop a command here to schedule it</span>
                    )}
                  </div>
                </div>
              ):(
                /* Script paste mode */
                <div>
                  <textarea
                    value={jobScript}
                    onChange={e=>setJobScript(e.target.value)}
                    placeholder={"# Paste your bash script here\n# Example:\necho \"Disk usage:\"\ndf -h\necho \"Memory:\"\nfree -m"}
                    style={{width:"100%",minHeight:110,background:"#0d1117",border:"1px solid #30363d",borderRadius:6,
                      padding:"10px 12px",color:"#c9d1d9",fontSize:12,fontFamily:"monospace",resize:"vertical",
                      boxSizing:"border-box",outline:"none"}}
                  />
                </div>
              )}

              {/* Job name */}
              <input
                value={jobName}
                onChange={e=>setJobName(e.target.value)}
                placeholder="Job name (e.g. CPU Monitor, Daily Backup)"
                style={{width:"100%",marginTop:10,background:"#0d1117",border:"1px solid #30363d",borderRadius:6,
                  padding:"8px 12px",color:"#c9d1d9",fontSize:13,boxSizing:"border-box",outline:"none"}}
              />

              {/* Schedule type */}
              <div style={{display:"flex",gap:6,marginTop:10}}>
                {[["interval","Recurring"],["once","Run Once"]].map(([t,label])=>(
                  <button key={t} onClick={()=>setJobType(t)}
                    style={{fontSize:11,padding:"4px 14px",borderRadius:5,cursor:"pointer",fontWeight:jobType===t?700:400,
                      background:jobType===t?"#0d1b2e":"#161b22",
                      border:`1px solid ${jobType===t?"#1d4ed8":"#30363d"}`,
                      color:jobType===t?"#58a6ff":"#8b949e"}}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Schedule config */}
              {jobType==="interval"?(
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
                  <span style={{color:"#6b7280",fontSize:12}}>Every</span>
                  <input type="number" min={1} value={jobIntervalValue} onChange={e=>setJobIntervalValue(e.target.value)}
                    style={{width:60,background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"5px 8px",
                      color:"#c9d1d9",fontSize:13,outline:"none",textAlign:"center"}}/>
                  <select value={jobIntervalUnit} onChange={e=>setJobIntervalUnit(e.target.value)}
                    style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"5px 10px",
                      color:"#c9d1d9",fontSize:13,outline:"none",cursor:"pointer"}}>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <span style={{color:"#484f58",fontSize:11}}>starting now</span>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
                  <span style={{color:"#6b7280",fontSize:12}}>Run at</span>
                  <input type="datetime-local" value={jobRunAt} onChange={e=>setJobRunAt(e.target.value)}
                    style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:5,padding:"5px 10px",
                      color:"#c9d1d9",fontSize:13,outline:"none",colorScheme:"dark"}}/>
                </div>
              )}

              <button
                onClick={createJob}
                disabled={jobCreating}
                style={{marginTop:12,padding:"7px 18px",background:jobCreating?"#1a1a1a":"#1c2a1c",
                  border:"1px solid #238636",color:jobCreating?"#484f58":"#3fb950",borderRadius:6,
                  cursor:jobCreating?"default":"pointer",fontSize:12,fontWeight:600}}>
                {jobCreating?"Scheduling…":"+ Schedule Job"}
              </button>
            </div>

            {/* ── JOB LIST ── */}
            {jobsLoading&&jobs.length===0?(
              <div style={{color:"#484f58",fontSize:12,textAlign:"center",padding:"12px 0"}}>Loading jobs…</div>
            ):jobs.length===0?(
              <div style={{color:"#484f58",fontSize:12,textAlign:"center",padding:"12px 0"}}>No scheduled jobs yet</div>
            ):(
              <div>
                <div style={{fontSize:9,color:"#484f58",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
                  Scheduled Jobs ({jobs.length})
                </div>
                {jobs.map(job=>{
                  const SC={pending:"#58a6ff",running:"#f59e0b",completed:"#10b981",failed:"#ef4444",cancelled:"#484f58"};
                  const sc=SC[job.status]||"#8b949e";
                  const expanded=jobExpandedId===job.id;
                  const isActive=job.status!=="cancelled"&&!(job.job_type==="once"&&job.status==="completed");
                  return(
                    <div key={job.id} style={{marginBottom:8,background:"#0d1117",border:`1px solid ${expanded?"#30363d":"#21262d"}`,borderRadius:7,overflow:"hidden"}}>
                      {/* Row */}
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer"}}
                        onClick={()=>setJobExpandedId(expanded?null:job.id)}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:sc,flexShrink:0,
                          boxShadow:job.status==="running"?`0 0 6px ${sc}`:"none"}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{color:"#e6edf3",fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{job.name}</span>
                            <span style={{fontSize:9,color:sc,background:sc+"22",border:`1px solid ${sc}44`,borderRadius:8,padding:"1px 7px",flexShrink:0,fontWeight:700,textTransform:"uppercase"}}>{job.status}</span>
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:2}}>
                            <span style={{color:"#484f58",fontSize:10,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{job.script}</span>
                            {job.job_type==="interval"?(
                              <span style={{color:"#6b7280",fontSize:10,flexShrink:0}}>every {job.interval_value} {job.interval_unit}</span>
                            ):(
                              <span style={{color:"#6b7280",fontSize:10,flexShrink:0}}>once · {job.run_at?new Date(job.run_at+"Z").toLocaleString():"-"}</span>
                            )}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          {isActive&&(
                            <button onClick={e=>{e.stopPropagation();runJobNow(job.id);}}
                              style={{fontSize:10,padding:"2px 8px",background:"#0d1b2e",border:"1px solid #1d4ed8",color:"#58a6ff",borderRadius:4,cursor:"pointer"}}>
                              ▶ Run
                            </button>
                          )}
                          {isActive&&job.job_type==="interval"&&(
                            <button onClick={e=>{e.stopPropagation();cancelJobSched(job.id);}}
                              style={{fontSize:10,padding:"2px 8px",background:"#1c1505",border:"1px solid #78350f",color:"#f59e0b",borderRadius:4,cursor:"pointer"}}>
                              ⏸
                            </button>
                          )}
                          <button onClick={e=>{e.stopPropagation();deleteJob(job.id);}}
                            style={{fontSize:10,padding:"2px 8px",background:"#2d0a0a",border:"1px solid #7f1d1d",color:"#f87171",borderRadius:4,cursor:"pointer"}}>
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Expanded: last output + meta */}
                      {expanded&&(
                        <div style={{borderTop:"1px solid #21262d",padding:"10px 12px"}}>
                          <div style={{display:"flex",gap:20,marginBottom:8}}>
                            <div><span style={{color:"#484f58",fontSize:10}}>Runs: </span><span style={{color:"#8b949e",fontSize:11}}>{job.run_count}</span></div>
                            {job.last_run_at&&<div><span style={{color:"#484f58",fontSize:10}}>Last: </span><span style={{color:"#8b949e",fontSize:11}}>{new Date(job.last_run_at+"Z").toLocaleString()}</span></div>}
                            {job.next_run_at&&isActive&&<div><span style={{color:"#484f58",fontSize:10}}>Next: </span><span style={{color:"#58a6ff",fontSize:11}}>{new Date(job.next_run_at+"Z").toLocaleString()}</span></div>}
                          </div>
                          {job.last_output?(
                            <pre style={{background:"#010409",border:"1px solid #21262d",borderRadius:5,padding:"8px 10px",
                              fontSize:11,color:job.last_success?"#8b949e":"#f87171",margin:0,
                              maxHeight:140,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                              {job.last_output}
                            </pre>
                          ):(
                            <div style={{color:"#484f58",fontSize:11}}>No output yet</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
          {/* END JOB SCHEDULER */}

          {/* ── COMMAND HISTORY ──────────────────────────────────────── */}
          <div className="card mt-20">
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: showHistory ? 14 : 0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <h3 style={{ margin:0 }}>Command History</h3>
                <span style={{ fontSize:10, color:"#6b7280", background:"#161b22", border:"1px solid #30363d", borderRadius:10, padding:"2px 9px" }}>
                  {historyItems.length}{historyHasMore ? "+" : ""}
                </span>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {showHistory && historyItems.length > 0 && (
                  <button onClick={clearHistory}
                    style={{ fontSize:10, padding:"3px 10px", background:"#2d0a0a", border:"1px solid #7f1d1d", color:"#f87171", borderRadius:4, cursor:"pointer" }}>
                    Clear All
                  </button>
                )}
                <button onClick={() => setShowHistory(s => !s)}
                  style={{ fontSize:10, padding:"3px 10px", background: showHistory ? "#0d1b2e" : "#21262d", border:`1px solid ${showHistory ? "#1d4ed8" : "#30363d"}`, color: showHistory ? "#58a6ff" : "#8b949e", borderRadius:4, cursor:"pointer" }}>
                  {showHistory ? "Hide" : "Show History"}
                </button>
              </div>
            </div>

            {showHistory && (
              <>
                {/* Search + filter bar */}
                <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
                  <input
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search commands…"
                    style={{ flex:1, background:"#010409", border:"1px solid #30363d", borderRadius:6, padding:"6px 10px", color:"#c9d1d9", fontSize:12, outline:"none" }}
                  />
                  <div style={{ display:"flex", gap:3 }}>
                    {[["all","All"],["success","Success"],["failed","Failed"]].map(([f,label]) => (
                      <button key={f} onClick={() => setHistoryFilter(f)}
                        style={{ fontSize:10, padding:"4px 10px", borderRadius:5, cursor:"pointer", fontWeight: historyFilter===f ? 700 : 400,
                          background: historyFilter===f ? (f==="success"?"#051a12":f==="failed"?"#1c0a0a":"#0d1b2e") : "#161b22",
                          border:`1px solid ${historyFilter===f ? (f==="success"?"#065f46":f==="failed"?"#7f1d1d":"#1d4ed8") : "#30363d"}`,
                          color: historyFilter===f ? (f==="success"?"#3fb950":f==="failed"?"#f87171":"#58a6ff") : "#6b7280" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* History list */}
                {historyLoading && historyItems.length === 0 ? (
                  <div style={{ color:"#484f58", fontSize:12, textAlign:"center", padding:"16px 0" }}>Loading…</div>
                ) : historyItems.length === 0 ? (
                  <div style={{ color:"#484f58", fontSize:12, textAlign:"center", padding:"16px 0" }}>
                    No command history yet.{historyFilter !== "all" ? " Try changing the filter." : " Run some commands first."}
                  </div>
                ) : (
                  <div style={{ maxHeight: 360, overflowY:"auto" }}>
                    {historyItems.map((entry, i) => {
                      const ts = new Date(entry.executed_at + "Z");
                      const timeStr = ts.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
                      const dateStr = ts.toLocaleDateString([], { month:"short", day:"numeric" });
                      const isToday = ts.toDateString() === new Date().toDateString();
                      return (
                        <div key={entry.id} style={{
                          padding:"8px 10px", marginBottom:4, borderRadius:6,
                          background: entry.success ? "#051a12" : "#1c0a0a",
                          border:`1px solid ${entry.success ? "#0d2a1a" : "#2d1010"}`,
                          transition:"background 0.1s",
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = entry.success ? "#071f14" : "#221010"}
                          onMouseLeave={e => e.currentTarget.style.background = entry.success ? "#051a12" : "#1c0a0a"}
                        >
                          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom: entry.output ? 4 : 0 }}>
                            <span style={{ color: entry.success ? "#10b981" : "#ef4444", fontSize:11, fontWeight:700, flexShrink:0 }}>
                              {entry.success ? "✓" : "✗"}
                            </span>
                            <span style={{ background:cmd_cat_colors[entry.category]||"#6b7280", color:"#fff", fontSize:8, padding:"1px 5px", borderRadius:3, fontWeight:700, textTransform:"uppercase", flexShrink:0 }}>
                              {entry.category}
                            </span>
                            <span style={{ color:"#e6edf3", fontSize:12, fontFamily:"monospace", fontWeight:500, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {entry.command}
                            </span>
                            <span style={{ color:"#484f58", fontSize:10, flexShrink:0 }}>
                              {entry.execution_time_ms != null ? `${entry.execution_time_ms}ms` : ""}
                            </span>
                            <span style={{ color:"#484f58", fontSize:10, flexShrink:0 }}>
                              {isToday ? timeStr : `${dateStr} ${timeStr}`}
                            </span>
                            <button
                              onClick={() => sendCommand(entry.command)}
                              disabled={!connected}
                              title="Re-run this command"
                              style={{ fontSize:10, padding:"2px 8px", background:"#0d1b2e", border:"1px solid #1d4ed8", color: connected ? "#58a6ff" : "#484f58", borderRadius:4, cursor: connected ? "pointer" : "default", flexShrink:0 }}>
                              ▶
                            </button>
                          </div>
                          {entry.output && (
                            <div style={{ fontFamily:"monospace", fontSize:10, color:"#8b949e", marginLeft:22, marginTop:2, whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:60, overflow:"hidden", textOverflow:"ellipsis" }}>
                              {entry.output.slice(0, 200)}{entry.output.length > 200 ? "…" : ""}
                            </div>
                          )}
                          {!entry.success && entry.error && (
                            <div style={{ fontFamily:"monospace", fontSize:10, color:"#f87171", marginLeft:22, marginTop:2 }}>
                              {entry.error.slice(0, 120)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Load more */}
                {historyHasMore && (
                  <button onClick={() => loadHistory(false)} disabled={historyLoading}
                    style={{ width:"100%", marginTop:10, padding:"7px", background:"#161b22", border:"1px solid #30363d", color:"#8b949e", borderRadius:6, cursor: historyLoading ? "default" : "pointer", fontSize:12 }}>
                    {historyLoading ? "Loading…" : "Load More"}
                  </button>
                )}
              </>
            )}
          </div>
          {/* END COMMAND HISTORY */}







        </div>















        {/* CONSOLE */}







        <div className="console">







          <div className="console-wrapper">















            <div className="console-header">







              <div className="dot red"></div>







              <div className="dot yellow"></div>







              <div className="dot green"></div>







            </div>







            <button







              className="clear-btn"







              onClick={clearTerminal}







              title="Clear terminal"







            >







              Clear







            </button>















            <div className="console-body" ref={consoleRef}>







              {logs.map((l, i) => (







                l.startsWith?.("\x00ROUTE\x00")
                  ? (() => { const [,cat,action,priority] = l.split("\x00").filter(Boolean); const CC={"sys":"#3b82f6","pkg":"#8b5cf6","net":"#06b6d4","file":"#f59e0b","proc":"#ef4444","diag":"#10b981","raw":"#6b7280"}; const PC={"CRITICAL":"#ef4444","HIGH":"#f97316","NORMAL":"#3b82f6","LOW":"#6b7280"}; return <div key={i} style={{display:"flex",alignItems:"center",gap:6,opacity:0.5,fontSize:11,marginTop:2}}><span style={{color:"#30363d"}}>↳</span><span style={{background:CC[cat]||"#6b7280",color:"#fff",fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:700,textTransform:"uppercase"}}>{cat}</span><span style={{color:"#484f58"}}>{action}</span><span style={{color:PC[priority]||"#6b7280",fontSize:9}}>{priority}</span><span style={{color:"#21262d",fontSize:9,marginLeft:"auto"}}>routing…</span></div>; })()
                  : l.startsWith?.("\x00META\x00")
                  ? (() => { const p=l.split("\x00").filter(Boolean); const [,cat,action,ms,succ,cached]=p; const CC={"sys":"#3b82f6","pkg":"#8b5cf6","net":"#06b6d4","file":"#f59e0b","proc":"#ef4444","diag":"#10b981","raw":"#6b7280"}; const ok=succ==="true"; const hit=cached==="true"; return <div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:6,marginTop:1,borderTop:"1px solid #161b22",paddingTop:2}}><span style={{color:ok?"#10b981":"#ef4444",fontSize:11}}>{ok?"✓":"✗"}</span><span style={{background:CC[cat]||"#6b7280",color:"#fff",fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:700,textTransform:"uppercase"}}>{cat}</span><span style={{color:"#484f58",fontSize:10}}>{action}</span>{hit?<span style={{color:"#f59e0b",fontSize:9,fontWeight:700,marginLeft:"auto"}}>⚡ CACHED · 0ms</span>:<span style={{color:"#484f58",fontSize:9,marginLeft:"auto"}}>{ms}ms</span>}</div>; })()
                  : l.startsWith?.("\x00SYS\x00")
                  ? <div key={i} style={{color:"#58a6ff",fontSize:11,opacity:0.8,marginBottom:2}}>{l.slice(5)}</div>
                  : <div key={i} style={{whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{l}</div>







              ))}







            </div>















          </div>







        </div>















      </main>







      {/* Session Naming Dialog */}



      {showNameDialog && (



        <div style={{



          position: "fixed",



          top: 0,



          left: 0,



          right: 0,



          bottom: 0,



          backgroundColor: "rgba(0, 0, 0, 0.5)",



          display: "flex",



          justifyContent: "center",



          alignItems: "center",



          zIndex: 1000



        }}>



          <div style={{



            backgroundColor: "white",



            padding: "24px",



            borderRadius: "12px",



            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",



            minWidth: "400px"



          }}>



            <h3 style={{ margin: "0 0 16px 0" }}>Name This Session</h3>



            <p style={{ margin: "0 0 16px 0", color: "#6b7280" }}>



              Give this session a memorable name to easily identify it in reports.



            </p>



            <input



              type="text"



              placeholder="e.g., Database Migration, Server Setup"



              value={sessionName}



              onChange={(e) => setSessionName(e.target.value)}



              style={{



                width: "100%",



                padding: "12px",



                border: "1px solid #e5e7eb",



                borderRadius: "6px",



                fontSize: "14px"



              }}



              autoFocus



            />



            <div style={{ 



              display: "flex", 



              gap: "12px", 



              justifyContent: "flex-end", 



              marginTop: "20px" 



            }}>



              <button



                onClick={() => setShowNameDialog(false)}



                style={{



                  padding: "10px 16px",



                  border: "1px solid #e5e7eb",



                  backgroundColor: "white",



                  borderRadius: "6px",



                  cursor: "pointer"



                }}



              >



                Cancel



              </button>



              <button



                onClick={saveSessionName}



                disabled={!sessionName.trim()}



                style={{



                  padding: "10px 16px",



                  border: "none",



                  backgroundColor: sessionName.trim() ? "#3b82f6" : "#9ca3af",



                  color: "white",



                  borderRadius: "6px",



                  cursor: sessionName.trim() ? "pointer" : "not-allowed"



                }}



              >



                Save Name



              </button>



            </div>



          </div>



        </div>



      )}



    </div>



  );



}



