import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import api from "../api";

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
  const { vmId, host } = useParams(); // vmId is IMPORTANT
  const navigate = useNavigate();
  const consoleRef = useRef(null);

  const socketRef = useRef(null);

  const [logs, setLogs] = useState([]);
  const [cmd, setCmd] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
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
  // 🚀 create session + open websocket ONCE
  useEffect(() => {
    let ws;

    const startSession = async () => {
      try {
        // 1️⃣ create session
        const res = await api.post(`/session/create/${vmId}`);
        const { session_id } = res.data;

        // 2️⃣ open websocket
        ws = new WebSocket(`ws://localhost:8000/session/ws/${session_id}`);
        socketRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setLogs(["🟢 Connected to VM terminal"]);
          setLoading(false);
        };

        // ws.onmessage = (e) => {
        //   setLogs(prev => [...prev, e.data]);
        // };

        ws.onmessage = (e) => {
        const clean = stripAnsi(e.data);
        if (!clean.trim()) return;

        setLogs(prev => [...prev, clean]);
      };

        ws.onerror = () => {
          setLogs(prev => [...prev, "⚠ WebSocket error"]);
        };

        ws.onclose = () => {
          setConnected(false);
          setLogs(prev => [...prev, "🔴 Terminal disconnected"]);
        };

      } catch (err) {
        alert("Failed to start VM session");
        navigate("/dashboard");
      }
    };

    startSession();

    // 🧹 cleanup on page exit
    return () => {
      if (ws) ws.close();
    };
  }, [vmId, navigate]);

  // ⌨️ send command
  const sendCommand = (command) => {
    if (!command || !socketRef.current || socketRef.current.readyState !== 1)
      return;

    setLogs(prev => [...prev, `$ ${command}`]);
    socketRef.current.send(command + "\n");
    setCmd("");
  };

  // 🔌 disconnect VM (explicit)
  const disconnectVM = async () => {
    if (window.confirm("Disconnect VM?")) {
      try {
        if (socketRef.current) socketRef.current.close();
        await api.post("/vm/disconnect", { host });
        navigate("/dashboard");
      } catch {
        alert("Failed to disconnect VM");
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
          ← Back
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
                Disconnect
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
    </div>
  );
}

