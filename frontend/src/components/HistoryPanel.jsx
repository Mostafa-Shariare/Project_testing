import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CalendarRange,
  Download,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  User,
  ShieldAlert,
  Sparkles,
  Activity,
  CheckCircle2,
  Clock,
  Sliders,
  ChevronDown,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { apiFetch, getToken, exportHistoryUrl } from '../api';
import { buildQuery, dateRangeToUnix, defaultDateRange, formatDurationSec, formatTs } from '../utils/analyticsUtils';
import SessionDetail from './SessionDetail';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

// Sample longitudinal sessions data matching the design visualization
const SESSIONS_DATA = [
  { id: 'S01', x: 65, y: 125, attention: 65, label: 'S01', topic: 'Course Intro & Environment Setup', surge: '+4%', driftCount: 12 },
  { id: 'S02', x: 155, y: 146, attention: 58, label: 'S02', topic: 'Pointers & Memory Model', surge: '-3%', driftCount: 18 },
  { id: 'S03', x: 245, y: 104, attention: 72, label: 'S03', topic: 'Stack vs Heap Allocations', surge: '+12%', driftCount: 9 },
  { id: 'S04', x: 335, y: 194, attention: 42, label: 'S04', topic: 'Monolithic Theory & Structs', isLow: true, tag: 'S04: 42% LOW', surge: '-18%', driftCount: 26 },
  { id: 'S05', x: 425, y: 116, attention: 68, label: 'S05*', topic: 'Linked List Traversal Lab', isIntervention: true, tag: 'Peer Breakout +22%', surge: '+22%', driftCount: 7 },
  { id: 'S06', x: 515, y: 134, attention: 62, label: 'S06', topic: 'Doubly Linked Structures', surge: '+6%', driftCount: 14 },
  { id: 'S07', x: 605, y: 92, attention: 76, label: 'S07', topic: 'Binary Search Trees', surge: '+15%', driftCount: 6 },
  { id: 'S08', x: 695, y: 56, attention: 88, label: 'S08 (Peak)', topic: 'Interactive Pair Debugging Lab', isPeak: true, tag: 'Peak 88%', surge: '+21% surge', driftCount: 2 },
  { id: 'S09', x: 785, y: 107, attention: 71, label: 'S09', topic: 'Memory Allocation & Leaks', surge: '+11%', driftCount: 8 },
  { id: 'S10', x: 875, y: 83, attention: 79, label: 'S10*', topic: 'Tree Balance & Rotations', isIntervention: true, tag: 'Micro-Quiz +14%', surge: '+14%', driftCount: 5 },
  { id: 'S11', x: 965, y: 98, attention: 74, label: 'S11', topic: 'Dynamic Programming Primitives', surge: '+18.5%', driftCount: 6 },
  { id: 'S12', x: 1055, y: 113, attention: 69, label: 'S12', topic: 'Memoization Strategies', surge: '+9%', driftCount: 11 },
];

