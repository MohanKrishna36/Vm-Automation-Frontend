import { useParams } from "react-router-dom";
import { useState } from "react";
import api from "../api";

const packages = [
  "git","curl","wget","nano","vim","htop","bash","openssh","screen","tmux",
  "python3","py3-pip","nodejs","npm","docker","busybox-extras","jq","zip",
  "unzip","tree","rsync","tcpdump","net-tools","bind-tools","openssl",
  "make","gcc","g++"
];

export default function VM() {
  const { host } = useParams();
  const [cmd, setCmd] = useState("");
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);

  if (!localStorage.getItem("token")) {
    alert("Please login first");
    window.location.href = "/login";
    return null;
  }

  const run = async (command) => {
    if (!command) return;

    setRunning(true);
    setLogs(l => [...l, `$ ${command}`, "⏳ Running..."]);

    try {
      const res = await api.post(
        `/vm/command?host=${host}&command=${encodeURIComponent(command)}`
      );

      setLogs(l => [
        ...l.filter(x => x !== "⏳ Running..."),
        res.data.output || "✔ Command executed"
      ]);
    } catch {
      setLogs(l => [
        ...l.filter(x => x !== "⏳ Running..."),
        "⚠ Connection lost (VM rebooting or powered off)"
      ]);
    } finally {
      setRunning(false);
    }
  };

  const disconnect = async () => {
    await api.post("/vm/disconnect", { host });
    window.location.href = "/dashboard";
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>{host}</h2>
        <div className="nav-item" onClick={()=>window.location.href="/dashboard"}>
          ← Back
        </div>
      </aside>

      <main className="main">
        <div>
          {/* STATUS */}
          <div className="card">
            <h3>VM Status</h3>

            <div className="status-row">
              <span className="status-label">Connected</span>
              <span className="status-value">Yes</span>
            </div>

            <div className="status-row">
              <span className="status-label">Owner</span>
              <span className="status-value">You</span>
            </div>

            <div className="status-row">
              <span className="status-label">Host</span>
              <span className="status-value">{host}</span>
            </div>
          </div>

          {/* SYSTEM OPS */}
          <div className="card mt-20">
            <h3>System Operations</h3>

            <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <button
                className="warn"
                disabled={running}
                onClick={()=>{
                  if (window.confirm("Reboot VM now?")) run("reboot");
                }}
              >
                Reboot VM
              </button>

              <button
                className="danger"
                disabled={running}
                onClick={()=>{
                  if (window.confirm("Power off VM now?")) run("poweroff");
                }}
              >
                Power Off VM
              </button>

              <button className="accent" onClick={disconnect}>
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
                  disabled={running}
                  onClick={()=>run(`apk add ${p}`)}
                >
                  {p}
                </button>
              ))}
            </div>

            {running && (
              <div className="console-status">
                <span className="spinner"></span> Executing command…
              </div>
            )}
          </div>

          {/* CUSTOM COMMAND */}
          <div className="card mt-20">
            <h3>Run Command</h3>

            <input
              placeholder="e.g. ls -la"
              value={cmd}
              onChange={e=>setCmd(e.target.value)}
            />

            <button
              className="accent mt-12"
              disabled={running}
              onClick={()=>run(cmd)}
            >
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

            <div className="console-body">
              {logs.map((l,i)=><div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
