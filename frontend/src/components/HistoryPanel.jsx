import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CalendarRange,
  Download,
  FileSpreadsheet,
  History,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { apiFetch, getToken, exportHistoryUrl } from '../api';
import { buildQuery, dateRangeToUnix, defaultDateRange, formatDurationSec, formatTs } from '../utils/analyticsUtils';
import SessionDetail from './SessionDetail';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

const SECTION_META = {
  sessions: { label: 'Sessions', icon: History },
  trends: { label: 'Trends', icon: TrendingUp },
  export: { label: 'Export', icon: Download },
};

export default function HistoryPanel({ classCode }) {
  const [history, setHistory] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [range, setRange] = useState(defaultDateRange);
  const [section, setSection] = useState('sessions');

  useEffect(() => {
    if (!classCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const q = buildQuery({
        class_code: classCode,
        ...dateRangeToUnix(range.from, range.to),
      });
      try {
        const [hist, ov] = await Promise.all([
          apiFetch(`/api/analytics/history?${q}`),
          apiFetch(`/api/analytics/overview?${q}`),
        ]);
        if (!cancelled) {
          setHistory(hist);
          setOverview(ov);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classCode, range]);

  const handleExport = () => {
    const token = getToken();
    const q = buildQuery({
      class_code: classCode,
      ...dateRangeToUnix(range.from, range.to),
    });
    fetch(exportHistoryUrl(classCode).split('?')[0] + `?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `attention_${classCode}.csv`;
        a.click();
      })
      .catch(() => setError('Export failed'));
  };

  const monthlyChart = useMemo(() => {
    const trend = overview?.monthly_trend || [];
    return {
      labels: trend.map((t) => t.period),
      datasets: [
        {
          label: 'Avg Attention %',
          data: trend.map((t) => t.avg_attention),
          borderColor: '#5aa0f0',
          backgroundColor: 'rgba(90, 160, 240, 0.2)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#5aa0f0',
          borderWidth: 2.5,
        },
      ],
    };
  }, [overview]);

  const classTrendChart = useMemo(() => {
    const trend = overview?.class_performance_trend || [];
    return {
      labels: trend.map((t) => t.date),
      datasets: [
        {
          label: 'Daily class avg %',
          data: trend.map((t) => t.avg_attention),
          backgroundColor: trend.map((t) =>
            t.avg_attention >= 70 ? 'rgba(22, 163, 74, 0.6)' :
            t.avg_attention >= 40 ? 'rgba(234, 88, 12, 0.6)' :
            'rgba(220, 38, 38, 0.6)'
          ),
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    };
  }, [overview]);

  const ranked = overview?.ranked_sessions || history;

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Loading session history...</p>
      </div>
    );
  }

  if (error) {
    return <div className="history-error">Failed to load history: {error}</div>;
  }

  return (
    <div className="history-view animate-in">
      <div className="page-header-section">
        <div className="page-header-text">
          <h1 className="page-heading">History & Analytics</h1>
          <p className="page-heading-sub">Review past sessions, track attention trends, and export data.</p>
        </div>
      </div>

      <div className="analytics-subnav-enhanced">
        {Object.entries(SECTION_META).map(([id, { label, icon: Icon }]) => (
          <button
            key={id}
            type="button"
            className={`subnav-pill ${section === id ? 'active' : ''}`}
            onClick={() => setSection(id)}
          >
            <Icon size={15} strokeWidth={2.2} />
            {label}
          </button>
        ))}
      </div>

      <div className="panel glass analytics-filters-panel">
        <div className="analytics-filters">
          <CalendarRange size={16} className="filter-icon" />
          <label className="filter-date-label">
            From
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </label>
          <span className="filter-separator">to</span>
          <label className="filter-date-label">
            To
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </label>
        </div>
      </div>

      {overview && section !== 'export' && (
        <div className="kpi-grid history-kpi-row">
          <div className="kpi-card kpi-accent-blue">
            <div className="kpi-icon-wrap blue">
              <BarChart3 size={20} />
            </div>
            <div className="kpi-data">
              <h3>{overview.avg_attention}%</h3>
              <p>Class Avg Attention</p>
            </div>
          </div>
          <div className="kpi-card kpi-accent-green">
            <div className="kpi-icon-wrap green">
              <Calendar size={20} />
            </div>
            <div className="kpi-data">
              <h3>{overview.session_count}</h3>
              <p>Total Sessions</p>
            </div>
          </div>
          <div className="kpi-card kpi-accent-orange">
            <div className="kpi-icon-wrap orange">
              <AlertTriangle size={20} />
            </div>
            <div className="kpi-data">
              <h3>{overview.total_alerts}</h3>
              <p>Total Alerts</p>
            </div>
          </div>
        </div>
      )}

      {section === 'trends' && (
        <div className="trends-grid">
          <div className="panel glass history-chart-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <TrendingUp size={16} className="panel-title-icon" />
                <h2>Monthly Attention Trend</h2>
              </div>
              <span className="panel-badge">Avg %</span>
            </div>
            <div className="history-chart-wrap chart-wrap-lg">
              {(overview?.monthly_trend?.length ?? 0) === 0 ? (
                <div className="empty-chart-state">
                  <BarChart3 size={32} />
                  <p>No monthly data in range.</p>
                </div>
              ) : (
                <Line
                  data={monthlyChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      tooltip: {
                        mode: 'index',
                        backgroundColor: '#0f172a',
                        titleFont: { weight: '600' },
                        padding: 12,
                        cornerRadius: 8,
                      },
                      legend: { display: false },
                    },
                    scales: {
                      y: { min: 0, max: 100, grid: { color: '#f1f5f9' } },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              )}
            </div>
          </div>
          <div className="panel glass history-chart-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <BarChart3 size={16} className="panel-title-icon" />
                <h2>Class Performance Over Time</h2>
              </div>
              <span className="panel-badge">Daily</span>
            </div>
            <div className="history-chart-wrap chart-wrap-lg">
              {(overview?.class_performance_trend?.length ?? 0) === 0 ? (
                <div className="empty-chart-state">
                  <BarChart3 size={32} />
                  <p>No daily trend data.</p>
                </div>
              ) : (
                <Bar
                  data={classTrendChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { weight: '600' },
                        padding: 12,
                        cornerRadius: 8,
                      },
                    },
                    scales: {
                      y: { min: 0, max: 100, grid: { color: '#f1f5f9' } },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'export' && (
        <div className="panel glass export-panel-enhanced">
          <div className="panel-header">
            <div className="panel-title-group">
              <Download size={16} className="panel-title-icon" />
              <h2>Export Data</h2>
            </div>
          </div>
          <div className="export-content">
            <div className="export-icon-wrap">
              <FileSpreadsheet size={40} strokeWidth={1.5} />
            </div>
            <div className="export-text">
              <h3>Download Session Report</h3>
              <p>Export all session data matching your current date range as a CSV file.</p>
            </div>
            <button type="button" className="btn btn-primary export-download-btn" onClick={handleExport}>
              <Download size={16} />
              Download CSV Report
            </button>
          </div>
        </div>
      )}

      {section === 'sessions' && (
        <div className="panel glass history-table-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <History size={16} className="panel-title-icon" />
              <h2>Sessions</h2>
            </div>
            <span className="panel-badge">{history.length} total</span>
          </div>
          <div className="table-scroll">
            <table className="history-table enhanced-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Roll</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Avg Attention</th>
                  <th>Alerts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ranked.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty-state">
                      <div className="empty-table-msg">
                        <History size={28} />
                        <p>No sessions found in this date range.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  ranked.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`clickable-row ${row.rank <= 3 ? 'row-best' : row.rank_total && row.rank >= row.rank_total - 2 ? 'row-worst' : ''}`}
                      onClick={() => setSelectedSession(row.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <td className="mono">
                        <span className={`rank-badge ${row.rank <= 3 ? 'rank-top' : ''}`}>
                          #{row.rank ?? '—'}
                        </span>
                      </td>
                      <td className="student-name-cell">{row.name}</td>
                      <td className="mono">{row.roll_number}</td>
                      <td className="mono-sm">{formatTs(row.start_time)}</td>
                      <td>{formatDurationSec(row.duration_sec)}</td>
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
                      <td>
                        <span className={row.alerts_count > 0 ? 'alert-count-cell' : ''}>
                          {row.alerts_count}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${row.status === 'active' ? 'pill-active' : 'pill-off'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
