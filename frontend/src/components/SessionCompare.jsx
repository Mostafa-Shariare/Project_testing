import { useState } from 'react';
import { apiFetch } from '../api';
import { formatDurationSec, formatTs } from '../utils/analyticsUtils';

export default function SessionCompare({ sessions, classCode }) {
  const [sessionA, setSessionA] = useState('');
  const [sessionB, setSessionB] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const runCompare = async () => {
    if (!sessionA || !sessionB) {
      setError('Select two sessions to compare.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(
        `/api/analytics/compare?session_a=${encodeURIComponent(sessionA)}&session_b=${encodeURIComponent(sessionB)}`,
      );
      setData(result);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const renderSide = (label, s) => (
    <div className="compare-side glass">
      <h3>{label}</h3>
      <p className="compare-student">
        <strong>{s.name}</strong> · {s.roll_number}
      </p>
      <ul className="compare-metrics">
        <li>
          <span>Avg attention</span>
          <strong>{s.avg_attention}%</strong>
        </li>
        <li>
          <span>Alerts</span>
          <strong>{s.alerts_count}</strong>
        </li>
        <li>
          <span>Duration</span>
          <strong>{formatDurationSec(s.duration_sec)}</strong>
        </li>
        <li>
          <span>Started</span>
          <strong className="mono-sm">{formatTs(s.start_time)}</strong>
        </li>
      </ul>
    </div>
  );

  return (
    <div className="session-compare panel glass">
      <div className="panel-header">
        <h2>Session Comparison — {classCode}</h2>
      </div>
      <div className="compare-selectors">
        <select value={sessionA} onChange={(e) => setSessionA(e.target.value)}>
          <option value="">Session A…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.roll_number} · {s.avg_attention}% · {formatTs(s.start_time)}
            </option>
          ))}
        </select>
        <select value={sessionB} onChange={(e) => setSessionB(e.target.value)}>
          <option value="">Session B…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.roll_number} · {s.avg_attention}% · {formatTs(s.start_time)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={runCompare} disabled={loading}>
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
      {data && (
        <div className="compare-results">
          <div className="compare-grid">
            {renderSide('Session A', data.session_a)}
            <div className="compare-delta glass">
              <h3>Delta (A − B)</h3>
              <p className={data.delta.avg_attention >= 0 ? 'text-success' : 'text-danger'}>
                Attention: {data.delta.avg_attention >= 0 ? '+' : ''}
                {data.delta.avg_attention}%
              </p>
              <p>Alerts: {data.delta.alerts_count >= 0 ? '+' : ''}{data.delta.alerts_count}</p>
              <p>Duration: {formatDurationSec(Math.abs(data.delta.duration_sec))}</p>
            </div>
            {renderSide('Session B', data.session_b)}
          </div>
        </div>
      )}
    </div>
  );
}
