import { useState } from "react";
import api from "../api";

export default function Signup() {
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);

  const signup = async () => {
    setLoading(true);
    try {
      await api.post("/auth/signup",{username,password});
      window.location.href="/login";
    } catch {
      alert("Signup failed");
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
      <h2 style={{ textAlign: "center" }}>Create Account</h2>

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
        onClick={signup}
        style={{ width: "100%" }}
      >
        {loading ? <span className="spinner"></span> : "Create Account"}
      </button>

      {/* OPTIONAL: Back to login */}
      <div
        style={{
          marginTop: 16,
          textAlign: "center",
          fontSize: 14
        }}
      >
        Already have an account?{" "}
        <span
          style={{
            color: "#2563eb",
            cursor: "pointer",
            fontWeight: 500
          }}
          onClick={() => (window.location.href = "/login")}
        >
          Login
        </span>
      </div>
    </div>
  </div>
);

}
