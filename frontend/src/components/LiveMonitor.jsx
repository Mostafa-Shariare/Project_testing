import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { apiFetch, wsUrl } from '../api';
import StudentCard from './StudentCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const CHART_POINTS = 30;

export default function LiveMonitor({ classCode }) {
  const [students, setStudents] = useState({});
  const [search, setSearch] = useState('');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [alerts, setAlerts] = useState([]);
  const alertHistoryRef = useRef([]);
  const chartDataRef = useRef(Array(CHART_POINTS).fill(null));
  const [, bumpChart] = useState(0);

  const studentList = useMemo(() => Object.values(students), [students]);

  const activeStudents = useMemo(
    () => studentList.filter((s) => s.status === 'active'),
    [studentList],
  );

  const kpis = useMemo(() => {
    const total = activeStudents.length;
    if (total === 0) {
      return { total: 0, avg: 0, ratio: 0, alerts: 0 };
    }
    const sum = activeStudents.reduce((a, s) => a + (s.attention || 0), 0);
    const avg = Math.round(sum / total);
    const attentive = activeStudents.filter((s) => s.model_pred_stable === 1).length;
    const alertCount = activeStudents.filter((s) => s.alert).length;
    return {
      total,
      avg,
      ratio: Math.round((attentive / total) * 100),
      alerts: alertCount,
    };
  }, [activeStudents]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return studentList;
    return studentList.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q) ||
        s.class_code?.toLowerCase().includes(q),
    );
  }, [studentList, search]);

  const pushAlert = useCallback((student) => {
    const alertText = student.alert;
    if (!alertText) return;
    const key = `${student.roll_number}:${alertText}`;
    const now = Date.now();
    const hist = alertHistoryRef.current;
    const idx = hist.findIndex((a) => a.key === key);
    if (idx !== -1 && now - hist[idx].time < 12000) return;

    if (idx !== -1) hist.splice(idx, 1);
    hist.push({ key, time: now });
    if (hist.length > 50) hist.shift();

    setAlerts((prev) => {
      const item = {
        id: `${key}-${now}`,
        roll: student.roll_number,
        name: student.name,
        alert: alertText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      return [item, ...prev].slice(0, 15);
    });
  }, []);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      setWsStatus('connecting');
      socket = new WebSocket(wsUrl('/ws/teacher'));

      socket.onopen = () => setWsStatus('connected');
      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const list = data.students || [];
          const next = {};
          list.forEach((s) => {
            next[s.roll_number || s.name] = s;
          });
          setStudents(next);
          const active = list.filter((s) => s.status === 'active');
          active.forEach(pushAlert);
          const avg =
            active.length > 0
              ? Math.round(active.reduce((a, s) => a + (s.attention || 0), 0) / active.length)
              : null;
          chartDataRef.current = [...chartDataRef.current.slice(1), avg];
          bumpChart((n) => n + 1);
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        setWsStatus('disconnected');
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [pushAlert, classCode]);

  const chartConfig = {
    labels: Array(CHART_POINTS).fill(''),
    datasets: [
      {
        label: 'Class Avg Attention (%)',
        data: [...chartDataRef.current],
        borderColor: '#5aa0f0',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        backgroundColor: 'rgba(90, 160, 240, 0.1)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: {
        min: 0,
        max: 100,
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#7a7c8e', font: { family: 'monospace' } },
      },
    },
  };

  const handleReset = async () => {
    if (!classCode) return;
    if (!confirm(`Reset live session for class ${classCode}?`)) return;
    try {
      await apiFetch(`/api/session/reset?class_code=${encodeURIComponent(classCode)}`);
      setStudents({});
      setAlerts([]);
      alertHistoryRef.current = [];
      chartDataRef.current = Array(CHART_POINTS).fill(null);
      bumpChart((n) => n + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const attnBarClass =
    kpis.avg >= 70 ? 'bar-good' : kpis.avg >= 40 ? 'bar-warn' : 'bar-bad';

  return (
    <div className="monitor-view">
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">👥</div>
          <div className="kpi-data">
            <h3>{kpis.total}</h3>
            <p>Active Students</p>
          </div>
        </div>
        <div className={`kpi-card kpi-attention ${attnBarClass}`}>
          <div className="kpi-icon">📈</div>
          <div className="kpi-data">
            <h3>{kpis.avg}%</h3>
            <p>Class Avg Attention</p>
          </div>
          <div className="mini-progress">
            <div className="mini-progress-fill" style={{ width: `${kpis.avg}%` }} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">✓</div>
          <div className="kpi-data">
            <h3>{kpis.ratio}%</h3>
            <p>Attentive Ratio</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">⚠</div>
          <div className="kpi-data">
            <h3>{kpis.alerts}</h3>
            <p>Active Alerts</p>
          </div>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="panel glass panel-main">
          <div className="panel-header">
            <h2>Live Student Grid</h2>
            <input
              type="search"
              placeholder="Search by name, roll, or class…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="student-grid">
            {studentList.length === 0 && (
              <div className="empty-grid-msg">
                <span>Waiting for students to connect…</span>
              </div>
            )}
            {filtered.map((s) => (
              <StudentCard key={s.roll_number || s.name} student={s} />
            ))}
          </div>
        </div>

        <aside className="sidebar-stack">
          <div className="panel glass chart-panel">
            <div className="panel-header">
              <h2>Class Trend</h2>
            </div>
            <div className="chart-wrap">
              <Line data={chartConfig} options={chartOptions} />
            </div>
          </div>

          <div className="panel glass alerts-panel">
            <div className="panel-header">
              <h2>Live Alerts</h2>
              <span className="badge">{alerts.length}</span>
            </div>
            <div className="alerts-feed">
              {alerts.length === 0 && (
                <p className="empty-alerts">No active alerts</p>
              )}
              {alerts.map((a) => (
                <div key={a.id} className="feed-item">
                  <div className="feed-item-info">
                    <div className="feed-item-title">
                      {a.name} <span className="feed-roll">({a.roll})</span>
                    </div>
                    <div className="feed-alert-text">{a.alert}</div>
                  </div>
                  <div className="feed-item-time">{a.time}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="monitor-toolbar">
        <div className={`ws-status ws-${wsStatus}`}>
          <span className="status-dot" />
          {wsStatus === 'connected'
            ? 'Live Connected'
            : wsStatus === 'connecting'
              ? 'Connecting…'
              : 'Disconnected'}
        </div>
        <button type="button" className="btn btn-danger" onClick={handleReset}>
          Reset Session
        </button>
      </div>
    </div>
  );
}
