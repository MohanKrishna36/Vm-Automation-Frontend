export default function Reports() {
  const token = localStorage.getItem("token");

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Automation Tool</h2>
        <div className="nav-item" onClick={()=>window.location.href="/dashboard"}>Dashboard</div>
        <div className="nav-item active">Reports</div>

        {token && (
          <div
            className="logout"
            onClick={()=>{
              localStorage.clear();
              window.location.href="/login";
            }}
          >
            Logout
          </div>
        )}
      </aside>

      <main className="main">
        <div className="card">
          <h2>No reports yet</h2>
          <p className="muted">
            Reports will appear once automation jobs are executed.
          </p>
        </div>
      </main>
    </div>
  );
}
