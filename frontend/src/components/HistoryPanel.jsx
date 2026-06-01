import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { apiFetch, exportHistoryUrl, getToken } from '../api';
import SessionDetail from './SessionDetail';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function duration(start, end) {
  if (!start) return '—';
  const endTs = end || Date.now() / 1000;
  const sec = Math.max(0, Math.floor(endTs - start));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function HistoryPanel({ classCode }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    if (!classCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(
          `/api/analytics/history?class_code=${encodeURIComponent(classCode)}`,
        );
        if (!cancelled) setHistory(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classCode]);

  const handleExport = () => {
    const token = getToken();
    const url = exportHistoryUrl(classCode);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `attention_${classCode}.csv`;
        a.click();
      })
      .catch(() => setError('Export failed'));
  };

  const chartData = useMemo(() => {
    const recent = history.slice(0, 12).reverse();
    return {
      labels: recent.map((h) => `${h.roll_number}`),
      datasets: [
        {
          label: 'Avg Attention %',
          data: recent.map((h) => h.avg_attention),
          backgroundColor: 'rgba(90, 160, 240, 0.6)',
          borderRadius: 6,
        },
        {
          label: 'Alerts',
          data: recent.map((h) => h.alerts_count),
          backgroundColor: 'rgba(224, 64, 64, 0.5)',
          borderRadius: 6,
        },
      ],
    };
  }, [history]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af' } },
    },
    scales: {
      x: { ticks: { color: '#7a7c8e' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#7a7c8e' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };

  if (loading) {
    return <div className="history-loading">Loading session history…</div>;
  }

  if (error) {
    return <div className="history-error">Failed to load history: {error}</div>;
  }

  return (
    <div className="history-view">
      <div className="panel glass history-chart-panel">
        <div className="panel-header">
          <h2>Session Analytics — {classCode}</h2>
          <div className="header-actions">
            <span className="muted">{history.length} sessions</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleExport}>
              Export CSV
            </button>
          </div>
        </div>
        <div className="history-chart-wrap">
          {history.length === 0 ? (
            <p className="empty-history">No sessions recorded yet.</p>
          ) : (
            <Bar data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      <div className="panel glass history-table-panel">
        <div className="panel-header">
          <h2>Historical Sessions</h2>
        </div>
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll</th>
                <th>Class</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Avg Attn</th>
                <th>Alerts</th>
                <th>Logs</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr
                  key={row.id}
                  className="clickable-row"
                  onClick={() => setSelectedSession(row.id)}
                >
                  <td>{row.name}</td>
                  <td className="mono">{row.roll_number}</td>
                  <td>{row.class_code}</td>
                  <td className="mono-sm">{formatTime(row.start_time)}</td>
                  <td>{duration(row.start_time, row.end_time)}</td>
                  <td>
                    <span
                      className={
                        row.avg_attention >= 70
                          ? 'pill pill-good'
                          : row.avg_attention >= 40
                            ? 'pill pill-warn'
                            : 'pill pill-bad'
                      }
                    >
                      {row.avg_attention}%
                    </span>
                  </td>
                  <td>{row.alerts_count}</td>
                  <td>{row.log_count}</td>
                  <td>
                    <span className={`pill ${row.status === 'active' ? 'pill-active' : 'pill-off'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SessionDetail
        sessionId={selectedSession}
        onClose={() => setSelectedSession(null)}
        onDeleted={() => {
          setSelectedSession(null);
          setHistory((prev) => prev.filter((r) => r.id !== selectedSession));
        }}
      />
    </div>
  );
}
