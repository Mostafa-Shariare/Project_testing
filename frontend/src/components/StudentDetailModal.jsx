import { useEffect, useMemo, useState } from 'react';
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
import { attentionLevel, formatDuration, isBelowThreshold } from '../utils/liveMonitorUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function StudentDetailModal({
  student,
  classCode,
  attentionThreshold,
  sessionTimeline,
  onClose,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!student || !classCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(
          `/api/live/student/detail?class_code=${encodeURIComponent(classCode)}&roll_number=${encodeURIComponent(student.roll_number)}`,
        );
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student, classCode]);

  const timeline = useMemo(() => {
    if (sessionTimeline?.length) return sessionTimeline;
    const logs = detail?.current_session_logs || [];
    return logs.map((l) => l.attention);
  }, [sessionTimeline, detail]);

  const chartData = {
    labels: timeline.map((_, i) => i + 1),
    datasets: [
      {
        label: 'Attention %',
        data: timeline,
        borderColor: '#5aa0f0',
        tension: 0.25,
        pointRadius: 0,
      },
    ],
  };

  if (!student) return null;

  const level = attentionLevel(student, attentionThreshold);
  const below = isBelowThreshold(student, attentionThreshold);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal glass student-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{student.name}</h2>
            <p className="muted">
              Roll {student.roll_number} · {student.class_code}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p className="muted">Loading analytics…</p>}

        <div className="detail-metrics-grid">
          <div className={`detail-metric ${below ? 'metric-danger' : ''}`}>
            <span className="detail-metric-label">Attention</span>
            <span className="detail-metric-value">{student.attention ?? 0}%</span>
          </div>
          <div className="detail-metric">
            <span className="detail-metric-label">Gaze</span>
            <span className="detail-metric-value">{student.gaze || '—'}</span>
          </div>
          <div className="detail-metric">
            <span className="detail-metric-label">Blink rate</span>
            <span className="detail-metric-value">
              {(student.blinks_per_min ?? 0).toFixed(1)}/min
            </span>
          </div>
          <div className="detail-metric">
            <span className="detail-metric-label">Session duration</span>
            <span className="detail-metric-value">
              {formatDuration(student.session_duration_sec)}
            </span>
          </div>
          <div className="detail-metric">
            <span className="detail-metric-label">Hist. average</span>
            <span className="detail-metric-value">
              {detail?.historical_avg_attention != null
                ? `${detail.historical_avg_attention}%`
                : '—'}
            </span>
          </div>
          <div className="detail-metric">
            <span className="detail-metric-label">Status</span>
            <span className={`detail-metric-value level-${level}`}>{level}</span>
          </div>
        </div>

        <div className="detail-section">
          <h3>Head pose</h3>
          <p>
            Pitch: <strong>{(student.pose_pitch ?? 0).toFixed(1)}°</strong> · Yaw:{' '}
            <strong>{(student.pose_yaw ?? 0).toFixed(1)}°</strong> · Roll:{' '}
            <strong>{(student.pose_roll ?? 0).toFixed(1)}°</strong>
          </p>
        </div>

        <div className="detail-section">
          <h3>Alerts</h3>
          {student.alert ? (
            <p className="detail-alert-active">⚠ {student.alert}</p>
          ) : (
            <p className="muted">No active alerts</p>
          )}
          {student.last_alert_time != null && (
            <p className="muted">
              Last alert at{' '}
              {new Date(student.last_alert_time * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
              {student.seconds_since_last_alert != null &&
                ` (${formatDuration(student.seconds_since_last_alert)} ago)`}
            </p>
          )}
        </div>

        <div className="detail-section">
          <h3>Attention timeline (current session)</h3>
          <div className="detail-chart-wrap">
            {timeline.length === 0 ? (
              <p className="muted">Collecting samples…</p>
            ) : (
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { min: 0, max: 100 },
                    x: { display: timeline.length > 20 },
                  },
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
