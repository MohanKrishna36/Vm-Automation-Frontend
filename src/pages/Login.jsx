import { useState } from "react";
import api from "../api";

export default function Login() {
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);

  const login = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/login",{username,password});
      localStorage.setItem("token",res.data.access_token);
      window.location.href="/dashboard";
    } catch {
      alert("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Login</h2>

      <input placeholder="Username" onChange={e=>setUsername(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e=>setPassword(e.target.value)} />

      <button className="primary" disabled={loading} onClick={login}>
        {loading ? <span className="spinner"></span> : "Login"}
      </button>
    </div>
  );
}
