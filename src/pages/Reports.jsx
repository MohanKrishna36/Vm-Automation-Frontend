import { useMemo, useState } from "react";

export default function Reports() {
  const token = localStorage.getItem("token");

  // Dummy data (UI preview)
  const runs = [
    {
      jobId: "JOB-10231",
      vm: "alpine-vm-01",
      user: "raghavendra",
      command: "apk add --no-cache htop",
      status: "SUCCESS",
      submittedAt: "2026-01-20 18:10:21",
      metrics: { ttfoMs: 180, connectMs: 420, execMs: 6450, totalMs: 7050, exitCode: 0 },
    },
    {
      jobId: "JOB-10232",
      vm: "alpine-vm-02",
      user: "raghavendra",
      command: "cat /etc/os-release",
      status: "SUCCESS",
      submittedAt: "2026-01-20 18:11:04",
      metrics: { ttfoMs: 95, connectMs: 380, execMs: 120, totalMs: 540, exitCode: 0 },
    },
    {
      jobId: "JOB-10233",
      vm: "alpine-vm-03",
      user: "sir",
      command: "apk update",
      status: "FAILED",
      submittedAt: "2026-01-20 18:12:10",
      metrics: { ttfoMs: 260, connectMs: 510, execMs: 3500, totalMs: 4250, exitCode: 1 },
    },
    {
      jobId: "JOB-10234",
      vm: "alpine-vm-01",
      user: "sir",
      command: "sleep 5; echo done",
      status: "SUCCESS",
      submittedAt: "2026-01-20 18:13:02",
      metrics: { ttfoMs: 40, connectMs: 120, execMs: 5100, totalMs: 5320, exitCode: 0 },
    },
  ];

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState(runs[0]);

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      const okQuery =
        !q ||
        r.jobId.toLowerCase().includes(q) ||
        r.vm.toLowerCase().includes(q) ||
        r.user.toLowerCase().includes(q) ||
        r.command.toLowerCase().includes(q);

      const okStatus = statusFilter === "ALL" ? true : r.status === statusFilter;
      return okQuery && okStatus;
    });
  }, [query, statusFilter]);

  const stats = useMemo(() => {
    const list = filteredRuns.length ? filteredRuns : runs;

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

    const avgTtfo = avg(list.map((r) => r.metrics.ttfoMs));
    const avgTotal = avg(list.map((r) => r.metrics.totalMs));
    const successRate = (list.filter((r) => r.status === "SUCCESS").length / list.length) * 100;

    // commands/min: N divided by total time minutes (simple dummy throughput)
    const totalMinutes = list.reduce((a, r) => a + r.metrics.totalMs, 0) / 1000 / 60;
    const throughput = list.length / Math.max(1e-9, totalMinutes);

    return { avgTtfo, avgTotal, successRate, throughput };
  }, [filteredRuns]);

  const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`);

  const StatusBadge = ({ status }) => {
    const cls = status === "SUCCESS" ? "badge badge-success" : "badge badge-failed";
    return <span className={cls}>{status}</span>;
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Automation Tool</h2>
        <div className="nav-item" onClick={() => (window.location.href = "/dashboard")}>
          Dashboard
        </div>
        <div className="nav-item active">Reports</div>

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

      <main className="main reports-main">
        {/* LEFT: Runs + summary */}
        <div className="card">
          <h2>Reports</h2>
          <p className="muted">
            Showing execution metrics (TTFO, total time, throughput, success rate). Dummy data preview.
          </p>

          {/* Summary cards */}
          <div className="stats-grid mt-20">
            <div className="stat-card">
              <div className="stat-label">Avg TTFO</div>
              <div className="stat-value">{fmtMs(Math.round(stats.avgTtfo))}</div>
              <div className="stat-hint">Time to first output</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Avg Total Time</div>
              <div className="stat-value">{fmtMs(Math.round(stats.avgTotal))}</div>
              <div className="stat-hint">End-to-end completion</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Success Rate</div>
              <div className="stat-value">{stats.successRate.toFixed(1)}%</div>
              <div className="stat-hint">Reliability</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Throughput</div>
              <div className="stat-value">{stats.throughput.toFixed(1)}/min</div>
              <div className="stat-hint">Commands per minute</div>
            </div>
          </div>

          {/* Filters */}
          <div className="filters mt-20">
            <input
              placeholder="Search by job id, VM, user, command..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Runs table */}
          <div className="runs-table mt-20">
            <div className="runs-head">
              <div>Job</div>
              <div>VM</div>
              <div>Command</div>
              <div>Status</div>
              <div>TTFO</div>
              <div>Total</div>
            </div>

            {filteredRuns.map((r) => (
              <div
                key={r.jobId}
                className={`runs-row ${selected?.jobId === r.jobId ? "selected" : ""}`}
                onClick={() => setSelected(r)}
              >
                <div className="mono">{r.jobId}</div>
                <div>{r.vm}</div>
                <div className="truncate" title={r.command}>
                  {r.command}
                </div>
                <div>
                  <StatusBadge status={r.status} />
                </div>
                <div>{fmtMs(r.metrics.ttfoMs)}</div>
                <div>{fmtMs(r.metrics.totalMs)}</div>
              </div>
            ))}

            {!filteredRuns.length && (
              <div className="muted mt-12">No report runs found.</div>
            )}
          </div>
        </div>

        {/* RIGHT: Run details */}
        <div className="card">
          {!selected ? (
            <>
              <h2>No run selected</h2>
              <p className="muted">Select a run from the table to view detailed metrics.</p>
            </>
          ) : (
            <>
              <h2>Run Details</h2>
              <p className="muted">
                {selected.jobId} • {selected.vm}
              </p>

              <div className="detail-block mt-20">
                <div className="detail-label">Command</div>
                <div className="detail-value mono">{selected.command}</div>
              </div>

              <div className="detail-grid mt-20">
                <div className="detail-item">
                  <div className="detail-label">User</div>
                  <div className="detail-value">{selected.user}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Submitted At</div>
                  <div className="detail-value">{selected.submittedAt}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Status</div>
                  <div className="detail-value">
                    <StatusBadge status={selected.status} />{" "}
                    <span className="muted">Exit: {selected.metrics.exitCode}</span>
                  </div>
                </div>
              </div>

              <div className="detail-block mt-24">
                <div className="detail-label">Timing Breakdown</div>
                <div className="timing-grid mt-12">
                  <div className="timing-card">
                    <div className="stat-label">TTFO</div>
                    <div className="stat-value">{fmtMs(selected.metrics.ttfoMs)}</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">SSH Connect</div>
                    <div className="stat-value">{fmtMs(selected.metrics.connectMs)}</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">Execution</div>
                    <div className="stat-value">{fmtMs(selected.metrics.execMs)}</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">Total</div>
                    <div className="stat-value">{fmtMs(selected.metrics.totalMs)}</div>
                  </div>
                </div>
              </div>

              <div className="muted mt-20">
                Note: This is dummy UI data. In real implementation, metrics will be computed using backend timestamps.
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
