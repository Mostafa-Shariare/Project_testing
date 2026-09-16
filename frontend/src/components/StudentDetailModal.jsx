import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../api';
import { attentionLevel, formatDuration, isBelowThreshold } from '../utils/liveMonitorUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

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

  const level = student ? attentionLevel(student, attentionThreshold) : 'focused';
  const below = student ? isBelowThreshold(student, attentionThreshold) : false;

  // Derive palette accents based on attention level
  const attScore = student?.attention ?? 0;
  let accentColor = '#4edea3'; // emerald
  let attClass = 'attention-high';
  if (attScore < (attentionThreshold ?? 50)) {
    accentColor = '#ffb4ab'; // rose
    attClass = 'attention-low';
  } else if (attScore < 70) {
    accentColor = '#ffb95f'; // amber
    attClass = 'attention-mid';
  }

  const chartData = useMemo(() => {
    return {
      labels: timeline.map((_, i) => i + 1),
      datasets: [
        {
          label: 'Attention %',
          data: timeline,
          borderColor: accentColor,
          backgroundColor: `${accentColor}1A`, // 10% opacity fill
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: accentColor,
        },
      ],
    };
  }, [timeline, accentColor]);

  if (!student) return null;

  const initials = (student.name || 'Student')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal glass student-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header with Student Avatar and Details */}
        <div className="modal-header">
          <div className="modal-header-student-info">
            <div
              className="modal-header-avatar"
              style={{
                borderColor: `${accentColor}55`,
                color: accentColor,
                boxShadow: `0 0 16px ${accentColor}22`,
              }}
            >
              {initials}
            </div>
            <div>
              <h2>{student.name}</h2>
              <p className="muted">
                Roll {student.roll_number} · Class {student.class_code}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={15} />
            <span>Close</span>
          </button>
        </div>

        {loading && <p className="muted" style={{ marginBottom: 16 }}>Loading analytics telemetry…</p>}

        {/* 6-Card High-Contrast Telemetry Metric Grid */}
        <div className="detail-metrics-grid">
          <div className={`detail-metric ${below ? 'metric-danger' : ''}`}>
            <span className="detail-metric-label">
              <Zap size={11} color={accentColor} /> Attention Score
            </span>
            <span className={`detail-metric-value ${attClass}`}>{attScore}%</span>
          </div>

          <div className="detail-metric">
            <span className="detail-metric-label">
              <Eye size={11} color="#86948a" /> Gaze Vector
            </span>
            <span className="detail-metric-value">{student.gaze || 'Center'}</span>
          </div>

          <div className="detail-metric">
            <span className="detail-metric-label">
              <Activity size={11} color="#86948a" /> Blink Frequency
            </span>
            <span className="detail-metric-value">
              {(student.blinks_per_min ?? 0).toFixed(1)}{' '}
              <small style={{ fontSize: '0.72rem', color: '#86948a', fontWeight: 500 }}>BPM</small>
            </span>
          </div>

          <div className="detail-metric">
            <span className="detail-metric-label">
              <Clock size={11} color="#86948a" /> Session Duration
            </span>
            <span className="detail-metric-value">
              {formatDuration(student.session_duration_sec)}
            </span>
          </div>

          <div className="detail-metric">
            <span className="detail-metric-label">
              <TrendingUp size={11} color="#86948a" /> Hist. Mean
            </span>
            <span className="detail-metric-value">
              {detail?.historical_avg_attention != null
                ? `${detail.historical_avg_attention}%`
                : '—'}
            </span>
          </div>

          <div className="detail-metric">
            <span className="detail-metric-label">
              <Brain size={11} color={accentColor} /> Attention State
            </span>
            <span className={`detail-metric-value level-${level}`}>
              {level.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Head Pose Section */}
        <div className="detail-section">
          <h3>
            <Compass size={13} color="#86948a" /> Head Pose Orientation
          </h3>
          <div className="detail-pose-chips">
            <span className="detail-pose-chip">
              Pitch: <strong>{(student.pose_pitch ?? 0).toFixed(1)}°</strong>
            </span>
            <span className="detail-pose-chip">
              Yaw: <strong>{(student.pose_yaw ?? 0).toFixed(1)}°</strong>
            </span>
            <span className="detail-pose-chip">
              Roll: <strong>{(student.pose_roll ?? 0).toFixed(1)}°</strong>
            </span>
          </div>
        </div>

        {/* Behavioral Signal Explanation */}
        <div className="detail-section">
          <h3>
            <Brain size={13} color="#86948a" /> Behavioral Signal Insights
          </h3>
          {student.contributing_factors && student.contributing_factors.length > 0 ? (
            <ul className="detail-factors-list">
              {student.contributing_factors.map((factor, idx) => (
                <li key={idx} className="detail-factor-item">
                  <span
                    className={`detail-factor-dot ${
                      factor.toLowerCase().includes('forward') ||
                      factor.toLowerCase().includes('centered') ||
                      factor.toLowerCase().includes('clear')
                        ? 'positive'
                        : ''
                    }`}
                  />
                  <span>
                    The vision system observed <strong>{factor.toLowerCase()}</strong>.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Standard behavioral baseline maintained.</p>
          )}
        </div>

        {/* Active Alerts */}
        <div className="detail-section">
          <h3>
            <AlertTriangle size={13} color="#86948a" /> Intervention Signals & Alerts
          </h3>
          {student.alert ? (
            <div className="detail-alert-box active">
              <AlertTriangle size={16} />
              <span>{student.alert}</span>
            </div>
          ) : (
            <div className="detail-alert-box nominal">
              <CheckCircle2 size={16} />
              <span>All clear — Student is currently maintaining nominal focus.</span>
            </div>
          )}
          {student.last_alert_time != null && (
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
              Last alert triggered at{' '}
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

        {/* Attention Timeline Chart */}
        <div className="detail-section">
          <h3>
            <Activity size={13} color="#86948a" /> Live Attention Waveform (Current Session)
          </h3>
          <div className="detail-chart-wrap">
            {timeline.length === 0 ? (
              <p className="muted" style={{ padding: '24px 0' }}>Collecting telemetry samples…</p>
            ) : (
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: '#1E222B',
                      titleColor: '#F1F3F5',
                      bodyColor: accentColor,
                      borderColor: '#2A2F3A',
                      borderWidth: 1,
                      padding: 10,
                      cornerRadius: 6,
                      titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
                      bodyFont: { family: "'JetBrains Mono', monospace", size: 12, weight: '700' },
                      displayColors: false,
                      callbacks: {
                        label: (ctx) => `Attention: ${ctx.parsed.y}%`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      min: 0,
                      max: 100,
                      grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                      },
                      ticks: {
                        color: '#86948a',
                        stepSize: 20,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                      },
                    },
                    x: {
                      display: timeline.length > 10,
                      grid: {
                        display: false,
                      },
                      ticks: {
                        color: '#86948a',
                        maxTicksLimit: 15,
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                      },
                    },
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

