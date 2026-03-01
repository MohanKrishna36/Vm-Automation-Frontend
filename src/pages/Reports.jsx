import { useMemo, useState, useEffect } from "react";
import { useVM } from "../contexts/VMContext";

export default function Reports() {
  const token = localStorage.getItem("token");
  const { sessionReports } = useVM();
  
  // Transform session reports to match existing UI structure
  const runs = useMemo(() => {
    return sessionReports.map(report => {
      // Determine actual status based on failed commands
      const hasFailures = report.failedCommands > 0;
      const successRate = parseFloat(report.successRate);
      
      let actualStatus;
      if (report.totalCommands === 0) {
        actualStatus = "SUCCESS"; // No commands = successful by default
      } else if (successRate >= 90) {
        actualStatus = "SUCCESS";
      } else if (successRate >= 50) {
        actualStatus = "PARTIAL";
      } else {
        actualStatus = "FAILED";
      }
      
      return {
        jobId: report.sessionId,
        vm: report.vmHost,
        user: "current-user", // Could be enhanced with actual user data
        command: report.commands.length > 0 ? report.commands[report.commands.length - 1].command : "No commands",
        status: actualStatus,
        submittedAt: new Date(report.generatedAt).toLocaleString(),
        sessionName: report.sessionName, // Add session name
        metrics: {
          ttfoMs: 100, // Placeholder - would need actual timing data
          connectMs: 200,
          execMs: parseInt(report.averageExecutionTime) || 500,
          totalMs: report.duration,
          exitCode: hasFailures ? 1 : 0
        },
        // Extended metrics for detailed view
        sessionDetails: {
          totalCommands: report.totalCommands,
          successfulCommands: report.successfulCommands,
          failedCommands: report.failedCommands,
          successRate: report.successRate,
          sessionDuration: report.duration,
          startTime: report.startTime,
          endTime: report.endTime,
          allCommands: report.commands,
          sessionName: report.sessionName // Add session name to details
        }
      };
    });
  }, [sessionReports]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState(null); // Fix: Don't select first item when no reports exist

  const filteredRuns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      const okQuery =
        !q ||
        r.jobId.toLowerCase().includes(q) ||
        r.vm.toLowerCase().includes(q) ||
        r.user.toLowerCase().includes(q) ||
        r.command.toLowerCase().includes(q) ||
        r.sessionName?.toLowerCase().includes(q); // Add session name to search
      
      const okStatus = statusFilter === "ALL" ? true : r.status === statusFilter;
      return okQuery && okStatus;
    });
  }, [query, statusFilter, runs]); // Add runs dependency

  const stats = useMemo(() => {
    const list = filteredRuns;

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
    if (status === "SUCCESS") {
      return <span className="badge badge-success">{status}</span>;
    } else if (status === "FAILED") {
      return <span className="badge badge-failed">{status}</span>;
    } else if (status === "PARTIAL") {
      return <span className="badge" style={{ backgroundColor: "#f59e0b", color: "white" }}>{status}</span>;
    }
    return <span className="badge">{status}</span>;
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
            Showing VM session performance metrics. Reports are automatically generated when you disconnect from a VM.
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
              <option value="PARTIAL">Partial</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Runs table */}
          <div className="runs-table mt-20">
            <div className="runs-head">
              <div>Session</div>
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
                <div className="mono">{r.sessionName || 'Unnamed'}</div>
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

            {!filteredRuns.length && runs.length > 0 ? (
              <div className="muted mt-12">No reports found matching your filters.</div>
            ) : runs.length === 0 ? (
              <div className="muted mt-12">No reports available. Start a VM session to generate reports.</div>
            ) : null}
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
                {selected.sessionName || 'Unnamed Session'} • {selected.vm}
              </p>

              <div className="detail-block mt-20">
                <div className="detail-label">Session Name</div>
                <div className="detail-value">{selected.sessionName || 'Unnamed Session'}</div>
              </div>

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
                <div className="detail-label">Session Performance</div>
                <div className="timing-grid mt-12">
                  <div className="timing-card">
                    <div className="stat-label">Total Commands</div>
                    <div className="stat-value">{selected.sessionDetails?.totalCommands || 0}</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">Success Rate</div>
                    <div className="stat-value">{selected.sessionDetails?.successRate || 0}%</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">Session Duration</div>
                    <div className="stat-value">{fmtMs(selected.sessionDetails?.sessionDuration || 0)}</div>
                  </div>
                  <div className="timing-card">
                    <div className="stat-label">Avg Command Time</div>
                    <div className="stat-value">{fmtMs(selected.sessionDetails?.sessionDuration / (selected.sessionDetails?.totalCommands || 1))}</div>
                  </div>
                </div>
              </div>

              <div className="detail-block mt-20">
                <div className="detail-label">Command History</div>
                <div className="detail-value" style={{ maxHeight: "200px", overflowY: "auto", fontSize: "12px" }}>
                  {selected.sessionDetails?.allCommands?.map((cmd, idx) => (
                    <div key={idx} style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="mono">{cmd.command}</span>
                        <span style={{ color: cmd.success ? "#22c55e" : "#ef4444" }}>
                          {cmd.success ? "✓" : "✗"} {fmtMs(cmd.executionTime)}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: "11px" }}>
                        {new Date(cmd.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  )) || <div className="muted">No commands recorded</div>}
                </div>
              </div>

              <div className="detail-block mt-20">
                <div className="detail-label">Session Timeline</div>
                <div className="detail-grid mt-12">
                  <div className="detail-item">
                    <div className="detail-label">Started At</div>
                    <div className="detail-value">{selected.sessionDetails?.startTime ? new Date(selected.sessionDetails.startTime).toLocaleString() : "N/A"}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Ended At</div>
                    <div className="detail-value">{selected.sessionDetails?.endTime ? new Date(selected.sessionDetails.endTime).toLocaleString() : "N/A"}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
