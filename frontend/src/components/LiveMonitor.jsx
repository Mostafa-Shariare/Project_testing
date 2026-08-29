import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Brain,
  Eye,
  Maximize2,
  Play,
  Search,
  SortAsc,
  StopCircle,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { apiFetch, wsUrl } from '../api';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { useStudentActions } from '../hooks/useStudentActions';
import {
  filterAndSortStudents,
  formatDuration,
  isBelowThreshold,
  isCriticalAlert,
  isMonitorAlert,
} from '../utils/liveMonitorUtils';
import StudentCard from './StudentCard';
import StudentDetailModal from './StudentDetailModal';

const TIMELINE_MAX = 60;
const SPARKLINE_MAX = 15;

const VIEW_FILTERS = [
  { id: 'all', label: 'All', icon: Users },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'distracted', label: 'Below Threshold', icon: Eye },
  { id: 'offline', label: 'Offline', icon: WifiOff },
];

const SORT_OPTIONS = [
  { id: 'attention-desc', label: 'Attention (high \u2192 low)' },
  { id: 'attention-asc', label: 'Attention (low \u2192 high)' },
  { id: 'name-asc', label: 'Name (A \u2192 Z)' },
];

export default function LiveMonitor({ classCode, onViewStudentHistory }) {
  const [students, setStudents] = useState({});
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [sortBy, setSortBy] = useState('attention-desc');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [alerts, setAlerts] = useState([]);
  const [classSession, setClassSession] = useState(null);
  const [attentionThreshold, setAttentionThreshold] = useState(50);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [sessionTimelines, setSessionTimelines] = useState({});
  const [sparklines, setSparklines] = useState({});
  const [flashingRolls, setFlashingRolls] = useState({});
  const [resetting, setResetting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  const monitorRef = useRef(null);
  const alertHistoryRef = useRef([]);
  const prevAlertsRef = useRef({});
  const attentionTimelinesRef = useRef({});
  const sparklinesRef = useRef({});

  const { getState, runAction } = useStudentActions(classCode);

  const studentList = useMemo(() => Object.values(students), [students]);

  const activeStudents = useMemo(
    () => studentList.filter((s) => s.status === 'active'),
    [studentList],
  );

  const kpis = useMemo(() => {
    const total = activeStudents.length;
    if (total === 0) {
      return { total: 0, avg: 0, focused: 0, alerts: 0 };
    }
    const sum = activeStudents.reduce((a, s) => a + (s.attention || 0), 0);
    const avg = Math.round(sum / total);
    const focused = activeStudents.filter((s) => !isBelowThreshold(s, attentionThreshold)).length;
    const alertCount = activeStudents.filter(
      (s) => isMonitorAlert(s.alert) && !getState(s.roll_number).suppress_alerts,
    ).length;
    return { total, avg, focused, alerts: alertCount };
  }, [activeStudents, attentionThreshold, getState]);

  const {
    scrollToStudent,
    highlightRoll,
    notifyCritical,
  } = useAlertNotifications({ classCode, activeStudents });

  useEffect(() => {
    setStudents({});
    setAlerts([]);
    setClassSession(null);
    setSelectedStudent(null);
    attentionTimelinesRef.current = {};
    sparklinesRef.current = {};
    setSessionTimelines({});
    setSparklines({});
    alertHistoryRef.current = [];
    prevAlertsRef.current = {};
    setSessionElapsed(0);
  }, [classCode]);

  useEffect(() => {
    if (!classCode) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`);
        if (!cancelled) {
          setAttentionThreshold(data.attention_threshold ?? 50);
        }
      } catch {
        /* defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classCode]);

  useEffect(() => {
    const start = classSession?.start_time;
    if (!start) {
      setSessionElapsed(0);
      return undefined;
    }
    const tick = () => setSessionElapsed(Math.max(0, Math.floor(Date.now() / 1000 - start)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [classSession?.start_time]);

  const filtered = useMemo(
    () =>
      filterAndSortStudents(studentList, {
        search,
        viewFilter,
        sortBy,
        threshold: attentionThreshold,
        suppressCheck: (roll) => getState(roll).suppress_alerts,
      }),
    [studentList, search, viewFilter, sortBy, attentionThreshold, getState],
  );

  const recordTimelines = useCallback((list) => {
    const tl = attentionTimelinesRef.current;
    const sp = sparklinesRef.current;
    list.forEach((s) => {
      const roll = s.roll_number;
      if (s.status === 'active') {
        if (!tl[roll]) tl[roll] = [];
        tl[roll].push(s.attention ?? 0);
        if (tl[roll].length > TIMELINE_MAX) tl[roll] = tl[roll].slice(-TIMELINE_MAX);

        if (!sp[roll]) sp[roll] = [];
        sp[roll].push(s.attention ?? 0);
        if (sp[roll].length > SPARKLINE_MAX) sp[roll] = sp[roll].slice(-SPARKLINE_MAX);
      }
    });
    setSessionTimelines({ ...tl });
    setSparklines({ ...sp });
  }, []);

  const detectAlertFlash = useCallback((list) => {
    list.forEach((s) => {
      const roll = s.roll_number;
      const prev = prevAlertsRef.current[roll];
      const cur = s.alert || '';
      if (isMonitorAlert(cur) && cur !== prev) {
        setFlashingRolls((f) => ({ ...f, [roll]: true }));
        setTimeout(() => {
          setFlashingRolls((f) => {
            const next = { ...f };
            delete next[roll];
            return next;
          });
        }, 2500);
      }
      prevAlertsRef.current[roll] = cur;
    });
  }, []);

  const pushFeedAlert = useCallback(
    (student) => {
      if (getState(student.roll_number).suppress_alerts) return;
      const alertText = student.alert;
      if (!isMonitorAlert(alertText)) return;
      const key = `${student.roll_number}:${alertText}`;
      const now = Date.now();
      const hist = alertHistoryRef.current;
      const idx = hist.findIndex((a) => a.key === key);
      if (idx !== -1 && now - hist[idx].time < 12000) return;

      if (idx !== -1) hist.splice(idx, 1);
      hist.push({ key, time: now });
      if (hist.length > 50) hist.shift();

      if (isCriticalAlert(alertText)) notifyCritical(student);

      setAlerts((prev) => {
        const item = {
          id: `${key}-${now}`,
          roll: student.roll_number,
          name: student.name,
          alert: alertText,
          critical: isCriticalAlert(alertText),
          time: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        };
        return [item, ...prev].slice(0, 15);
      });
    },
    [notifyCritical, getState],
  );

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
          if (data.class_session) {
            setClassSession(data.class_session);
            if (data.class_session.attention_threshold != null) {
              setAttentionThreshold(data.class_session.attention_threshold);
            }
          }
          recordTimelines(list);
          detectAlertFlash(list);
          list.filter((s) => s.status === 'active').forEach(pushFeedAlert);
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
  }, [pushFeedAlert, classCode, recordTimelines, detectAlertFlash]);

  const handleRunAction = async (student, action) => {
    if (action === 'mark_excused') {
      if (!confirm(`Mark ${student.name} as excused for this session?`)) return;
    }
    try {
      await runAction(student.roll_number, action);
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await monitorRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const handleStart = async () => {
    if (!classCode || starting) return;
    setStarting(true);
    try {
      await apiFetch(`/api/session/start?class_code=${encodeURIComponent(classCode)}`, { method: 'POST' });
    } catch (err) {
      alert(err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleReset = async () => {
    if (!classCode || resetting) return;
    if (!confirm(`End the live session for ${classCode}? Connected students will be disconnected.`)) return;
    setResetting(true);
    try {
      await apiFetch(`/api/session/end?class_code=${encodeURIComponent(classCode)}`, { method: 'POST' });
      setStudents({});
      setAlerts([]);
      setClassSession(null);
      attentionTimelinesRef.current = {};
      sparklinesRef.current = {};
      setSessionTimelines({});
      setSparklines({});
      alertHistoryRef.current = [];
      setSessionElapsed(0);
    } catch (err) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  const sessionActive = !!classSession?.start_time;

  const wsLabel =
    wsStatus === 'connected'
      ? 'Live'
      : wsStatus === 'connecting'
        ? 'Connecting...'
        : 'Disconnected';

  return (
    <div
      ref={monitorRef}
      className={`monitor-view animate-in ${fullscreen ? 'fullscreen-mode' : ''}`}
    >
      {/* ── Top status bar ── */}
      <div className="monitor-top-bar-enhanced">
        <div className="monitor-top-left">
          <div className={`ws-status ws-${wsStatus}`}>
            <span className="status-dot" />
            {wsStatus === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{wsLabel}</span>
          </div>
          {sessionActive && (
            <div className="session-live-badge">
              <span className="live-pulse-dot" />
              Session Active
            </div>
          )}
        </div>
        <div className="monitor-top-right">
          {sessionActive && (
            <span className="session-timer-display">
              {formatDuration(sessionElapsed)}
            </span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={toggleFullscreen}>
            <Maximize2 size={15} />
            {fullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          {!sessionActive ? (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handleStart}
              disabled={starting}
            >
              <Play size={15} />
              {starting ? 'Starting...' : 'Start Session'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={handleReset}
              disabled={resetting}
            >
              <StopCircle size={15} />
              {resetting ? 'Ending...' : 'End Session'}
            </button>
          )}
        </div>
      </div>

      {/* ── Hero KPI strip (only when session active) ── */}
      {sessionActive && (
        <div className="monitor-hero-kpi">
          <div className="hero-kpi-item hero-kpi-blue">
            <div className="hero-kpi-icon">
              <Users size={18} />
            </div>
            <div className="hero-kpi-data">
              <span className="hero-kpi-value">{kpis.total}</span>
              <span className="hero-kpi-label">Connected</span>
            </div>
          </div>
          <div className="hero-kpi-divider" />
          <div className="hero-kpi-item hero-kpi-green">
            <div className="hero-kpi-icon hero-kpi-icon-green">
              <Activity size={18} />
            </div>
            <div className="hero-kpi-data">
              <span className="hero-kpi-value">{kpis.avg}%</span>
              <span className="hero-kpi-label">Avg Attention</span>
            </div>
          </div>
          <div className="hero-kpi-divider" />
          <div className="hero-kpi-item hero-kpi-emerald">
            <div className="hero-kpi-icon hero-kpi-icon-emerald">
              <Brain size={18} />
            </div>
            <div className="hero-kpi-data">
              <span className="hero-kpi-value">{kpis.focused}</span>
              <span className="hero-kpi-label">Focused</span>
            </div>
          </div>
          <div className="hero-kpi-divider" />
          <div className="hero-kpi-item hero-kpi-amber">
            <div className="hero-kpi-icon hero-kpi-icon-amber">
              <Zap size={18} />
            </div>
            <div className="hero-kpi-data">
              <span className="hero-kpi-value">{kpis.alerts}</span>
              <span className="hero-kpi-label">Active Alerts</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Workspace ── */}
      <div className="workspace-layout">
        <div className="panel glass panel-main monitor-main-panel">
          {/* ── Filter bar ── */}
          <div className="monitor-filter-bar">
            <div className="monitor-search-wrap">
              <Search size={15} className="monitor-search-icon" />
              <input
                type="search"
                placeholder="Search by name or roll number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="monitor-search-input"
              />
            </div>
            <div className="monitor-filter-chips">
              {VIEW_FILTERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`monitor-chip ${viewFilter === id ? 'active' : ''}`}
                  onClick={() => setViewFilter(id)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <div className="monitor-sort-wrap">
              <SortAsc size={14} className="sort-icon" />
              <select
                className="monitor-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="monitor-results-bar">
            <span className="results-count">
              Showing <strong>{filtered.length}</strong> of <strong>{studentList.length}</strong> students
            </span>
          </div>

          {/* ── Student grid ── */}
          <div className="student-grid student-grid-v2">
            {!sessionActive && (
              <div className="monitor-empty-state">
                <div className="monitor-empty-icon">
                  <Play size={36} strokeWidth={1.5} />
                </div>
                <h3>Session Not Started</h3>
                <p>Click <strong>Start Session</strong> to begin monitoring students.</p>
              </div>
            )}
            {sessionActive && studentList.length === 0 && (
              <div className="monitor-empty-state">
                <div className="monitor-empty-icon monitor-empty-pulse">
                  <Users size={36} strokeWidth={1.5} />
                </div>
                <h3>Waiting for Students</h3>
                <p>Students will appear here as they connect to the session.</p>
              </div>
            )}
            {sessionActive && studentList.length > 0 && filtered.length === 0 && (
              <div className="monitor-empty-state">
                <div className="monitor-empty-icon">
                  <Search size={36} strokeWidth={1.5} />
                </div>
                <h3>No Matches</h3>
                <p>No students match the current filter or search.</p>
              </div>
            )}
            {filtered.map((s) => (
              <StudentCard
                key={s.roll_number || s.name}
                student={s}
                highlighted={highlightRoll === s.roll_number}
                attentionThreshold={attentionThreshold}
                sparkline={sparklines[s.roll_number] || []}
                actionState={getState(s.roll_number)}
                alertFlashing={!!flashingRolls[s.roll_number]}
                onClick={setSelectedStudent}
                onViewHistory={onViewStudentHistory}
                onRunAction={handleRunAction}
              />
            ))}
          </div>
        </div>

        {/* ── Alerts sidebar ── */}
        <aside className="sidebar-stack">
          <div className="panel alerts-panel card alerts-panel-enhanced">
            <div className="panel-header">
              <div className="panel-title-group">
                <AlertTriangle size={15} className="panel-title-icon panel-title-icon-warn" />
                <h2>Alerts</h2>
              </div>
              {alerts.length > 0 && <span className="alerts-count-badge">{alerts.length}</span>}
            </div>
            <div className="alerts-feed">
              {alerts.length === 0 ? (
                <div className="alerts-empty-state">
                  <div className="alerts-empty-icon">
                    <Bell size={24} />
                  </div>
                  <p>No alerts yet</p>
                  <span>Alerts will appear here when students need attention.</span>
                </div>
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`feed-item feed-item-btn ${a.critical ? 'feed-critical' : ''}`}
                    onClick={() => {
                      scrollToStudent(a.roll);
                      const st = students[a.roll];
                      if (st) setSelectedStudent(st);
                    }}
                  >
                    <div className="feed-item-info">
                      <div className="feed-item-title">
                        {a.critical && <span className="critical-dot" />}
                        {a.name} <span className="feed-roll">({a.roll})</span>
                      </div>
                      <div className="feed-alert-text">{a.alert}</div>
                    </div>
                    <div className="feed-item-time">{a.time}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <StudentDetailModal
        student={selectedStudent}
        classCode={classCode}
        attentionThreshold={attentionThreshold}
        sessionTimeline={selectedStudent ? sessionTimelines[selectedStudent.roll_number] : []}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
