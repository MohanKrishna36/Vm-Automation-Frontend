import { useState } from "react";
import api from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!username || !password) {
      alert("Please enter username and password");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.access_token);
      window.location.href = "/dashboard";
    } catch {
      alert("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f8fafc"
      }}
    >
      <div className="card" style={{ width: 360 }}>
        <h2 style={{ textAlign: "center" }}>Login</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="primary"
          disabled={loading}
          onClick={login}
          style={{ width: "100%" }}
        >
          {loading ? <span className="spinner"></span> : "Login"}
        </button>

        {/* CREATE ACCOUNT LINK */}
        <div
          style={{
            marginTop: 16,
            textAlign: "center",
            fontSize: 14
          }}
        >
          Don’t have an account?{" "}
          <span
            style={{
              color: "#2563eb",
              cursor: "pointer",
              fontWeight: 500
            }}
            onClick={() => (window.location.href = "/signup")}
          >
            Create account
          </span>
        </div>
      </div>
    </div>
  );
}
