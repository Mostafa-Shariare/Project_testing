import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { apiFetch } from '../api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function SessionDetail({ sessionId, onClose, onDeleted }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/analytics/session/${sessionId}`);
        if (!cancelled) setSession(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) return null;

  const logs = session?.logs || [];
  const chartData = {
    labels: logs.map((_, i) => i + 1),
    datasets: [
      {
        label: 'Attention %',
        data: logs.map((l) => l.attention),
        borderColor: '#5aa0f0',
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Session detail</h2>
          <div className="header-actions">
            {session && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!confirm('Permanently delete this session record?')) return;
                  try {
                    await apiFetch(`/api/analytics/session/${sessionId}`, { method: 'DELETE' });
                    onDeleted?.();
                    onClose();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Delete session
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {error && <p className="auth-error">{error}</p>}

        {session && (
          <>
            <div className="session-meta">
              <p>
                <strong>{session.name}</strong> · Roll {session.roll_number} · {session.class_code}
              </p>
              <p className="muted">
                Avg {session.avg_attention}% · {session.alerts_count} alerts · {session.log_count}{' '}
                samples
              </p>
            </div>
            <div className="history-chart-wrap">
              {logs.length === 0 ? (
                <p className="muted">No log samples in this session.</p>
              ) : (
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { min: 0, max: 100, ticks: { color: '#7a7c8e' } },
                      x: { ticks: { color: '#7a7c8e' } },
                    },
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
