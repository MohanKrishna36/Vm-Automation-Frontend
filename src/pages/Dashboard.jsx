import { useEffect, useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [vms, setVMs] = useState([]);
  const [form, setForm] = useState({
    host: "",
    username: "",
    password: ""
  });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token");

  /* ---------- LOAD VM LIST ---------- */
  const loadVMs = async () => {
    if (!token) return;
    try {
      const res = await api.get("/vm/list");
      setVMs(res.data);
    } catch {
      alert("Failed to load VM list");
    }
  };

  useEffect(() => {
    loadVMs();
  }, []);

  /* ---------- CONNECT VM ---------- */
  const connectVM = async () => {
    if (!token) {
      alert("Please login first");
      window.location.href = "/login";
      return;
    }

    const { host, username, password } = form;
    if (!host || !username || !password) {
      alert("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      await api.post("/vm/connect", form);
      setForm({ host: "", username: "", password: "" });
      loadVMs();
    } catch (err) {
      alert(err.response?.data?.detail || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h2>Automation Tool</h2>

        <div className="nav-item active">Dashboard</div>
        <div
          className="nav-item"
          onClick={() => (window.location.href = "/reports")}
        >
          Reports
        </div>

        {token && (
          <div
            className="logout"
            onClick={() => {
              localStorage.clear();
              window.location.href = "/login";
            }}
          >
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

            <input
              placeholder="Host / IP address"
              value={form.host}
              onChange={(e) =>
                setForm({ ...form, host: e.target.value })
              }
            />

            <input
              placeholder="Username"
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
            />

            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
            />

            <button
              className="primary mt-12"
              disabled={loading}
              onClick={connectVM}
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
          </div>

          {/* VM LIST */}
          <div className="card vm-container mt-24">
            <h3>VM List</h3>

            {vms.length === 0 && (
              <p style={{ color: "#6b7280" }}>
                No virtual machines found
              </p>
            )}

            {vms.map((vm) => (
              <div
                key={vm.host}
                className="card vm-item"
                onClick={() => {
                  if (!token) {
                    alert("Please login first");
                    window.location.href = "/login";
                    return;
                  }

                  if (!vm.is_busy) {
                    alert("VM is not connected yet");
                    return;
                  }

                  window.location.href = `/vm/${vm.id}`;
                }}
              >
                <strong>{vm.host}</strong>

                <div style={{ marginTop: 6 }}>
                  {vm.is_busy ? (
                    <span style={{ color: "#f59e0b" }}>
                      Busy
                    </span>
                  ) : (
                    <span style={{ color: "#22c55e" }}>
                      Available
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN – INFO */}
        <div className="console">
          <div className="console-header">
            <div className="dot red"></div>
            <div className="dot yellow"></div>
            <div className="dot green"></div>
          </div>

          <div>
            <strong>Welcome</strong>
            <br /><br />
            This dashboard allows you to:
            <br />• Connect to Alpine Linux VMs
            <br />• Manage system operations
            <br />• Install packages safely
            <br />• Run remote commands
            <br /><br />
            Select a VM from the list once connected.
          </div>
        </div>
      </main>
    </div>
  );
}