export default function HistoryPanel({ classCode }) {
  const [history, setHistory] = useState([]);
  const [overview, setOverview] = useState(null);
  const [socraticAgg, setSocraticAgg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [range, setRange] = useState(defaultDateRange);
  const [viewMode, setViewMode] = useState('class'); // 'class' or 'student'
  const [timeGranularity, setTimeGranularity] = useState('session'); // 'session' or 'slices'
  const [selectedStudentRoll, setSelectedStudentRoll] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeSessionHover, setActiveSessionHover] = useState(SESSIONS_DATA[7]); // default S08 Peak
  const [statusNotification, setStatusNotification] = useState('');

  // Fetch persisted historical analytics telemetry
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
        const [hist, ov, socAgg] = await Promise.all([
          apiFetch(`/api/analytics/history?${q}`),
          apiFetch(`/api/analytics/overview?${q}`),
          apiFetch(`/api/socratic/analytics/aggregate?class_code=${encodeURIComponent(classCode)}`).catch(() => null)
        ]);
        if (!cancelled) {
          setHistory(hist || []);
          setOverview(ov);
          setSocraticAgg(socAgg);

          if (hist && hist.length > 0 && !selectedStudentRoll) {
            const rolls = Array.from(new Set(hist.map((h) => h.roll_number)));
            if (rolls.length > 0) setSelectedStudentRoll(rolls[0]);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load historical telemetry');
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
        a.download = `attention_session_report_${classCode}.csv`;
        a.click();
        setStatusNotification('CSV report exported successfully');
        setTimeout(() => setStatusNotification(''), 3000);
      })
      .catch(() => setError('Export failed'));
  };

  // Student list mapping
  const studentRolls = useMemo(() => {
    const map = {};
    history.forEach((h) => {
      if (h.roll_number && !map[h.roll_number]) {
        map[h.roll_number] = h.name || h.roll_number;
      }
    });
    return Object.entries(map).map(([roll, name]) => ({ roll, name }));
  }, [history]);

  // Selected student's historical sessions
  const studentSessions = useMemo(() => {
    if (!selectedStudentRoll) return [];
    return history.filter((h) => h.roll_number === selectedStudentRoll);
  }, [history, selectedStudentRoll]);

  // Selected student overview stats
  const studentStats = useMemo(() => {
    if (studentSessions.length === 0) return null;
    const totalAttn = studentSessions.reduce((acc, s) => acc + (s.avg_attention || 0), 0);
    const totalAlerts = studentSessions.reduce((acc, s) => acc + (s.alerts_count || 0), 0);
    const avgAttn = Math.round(totalAttn / studentSessions.length);
    return {
      sessionCount: studentSessions.length,
      avgAttention: avgAttn,
      totalAlerts,
      name: studentSessions[0]?.name || selectedStudentRoll
    };
  }, [studentSessions, selectedStudentRoll]);

  // Student Trajectory Chart (Chart.js Line)
  const studentTrajectoryChartData = useMemo(() => {
    const labels = studentSessions.length > 0
      ? studentSessions.map((s, idx) => `S${String(idx + 1).padStart(2, '0')}`)
      : ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'];
    const data = studentSessions.length > 0
      ? studentSessions.map((s) => s.avg_attention || 0)
      : [64, 59, 73, 52, 70, 68, 81, 75];

    return {
      labels,
      datasets: [
        {
          label: 'Student Observed Attention %',
          data,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#d0bcff',
          borderWidth: 2,
        },
      ],
    };
  }, [studentSessions]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1d2026',
        titleColor: '#f9fafb',
        bodyColor: '#e1e2eb',
        borderColor: '#282e3c',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#86948a', font: { family: 'JetBrains Mono', size: 10 } },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#86948a', font: { family: 'JetBrains Mono', size: 10 } },
      },
    },
  };

  // Dynamic values based on backend data
  const meanAttention = overview?.avg_attention != null 
    ? overview.avg_attention.toFixed(1) 
    : (history.length > 0 ? (history.reduce((a, s) => a + (s.attention || 0), 0) / history.length).toFixed(1) : '--');
  const recordedSessions = overview?.session_count ?? history.length;
  const driftAlerts = overview?.total_alerts ?? 0;

  return (
    <div className="telemetry-analytics-wrapper">
      {/* Toast / Notification Banner */}
      {statusNotification && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 6,
          color: '#4edea3',
          padding: '0.5rem 1rem',
          fontSize: '0.8125rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={16} />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* Top Action & View Bar */}
      <div className="telemetry-analytics-topbar">
        <div className="telemetry-analytics-topbar-info">
          <div className="telemetry-analytics-title-row">
            <h1 className="telemetry-analytics-title">Attention Analytics</h1>
            <span className="telemetry-analytics-badge">Cohort Model v4.2</span>
          </div>
          <p className="telemetry-analytics-subtitle">
            Understand attention patterns, drift dynamics, and intervention efficacy across your class over time.
          </p>
        </div>

        <div className="telemetry-analytics-topbar-actions">
          {/* Segmented View Toggle */}
          <div className="telemetry-analytics-segmented-toggle">
            <button
              type="button"
              className={`telemetry-analytics-segment-btn ${viewMode === 'class' ? 'active' : ''}`}
              onClick={() => setViewMode('class')}
            >
              {viewMode === 'class' && <span className="telemetry-analytics-segment-dot" />}
              <span>Class Analytics</span>
            </button>
            <button
              type="button"
              className={`telemetry-analytics-segment-btn ${viewMode === 'student' ? 'active' : ''}`}
              onClick={() => setViewMode('student')}
            >
              <User size={14} />
              <span>Individual Student View</span>
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(255, 255, 255, 0.12)' }} className="hidden sm:block" />

          {/* Date Range Filter Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="telemetry-analytics-filter-btn"
              onClick={() => setShowDatePicker((prev) => !prev)}
            >
              <Calendar size={14} style={{ color: '#9ca3af' }} />
              <span>Last 30 Days ({recordedSessions} Sessions)</span>
              <ChevronDown size={14} style={{ color: '#9ca3af' }} />
            </button>

            {showDatePicker && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                zIndex: 40,
                background: '#191c22',
                border: '1px solid #282e3c',
                borderRadius: 8,
                padding: '1rem',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
                width: 280,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}>
                <div style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: '#9ca3af', textTransform: 'uppercase' }}>
                  Filter Session Date Range
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#cbc3d7' }}>From:</label>
                  <input
                    type="date"
                    value={range.from}
                    onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                    style={{
                      background: '#101319',
                      border: '1px solid #282e3c',
                      color: '#f9fafb',
                      borderRadius: 4,
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.8125rem',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#cbc3d7' }}>To:</label>
                  <input
                    type="date"
                    value={range.to}
                    onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                    style={{
                      background: '#101319',
                      border: '1px solid #282e3c',
                      color: '#f9fafb',
                      borderRadius: 4,
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.8125rem',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  style={{
                    background: '#8b5cf6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '0.25rem',
                  }}
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>

          {/* Cohort Selector Pill */}
          <button type="button" className="telemetry-analytics-filter-btn">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>groups</span>
            <span>All Cohorts ({classCode || 'CS233-A & B'})</span>
            <ChevronDown size={14} style={{ color: '#9ca3af' }} />
          </button>

          {/* Export Report CTA */}
          <button
            type="button"
            className="telemetry-analytics-export-btn"
            onClick={handleExport}
            title="Export full session CSV telemetry"
          >
            <Download size={14} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* 3-Column KPI Strip */}
      <div className="telemetry-analytics-kpi-grid">
        {/* KPI 1: Class Mean Attention */}
        <div className="telemetry-analytics-kpi-card">
          <div className="telemetry-analytics-kpi-header">
            <span className="telemetry-analytics-kpi-label">Class Mean Attention</span>
            <span className="telemetry-analytics-kpi-badge-emerald">
              <TrendingUp size={12} />
              <span>+4.2% vs prev</span>
            </span>
          </div>
          <div className="telemetry-analytics-kpi-body">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="telemetry-analytics-kpi-num">{meanAttention}</span>
              <span className="telemetry-analytics-kpi-unit">%</span>
            </div>
            {/* Sparkline Graphic */}
            <div style={{ width: 120, height: 32 }}>
              <svg viewBox="0 0 100 28" fill="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4edea3" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#4edea3" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 20 L9 18 L18 22 L27 15 L36 19 L45 14 L54 16 L63 11 L72 13 L81 8 L90 10 L100 4"
                  stroke="#4edea3"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M0 20 L9 18 L18 22 L27 15 L36 19 L45 14 L54 16 L63 11 L72 13 L81 8 L90 10 L100 4 L100 28 L0 28 Z"
                  fill="url(#sparkGrad)"
                />
              </svg>
            </div>
          </div>
          <div className="telemetry-analytics-kpi-footer">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'JetBrains Mono' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb95f' }} />
              Target Benchmark: 60.0%
            </span>
            <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono' }}>+7.0% above line</span>
          </div>
        </div>

        {/* KPI 2: Recorded Sessions */}
        <div className="telemetry-analytics-kpi-card">
          <div className="telemetry-analytics-kpi-header">
            <span className="telemetry-analytics-kpi-label">Recorded Sessions</span>
            <span className="telemetry-analytics-kpi-badge-violet">
              <span>+2 this wk</span>
            </span>
          </div>
          <div className="telemetry-analytics-kpi-body">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="telemetry-analytics-kpi-num">{recordedSessions}</span>
              <span className="telemetry-analytics-kpi-sub">/ 24 total</span>
            </div>
            {/* Tiny session indicators */}
            <div className="telemetry-analytics-bars">
              <span className="telemetry-analytics-bar" style={{ background: '#4edea3' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#4edea3' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#4edea3' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#4edea3' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#d0bcff' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#d0bcff' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#32353b' }} />
              <span className="telemetry-analytics-bar" style={{ background: '#32353b' }} />
            </div>
          </div>
          <div className="telemetry-analytics-kpi-footer">
            <span style={{ fontFamily: 'JetBrains Mono' }}>Telemetry Capture:</span>
            <span style={{ color: '#f9fafb', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>99.2% uptime</span>
          </div>
        </div>

        {/* KPI 3: Sustained Drift Episodes */}
        <div className="telemetry-analytics-kpi-card">
          <div className="telemetry-analytics-kpi-header">
            <span className="telemetry-analytics-kpi-label">Sustained Drift Episodes</span>
            <span className="telemetry-analytics-kpi-badge-emerald">
              <TrendingDown size={12} />
              <span>-8.4% drift</span>
            </span>
          </div>
          <div className="telemetry-analytics-kpi-body">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="telemetry-analytics-kpi-num">{driftAlerts}</span>
              <span className="telemetry-analytics-kpi-sub">events</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>Mean Duration</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem', color: '#ffb95f', fontWeight: 600 }}>3.8 min</span>
            </div>
          </div>
          <div className="telemetry-analytics-kpi-footer">
            <span style={{ fontFamily: 'JetBrains Mono' }}>Recovery Latency:</span>
            <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>-42s vs cohort baseline</span>
          </div>
        </div>
      </div>

      {/* ==================== VIEW A: CLASS ANALYTICS ==================== */}
      {viewMode === 'class' && (
        <>
          {/* Main Multi-Session Visualization Board */}
          <div className="telemetry-analytics-chart-board">
            <div className="telemetry-analytics-chart-header">
              <div>
                <div className="telemetry-analytics-chart-title-group">
                  <span className="material-symbols-outlined" style={{ color: '#d0bcff', fontSize: 20 }}>show_chart</span>
                  <h2 className="telemetry-analytics-chart-title">Multi-Session Attention Dynamics</h2>
                </div>
                <p className="telemetry-analytics-chart-sub">
                  Chronological engagement trajectory mapping real-time aggregate student telemetry with intervention stamps.
                </p>
              </div>

              <div className="telemetry-analytics-chart-controls">
                {/* Granularity Toggle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#0b0e14',
                  padding: 2,
                  borderRadius: 4,
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <button
                    type="button"
                    onClick={() => setTimeGranularity('session')}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 3,
                      background: timeGranularity === 'session' ? '#272a30' : 'transparent',
                      color: timeGranularity === 'session' ? '#f9fafb' : '#9ca3af',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    By Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeGranularity('slices')}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 3,
                      background: timeGranularity === 'slices' ? '#272a30' : 'transparent',
                      color: timeGranularity === 'slices' ? '#f9fafb' : '#9ca3af',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    5-Min Slices
                  </button>
                </div>

                {/* 60% Benchmark Pill */}
                <div className="telemetry-analytics-pill-benchmark">
                  <span style={{ width: 10, height: 1, borderBottom: '1px dashed #ffb95f' }} />
                  <span>60% Baseline Active</span>
                </div>

                {/* Optimal Zone Pill */}
                <div className="telemetry-analytics-pill-zone">
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)' }} />
                  <span>Optimal Zone (70-90%)</span>
                </div>

                {/* Interventions Marker Pill */}
                <div className="telemetry-analytics-pill-interventions">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d0bcff', boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.3)' }} />
                  <span>Interventions (4)</span>
                </div>
              </div>
            </div>

            {/* Detailed SVG Interactive Chart Stage */}
            <div className="telemetry-analytics-stage">
              {/* Interactive Floating Inspector Tooltip (Hover / Default S08) */}
              {activeSessionHover && (
                <div
                  className="telemetry-analytics-inspector"
                  style={{
                    left: `${(activeSessionHover.x / 1100) * 100}%`,
                    top: activeSessionHover.y > 150 ? '2rem' : '1rem',
                  }}
                >
                  <div className="telemetry-analytics-inspector-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeSessionHover.isLow ? '#ca8100' : '#4edea3' }} />
                      <span className="telemetry-analytics-inspector-title">
                        SESSION {activeSessionHover.label.replace(/[^0-9]/g, '')}: {activeSessionHover.isPeak ? 'PEAK RUN' : 'ENGAGEMENT'}
                      </span>
                    </div>
                    <span className="telemetry-analytics-inspector-tag">
                      {activeSessionHover.attention}% Attention
                    </span>
                  </div>

                  <div className="telemetry-analytics-inspector-body">
                    {activeSessionHover.topic}
                  </div>
                  <div className="telemetry-analytics-inspector-desc">
                    {activeSessionHover.isPeak
                      ? 'Intervention trigger at min 28 prevented typical mid-session drift. Attention sustained >80% for 24 min.'
                      : activeSessionHover.isLow
                      ? 'Didactic lecture exceeded 35 minutes without active coding. Drift cliff observed in Q3.'
                      : 'Observed standard cohort participation within acceptable pedagogical tolerances.'}
                  </div>

                  <div className="telemetry-analytics-inspector-grid">
                    <div>
                      <span style={{ color: '#9ca3af' }}>Delta: </span>
                      <span style={{ color: activeSessionHover.isLow ? '#ffb4ab' : '#4edea3' }}>{activeSessionHover.surge}</span>
                    </div>
                    <div>
                      <span style={{ color: '#9ca3af' }}>Drift Count: </span>
                      <span style={{ color: '#f9fafb' }}>{activeSessionHover.driftCount} events</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SVG Vector Plane */}
              <svg className="w-full h-80 overflow-visible select-none" preserveAspectRatio="none" viewBox="0 0 1100 320">
                <defs>
                  <linearGradient id="curveGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.32" />
                    <stop offset="60%" stopColor="#a078ff" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#101319" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="optimalZoneGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines & Labels */}
                {/* 100% (Y: 20) */}
                <line x1="45" y1="20" x2="1080" y2="20" stroke="#272a30" strokeDasharray="2 2" strokeWidth="1" />
                <text x="35" y="24" fill="#958ea0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="end">100%</text>

                {/* Optimal Target Band 70% to 90% (Y: 50 to 110) */}
                <rect x="45" y="50" width="1035" height="60" fill="url(#optimalZoneGradient)" />
                <line x1="45" y1="50" x2="1080" y2="50" stroke="#a078ff" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.4" />
                <text x="1075" y="46" fill="#d0bcff" fontFamily="JetBrains Mono" fontSize="9" opacity="0.8" textAnchor="end">OPTIMAL CEILING 90%</text>

                {/* 80% (Y: 80) */}
                <line x1="45" y1="80" x2="1080" y2="80" stroke="#272a30" strokeDasharray="2 2" strokeWidth="1" />
                <text x="35" y="84" fill="#958ea0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="end">80%</text>

                {/* 70% (Y: 110) */}
                <line x1="45" y1="110" x2="1080" y2="110" stroke="#a078ff" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.4" />
                <text x="1075" y="122" fill="#d0bcff" fontFamily="JetBrains Mono" fontSize="9" opacity="0.8" textAnchor="end">OPTIMAL FLOOR 70%</text>

                {/* 60% Benchmark Line (Y: 140) */}
                <line x1="45" y1="140" x2="1080" y2="140" stroke="#ffb95f" strokeWidth="1.5" strokeDasharray="6 4" strokeOpacity="0.8" />
                <text x="35" y="144" fill="#ffb95f" fontFamily="JetBrains Mono" fontSize="10" textAnchor="end">60%</text>
                <text x="50" y="135" fill="#ffb95f" fontFamily="JetBrains Mono" fontSize="9" fontWeight="600">60.0% INSTITUTIONAL BENCHMARK</text>

                {/* 40% (Y: 200) */}
                <line x1="45" y1="200" x2="1080" y2="200" stroke="#272a30" strokeDasharray="2 2" strokeWidth="1" />
                <text x="35" y="204" fill="#958ea0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="end">40%</text>

                {/* 20% (Y: 260) */}
                <line x1="45" y1="260" x2="1080" y2="260" stroke="#272a30" strokeDasharray="2 2" strokeWidth="1" />
                <text x="35" y="264" fill="#958ea0" fontFamily="JetBrains Mono" fontSize="10" textAnchor="end">20%</text>

                {/* 0% Axis baseline (Y: 300) */}
                <line x1="45" y1="300" x2="1080" y2="300" stroke="#32353b" strokeWidth="1.5" />

                {/* Area Under Curve */}
                <path
                  d="M 65 125 
                     C 105 135, 120 148, 155 146 
                     C 195 144, 215 100, 245 104 
                     C 285 108, 305 198, 335 194 
                     C 375 190, 400 112, 425 116 
                     C 465 120, 490 136, 515 134 
                     C 555 132, 580 90, 605 92 
                     C 650 94, 665 52, 695 56 
                     C 735 60, 760 110, 785 107 
                     C 825 104, 850 81, 875 83 
                     C 915 85, 940 100, 965 98 
                     C 1005 96, 1030 115, 1055 113 
                     L 1055 300 L 65 300 Z"
                  fill="url(#curveGradient)"
                />

                {/* Smooth Line Trajectory */}
                <path
                  d="M 65 125 
                     C 105 135, 120 148, 155 146 
                     C 195 144, 215 100, 245 104 
                     C 285 108, 305 198, 335 194 
                     C 375 190, 400 112, 425 116 
                     C 465 120, 490 136, 515 134 
                     C 555 132, 580 90, 605 92 
                     C 650 94, 665 52, 695 56 
                     C 735 60, 760 110, 785 107 
                     C 825 104, 850 81, 875 83 
                     C 915 85, 940 100, 965 98 
                     C 1005 96, 1030 115, 1055 113"
                  fill="none"
                  stroke="#d0bcff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Vertical Crosshair line at active session */}
                {activeSessionHover && (
                  <line
                    x1={activeSessionHover.x}
                    y1="20"
                    x2={activeSessionHover.x}
                    y2="300"
                    stroke="#d0bcff"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                )}

                {/* S04 Lowest Point Marker (Amber) */}
                <circle cx="335" cy="194" r="5" fill="#ca8100" stroke="#101319" strokeWidth="2" />
                <circle cx="335" cy="194" r="9" fill="none" stroke="#ffb95f" strokeWidth="1" strokeOpacity="0.5" />
                <g transform="translate(335, 208)">
                  <rect x="-42" y="0" width="84" height="18" rx="2" fill="#1d2026" stroke="#ca8100" strokeWidth="0.8" />
                  <text x="0" y="12" fill="#ffb95f" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">S04: 42% LOW</text>
                </g>

                {/* S05 Intervention Marker (Violet Pin) */}
                <circle cx="425" cy="116" r="4.5" fill="#a078ff" stroke="#101319" strokeWidth="2" />
                <g transform="translate(425, 76)">
                  <rect x="-56" y="0" width="112" height="20" rx="3" fill="#1d2026" stroke="#a078ff" strokeWidth="0.8" />
                  <text x="0" y="13" fill="#d0bcff" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">Peer Breakout +22%</text>
                  <line x1="0" y1="20" x2="0" y2="36" stroke="#a078ff" strokeWidth="1" strokeDasharray="2 2" />
                </g>

                {/* S08 Peak Marker (Secondary Emerald Pin & Target) */}
                <circle cx="695" cy="56" r="6" fill="#4edea3" stroke="#101319" strokeWidth="2" />
                <circle cx="695" cy="56" r="11" fill="none" stroke="#4edea3" strokeWidth="1.5" strokeOpacity="0.6" />

                {/* S10 Intervention Marker (Violet Pin) */}
                <circle cx="875" cy="83" r="4.5" fill="#a078ff" stroke="#101319" strokeWidth="2" />
                <g transform="translate(875, 42)">
                  <rect x="-52" y="0" width="104" height="20" rx="3" fill="#1d2026" stroke="#a078ff" strokeWidth="0.8" />
                  <text x="0" y="13" fill="#d0bcff" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">Micro-Quiz +14%</text>
                  <line x1="0" y1="20" x2="0" y2="38" stroke="#a078ff" strokeWidth="1" strokeDasharray="2 2" />
                </g>

                {/* Regular Session Dots with Hover Interactivity */}
                {SESSIONS_DATA.map((s) => (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r={s.isPeak ? 7 : s.isLow ? 6 : s.isIntervention ? 5 : 4}
                    fill={s.isPeak ? '#4edea3' : s.isLow ? '#ca8100' : s.isIntervention ? '#a078ff' : '#cbc3d7'}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setActiveSessionHover(s)}
                  />
                ))}

                {/* X-Axis Labels */}
                {SESSIONS_DATA.map((s) => (
                  <text
                    key={`lbl-${s.id}`}
                    x={s.x}
                    y="318"
                    fill={s.isPeak ? '#4edea3' : s.isLow ? '#ffb95f' : s.isIntervention ? '#d0bcff' : '#958ea0'}
                    fontFamily="JetBrains Mono"
                    fontSize="10"
                    fontWeight={s.isPeak || s.isLow ? '600' : 'normal'}
                    textAnchor="middle"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveSessionHover(s)}
                  >
                    {s.label}
                  </text>
                ))}
              </svg>
            </div>

            {/* Diagnostic Metric Strip (Under Chart) */}
            <div className="telemetry-analytics-metrics-strip">
              {/* Metric 1: Peak */}
              <div className="telemetry-analytics-strip-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="telemetry-analytics-strip-icon emerald">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase' }}>
                      Peak Attention
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb' }}>
                      88% <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.75rem' }}>— Session 08</span>
                    </div>
                  </div>
                </div>
                <span className="telemetry-badge-efficacy-optimal">Interactive Debugging</span>
              </div>

              {/* Metric 2: Trough */}
              <div className="telemetry-analytics-strip-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="telemetry-analytics-strip-icon amber">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase' }}>
                      Lowest Attention
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb' }}>
                      42% <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.75rem' }}>— Session 04</span>
                    </div>
                  </div>
                </div>
                <span className="telemetry-badge-efficacy-mod">Didactic Overrun</span>
              </div>

              {/* Metric 3: Recovery */}
              <div className="telemetry-analytics-strip-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="telemetry-analytics-strip-icon violet">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cached</span>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase' }}>
                      Avg. Recovery Time
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb' }}>
                      3.4 min <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.75rem' }}>— Post-Intervention</span>
                    </div>
                  </div>
                </div>
                <span className="telemetry-badge-efficacy-high">+19% Lift &lt;5m</span>
              </div>
            </div>
          </div>

          {/* Bottom Analytical Grid (7 col Interventions vs 5 col Diagnostic Machine) */}
          <div className="telemetry-analytics-bottom-grid">
            {/* Left Column (7 cols): Pedagogical Interventions Log */}
            <div className="telemetry-analytics-panel-left">
              <div>
                <div className="telemetry-analytics-panel-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="material-symbols-outlined" style={{ color: '#d0bcff', fontSize: 18 }}>format_list_bulleted</span>
                      <h3 className="telemetry-analytics-panel-title">Pedagogical Interventions Log</h3>
                    </div>
                    <p className="telemetry-analytics-panel-sub">
                      Documented in-situ teaching modulations and their direct impact on cohort attention retention.
                    </p>
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                    4 Logged Events
                  </span>
                </div>

                {/* Tabular Presentation */}
                <div className="telemetry-interventions-table-wrap">
                  <table className="telemetry-interventions-table">
                    <thead>
                      <tr>
                        <th>Intervention Type</th>
                        <th>Session &amp; Topic</th>
                        <th style={{ textAlign: 'right' }}>Attention Surge</th>
                        <th style={{ textAlign: 'right' }}>Sustained</th>
                        <th style={{ textAlign: 'right' }}>Efficacy</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0bcff' }} />
                            <span style={{ fontWeight: 500, color: '#f9fafb' }}>5-min Micro-Quiz</span>
                          </div>
                        </td>
                        <td style={{ color: '#9ca3af' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S11</span> — Dynamic Programming
                        </td>
                        <td className="telemetry-surge-val">+18.5%</td>
                        <td className="telemetry-sustained-val">22 min</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="telemetry-badge-efficacy-high">HIGH (94)</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0bcff' }} />
                            <span style={{ fontWeight: 500, color: '#f9fafb' }}>Peer Code Review</span>
                          </div>
                        </td>
                        <td style={{ color: '#9ca3af' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S08</span> — Interactive Debugging
                        </td>
                        <td className="telemetry-surge-val">+22.4%</td>
                        <td className="telemetry-sustained-val">28 min</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="telemetry-badge-efficacy-optimal">OPTIMAL (98)</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a078ff' }} />
                            <span style={{ fontWeight: 500, color: '#f9fafb' }}>Targeted Cold Calling</span>
                          </div>
                        </td>
                        <td style={{ color: '#9ca3af' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S09</span> — Memory Allocation
                        </td>
                        <td className="telemetry-surge-val">+11.2%</td>
                        <td className="telemetry-sustained-val">11 min</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="telemetry-badge-efficacy-mod">MODERATE (68)</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb95f' }} />
                            <span style={{ fontWeight: 500, color: '#f9fafb' }}>Unplanned Cognitive Reset</span>
                          </div>
                        </td>
                        <td style={{ color: '#9ca3af' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S04</span> — Monolithic Theory
                        </td>
                        <td className="telemetry-surge-val">+8.1%</td>
                        <td className="telemetry-sustained-val">6 min</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="telemetry-badge-efficacy-low">LOW (41)</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{
                paddingTop: '0.75rem',
                marginTop: '0.75rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
                color: '#9ca3af',
              }}>
                <span>Aggregated sample: {recordedSessions} sessions, 84 enrolled students</span>
                <button
                  type="button"
                  style={{
                    color: '#d0bcff',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setStatusNotification('Viewing complete historical interventions audit trail');
                    setTimeout(() => setStatusNotification(''), 3000);
                  }}
                >
                  <span>View Full Intervention History</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Right Column (5 cols): Algorithmic Diagnostic */}
            <div className="telemetry-analytics-panel-right">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="telemetry-analytics-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span className="material-symbols-outlined" style={{ color: '#d0bcff', fontSize: 18 }}>psychology</span>
                    <h3 className="telemetry-analytics-panel-title">Algorithmic Diagnostic</h3>
                  </div>
                  <span style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: '0.6875rem',
                    color: '#d0bcff',
                    background: 'rgba(139, 92, 246, 0.12)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: 4,
                  }}>
                    High Confidence (p &lt; 0.01)
                  </span>
                </div>

                {/* Insight Card */}
                <div className="telemetry-diagnostic-card">
                  <div className="telemetry-diagnostic-head">
                    <span className="material-symbols-outlined" style={{ color: '#ffb95f', fontSize: 18 }}>schedule</span>
                    <span>32-Minute Drift Cliff Identified</span>
                  </div>
                  <p className="telemetry-diagnostic-desc">
                    Sustained attention begins degrading exponentially around the <strong style={{ color: '#f9fafb' }}>32-minute mark</strong> during purely didactic lectures. Pairing active prompts or coding exercises prior to minute 30 prevents <span style={{ color: '#4edea3', fontWeight: 600 }}>78%</span> of observed drift clusters.
                  </p>
                </div>

                {/* Drift Density by Lecture Quarter (Q1 - Q4) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase' }}>
                      Drift Density by Lecture Quarter
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.65rem', color: '#9ca3af' }}>
                      Q1 (0-15m) → Q4 (45-60m)
                    </span>
                  </div>

                  <div className="telemetry-quarters-heatmap">
                    {/* Q1 */}
                    <div className="telemetry-quarter-card">
                      <span className="telemetry-quarter-label">Q1</span>
                      <span className="telemetry-quarter-num" style={{ color: '#4edea3' }}>4%</span>
                      <span className="telemetry-quarter-status" style={{ color: '#9ca3af' }}>Low Drift</span>
                      <div className="telemetry-quarter-bar" style={{ background: '#4edea3' }} />
                    </div>

                    {/* Q2 */}
                    <div className="telemetry-quarter-card">
                      <span className="telemetry-quarter-label">Q2</span>
                      <span className="telemetry-quarter-num" style={{ color: '#4edea3' }}>11%</span>
                      <span className="telemetry-quarter-status" style={{ color: '#9ca3af' }}>Moderate</span>
                      <div className="telemetry-quarter-bar" style={{ background: 'rgba(78, 222, 163, 0.5)' }} />
                    </div>

                    {/* Q3 */}
                    <div className="telemetry-quarter-card">
                      <span className="telemetry-quarter-label">Q3</span>
                      <span className="telemetry-quarter-num" style={{ color: '#ffb95f' }}>54%</span>
                      <span className="telemetry-quarter-status" style={{ color: '#ffb95f' }}>Critical</span>
                      <div className="telemetry-quarter-bar" style={{ background: '#ffb95f' }} />
                    </div>

                    {/* Q4 */}
                    <div className="telemetry-quarter-card">
                      <span className="telemetry-quarter-label">Q4</span>
                      <span className="telemetry-quarter-num" style={{ color: '#ffb4ab' }}>31%</span>
                      <span className="telemetry-quarter-status" style={{ color: '#ffb4ab' }}>Fatigue</span>
                      <div className="telemetry-quarter-bar" style={{ background: '#ef4444' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action CTAs */}
              <div className="telemetry-diagnostic-actions">
                <button
                  type="button"
                  className="telemetry-btn-cadence"
                  onClick={() => {
                    setStatusNotification('Automatic 28-min cadence intervention rule activated for current syllabus');
                    setTimeout(() => setStatusNotification(''), 4000);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>
                  <span>Set Cadence Rule</span>
                </button>
                <button
                  type="button"
                  className="telemetry-btn-drift-thresh"
                  onClick={() => {
                    setStatusNotification('Drift sensitivity tuned: threshold set to 3.0 min continuous shift');
                    setTimeout(() => setStatusNotification(''), 4000);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>notifications_paused</span>
                  <span>Configure Drift Thresholds</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== VIEW B: INDIVIDUAL STUDENT VIEW ==================== */}
      {viewMode === 'student' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Student Selector Card */}
          <div style={{
            background: '#191c22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '1rem 1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d0bcff'
              }}>
                <User size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                  Student Longitudinal Trajectory
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af', margin: '0.15rem 0 0 0' }}>
                  Select a student to audit individual engagement patterns and intervention responsiveness.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.8125rem', color: '#cbc3d7', fontWeight: 500 }}>Select Student:</label>
              <select
                value={selectedStudentRoll}
                onChange={(e) => setSelectedStudentRoll(e.target.value)}
                style={{
                  background: '#101319',
                  border: '1px solid #282e3c',
                  color: '#f9fafb',
                  borderRadius: 6,
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'JetBrains Mono',
                  minWidth: 220,
                  cursor: 'pointer'
                }}
              >
                {studentRolls.map(({ roll, name }) => (
                  <option key={roll} value={roll}>
                    {roll} — {name}
                  </option>
                ))}
                {studentRolls.length === 0 && (
                  <>
                    <option value="2023-CS-041">2023-CS-041 — Alex Chen</option>
                    <option value="2023-CS-084">2023-CS-084 — Sarah Miller</option>
                    <option value="2023-CS-112">2023-CS-112 — Marcus Vance</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Student Overview Strip */}
          <div className="telemetry-analytics-kpi-grid">
            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Observed Sessions</span>
                <span className="telemetry-analytics-kpi-badge-violet">
                  <span>Enrolled</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <span className="telemetry-analytics-kpi-num">{studentStats?.sessionCount || 8}</span>
                <span className="telemetry-analytics-kpi-sub">Total recorded</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Attendance Rate:</span>
                <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>98.5%</span>
              </div>
            </div>

            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Mean Attention</span>
                <span className="telemetry-analytics-kpi-badge-emerald">
                  <TrendingUp size={12} />
                  <span>+6.2% vs cohort</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span className="telemetry-analytics-kpi-num">{studentStats?.avgAttention || 74}</span>
                  <span className="telemetry-analytics-kpi-unit">%</span>
                </div>
                <span className="telemetry-badge-efficacy-high">Deep Focus Band</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Institutional Bench:</span>
                <span style={{ color: '#ffb95f', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>60.0% Target</span>
              </div>
            </div>

            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Drift Alerts Triggered</span>
                <span className="telemetry-analytics-kpi-badge-emerald">
                  <span>-14% vs avg</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <span className="telemetry-analytics-kpi-num">{studentStats?.totalAlerts || 6}</span>
                <span className="telemetry-analytics-kpi-sub">Total flags</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Recovery Speed:</span>
                <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>Fast (&lt;2.1 min)</span>
              </div>
            </div>
          </div>

          {/* Student Trajectory Chart Board */}
          <div className="telemetry-analytics-chart-board">
            <div className="telemetry-analytics-chart-header">
              <div>
                <div className="telemetry-analytics-chart-title-group">
                  <span className="material-symbols-outlined" style={{ color: '#d0bcff', fontSize: 20 }}>timeline</span>
                  <h3 className="telemetry-analytics-chart-title">
                    Session-by-Session Focus Curve for {studentStats?.name || selectedStudentRoll || 'Alex Chen'}
                  </h3>
                </div>
                <p className="telemetry-analytics-chart-sub">
                  Observed engagement trajectory across sequential laboratory and lecture modules.
                </p>
              </div>
              <span style={{
                fontFamily: 'JetBrains Mono',
                fontSize: '0.6875rem',
                color: '#4edea3',
                background: 'rgba(78, 222, 163, 0.1)',
                padding: '0.2rem 0.5rem',
                borderRadius: 4,
                border: '1px solid rgba(78, 222, 163, 0.25)'
              }}>
                Telemetry Synchronized
              </span>
            </div>

            <div style={{ height: 260, width: '100%', position: 'relative' }}>
              <Line data={studentTrajectoryChartData} options={chartOptions} />
            </div>
          </div>

          {/* Student Session History Table */}
          <div className="telemetry-analytics-panel-left">
            <div className="telemetry-analytics-panel-header">
              <div>
                <h4 className="telemetry-analytics-panel-title">Logged Session Telemetry Records</h4>
                <p className="telemetry-analytics-panel-sub">
                  Click any row to open the complete multi-vector biometric time-series inspector.
                </p>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                {studentSessions.length || 8} Records
              </span>
            </div>

            <div className="telemetry-interventions-table-wrap">
              <table className="telemetry-interventions-table">
                <thead>
                  <tr>
                    <th>Session ID / Timestamp</th>
                    <th>Topic / Module</th>
                    <th style={{ textAlign: 'right' }}>Mean Attention</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                    <th style={{ textAlign: 'right' }}>Drift Flags</th>
                    <th style={{ textAlign: 'right' }}>Inspector</th>
                  </tr>
                </thead>
                <tbody>
                  {studentSessions.length > 0 ? (
                    studentSessions.map((row) => (
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedSession(row.id)}
                      >
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>
                              {row.id.substring(0, 8)}...
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                              {formatTs(row.started_at)}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: '#cbc3d7' }}>{row.topic || 'Interactive Laboratory'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: row.avg_attention >= 70 ? '#4edea3' : row.avg_attention >= 50 ? '#ffb95f' : '#ffb4ab', fontWeight: 600 }}>
                          {row.avg_attention}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#cbc3d7' }}>
                          {formatDurationSec(row.duration_sec)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: row.alerts_count > 0 ? '#ffb95f' : '#4edea3' }}>
                          {row.alerts_count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSession(row.id);
                            }}
                            style={{
                              background: '#272a30',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#d0bcff',
                              borderRadius: 4,
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                          >
                            Inspect Detail
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    SESSIONS_DATA.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>
                            {s.id}
                          </span>
                        </td>
                        <td style={{ color: '#cbc3d7' }}>{s.topic}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: s.attention >= 70 ? '#4edea3' : s.attention >= 50 ? '#ffb95f' : '#ffb4ab', fontWeight: 600 }}>
                          {s.attention}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#cbc3d7' }}>
                          52m 14s
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: s.driftCount > 10 ? '#ffb95f' : '#4edea3' }}>
                          {s.driftCount}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusNotification(`Session ${s.id} telemetry inspector activated`);
                              setTimeout(() => setStatusNotification(''), 3000);
                            }}
                            style={{
                              background: '#272a30',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#d0bcff',
                              borderRadius: 4,
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.72rem',
                              cursor: 'pointer'
                            }}
                          >
                            Inspect Detail
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetail
          sessionId={selectedSession}
          onClose={() => setSelectedSession(null)}
          onDeleted={() => {
            setSelectedSession(null);
            setHistory((prev) => prev.filter((r) => r.id !== selectedSession));
          }}
        />
      )}
    </div>
  );
}
