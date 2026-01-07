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
    <div className="card">
      <h2>Create Account</h2>

      <input placeholder="Username" onChange={e=>setUsername(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e=>setPassword(e.target.value)} />

      <button className="primary" disabled={loading} onClick={signup}>
        {loading ? <span className="spinner"></span> : "Create Account"}
      </button>
    </div>
  );
}
