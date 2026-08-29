import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { apiFetch } from '../api';
import { formatDurationSec, formatTs } from '../utils/analyticsUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, zoomPlugin);

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

  const chartData = useMemo(() => {
    const logs = session?.logs || [];
    return {
      labels: logs.map((l) =>
        new Date((l.timestamp || 0) * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      ),
      datasets: [
        {
          label: 'Attention %',
          data: logs.map((l) => l.attention),
          borderColor: '#5aa0f0',
          backgroundColor: 'rgba(90, 160, 240, 0.15)',
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: true,
        },
      ],
    };
  }, [session]);

  if (!sessionId) return null;

  const logs = session?.logs || [];

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal glass session-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Session Analytics</h2>
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
                Delete
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading && (
          <div className="page-loading">
            <div className="spinner" />
            <p>Loading session details…</p>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}

        {session && (
          <>
            <div className="session-meta">
              <p>
                <strong>{session.name}</strong> · Roll {session.roll_number} · {session.class_code}
              </p>
              <p className="muted">
                Avg {session.avg_attention}% · {session.alerts_count} alerts ·{' '}
                {formatDurationSec(session.duration_sec)}
              </p>
              <p className="muted mono-sm">
                Join {formatTs(session.join_time || session.start_time)} · Leave{' '}
                {formatTs(session.leave_time || session.end_time)}
              </p>
            </div>

            <p className="chart-hint muted">Scroll to zoom · Drag to pan · Hover for values</p>
            <div className="history-chart-wrap session-timeline-chart">
              {logs.length === 0 ? (
                <p className="muted">No log samples in this session.</p>
              ) : (
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => `Attention: ${ctx.parsed.y}%`,
                        },
                      },
                      zoom: {
                        pan: { enabled: true, mode: 'x' },
                        zoom: {
                          wheel: { enabled: true },
                          pinch: { enabled: true },
                          mode: 'x',
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { color: '#7a7c8e', maxTicksLimit: 10 },
                      },
                      y: {
                        min: 0,
                        max: 100,
                        ticks: { color: '#7a7c8e' },
                      },
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
