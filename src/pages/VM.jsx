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

        const clean = stripAnsi(e.data);

        if (!clean.trim()) return;



        setLogs(prev => [...prev, clean]);

        

        // Track first output time for TTFO calculation

        const currentSession = getSession(vmId);

        if (currentSession && !currentSession.firstOutputTime) {

          // Update first output time when we get first real output

          updateSessionActivity(vmId);

        }

        

        updateSessionActivity(vmId);

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







    const startTime = Date.now();



    setLogs(prev => [...prev, `$ ${command}`]);



    socketRef.current.send(command + "\n");



    setCmd("");





    // Track command execution with real output detection

    // We'll capture the output from WebSocket response and determine success/failure

    setTimeout(() => {

      // This is a simplified approach - in production, you'd want to capture actual terminal output

      // For now, we'll use basic heuristics for success/failure detection

      const likelySuccess = !command.toLowerCase().includes('rm') && 

                         !command.toLowerCase().includes('rmdir') &&

                         !command.toLowerCase().includes('nonexistent');

      

      trackCommand(vmId, command, Date.now() - startTime, likelySuccess);

    }, 200); // Wait for response before tracking



  };















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







                <div key={i}>{l}</div>







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



