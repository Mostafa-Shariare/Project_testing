import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CheckCircle2,
  Crosshair,
  Eye,
  LayoutGrid,
  List,
  Maximize2,
  MessageSquare,
  Play,
  Radio,
  Search,
  Sliders,
  SortAsc,
  Sparkles,
  StopCircle,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, wsUrl } from '../api';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { useStudentActions } from '../hooks/useStudentActions';
import {
  filterAndSortStudents,
  formatDuration,
  formatEvidenceMessage,
  getAlertSeverity,
  isBelowThreshold,
  isCriticalAlert,
  isMonitorAlert,
} from '../utils/liveMonitorUtils';
import StudentCard from './StudentCard';
import StudentDetailModal from './StudentDetailModal';
import SocraticBanner from './SocraticBanner';
import SocraticTeacherPanel from './SocraticTeacherPanel';
import SocraticPanel from './SocraticPanel';
import { handleSocraticEvent } from '../utils/notification_service';

const TIMELINE_MAX = 60;
const SPARKLINE_MAX = 15;

const VIEW_FILTERS = [
  { id: 'all', label: 'All', icon: Users },
  { id: 'drift', label: 'Attention Drift', icon: Eye },
  { id: 'threshold', label: 'Below Threshold', icon: AlertTriangle },
  { id: 'socratic', label: 'In Socratic Dialogue', icon: Brain },
];

const SORT_OPTIONS = [
  { id: 'attention-desc', label: 'Attention (high → low)' },
  { id: 'attention-asc', label: 'Attention (low → high)' },
  { id: 'name-asc', label: 'Name (A → Z)' },
];

function attentionToY(val) {
  const v = Math.max(0, Math.min(100, Number(val) || 0));
  if (v >= 75) {
    return 48 - ((v - 75) / 25) * (48 - 14); // 75% -> 48, 100% -> 14
  } else if (v >= 50) {
    return 88 - ((v - 50) / 25) * (88 - 48); // 50% -> 88, 75% -> 48
  } else {
    return 126 - (v / 50) * (126 - 88);       // 0% -> 126, 50% -> 88
  }
}

function generateSmoothSpline(points) {
  if (!points || points.length === 0) return { stroke: '', area: '', lastPoint: null };
  if (points.length === 1) {
    const y = points[0].y;
    const stroke = `M 30 ${y.toFixed(1)} L 750 ${y.toFixed(1)}`;
    const area = `M 30 126 L 30 ${y.toFixed(1)} L 750 ${y.toFixed(1)} L 750 126 Z`;
    return { stroke, area, lastPoint: { x: 750, y } };
  }

  let stroke = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    stroke += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const lastPoint = points[points.length - 1];
  const area = `${stroke} L ${lastPoint.x.toFixed(1)} 126 L ${points[0].x.toFixed(1)} 126 Z`;
  return { stroke, area, lastPoint };
}

export default function LiveMonitor({ classCode, onViewStudentHistory, onOpenInterventions, onTelemetryUpdate }) {
  const [students, setStudents] = useState({});
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [displayMode, setDisplayMode] = useState('cards'); // 'cards' | 'compact'
  const [focusMode, setFocusMode] = useState(false);
  const [timeScope, setTimeScope] = useState('45m');
  const [sortBy, setSortBy] = useState('attention-desc');
  const [wsStatus, setWsStatus] = useState('connecting');
  const [alerts, setAlerts] = useState([]);
  const [classSession, setClassSession] = useState(null);
  const [attentionThreshold, setAttentionThreshold] = useState(50);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [sessionTimelines, setSessionTimelines] = useState({});
  const [sparklines, setSparklines] = useState({});
  const [cohortTimeline, setCohortTimeline] = useState([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [flashingRolls, setFlashingRolls] = useState({});
  const [resetting, setResetting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dismissedIntervention, setDismissedIntervention] = useState(false);
  const [pedagogicalAlert, setPedagogicalAlert] = useState(null);
  // Socratic UI state
  const [showTeacherPanel, setShowTeacherPanel] = useState(false);
  const [showStudentPanel, setShowStudentPanel] = useState(false);
  const [socraticSessionId, setSocraticSessionId] = useState(null);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState([]);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  const monitorRef = useRef(null);
  const svgRef = useRef(null);
  const searchInputRef = useRef(null);
  const alertHistoryRef = useRef([]);
  const prevAlertsRef = useRef({});
  const attentionTimelinesRef = useRef({});
  const sparklinesRef = useRef({});
  const cohortTimelineRef = useRef([]);

  const { getState, runAction } = useStudentActions(classCode);

  const studentList = useMemo(() => Object.values(students).filter(Boolean), [students]);

  const activeStudents = useMemo(
    () => studentList.filter((s) => s && s.status === 'active'),
    [studentList],
  );

  const {
    scrollToStudent,
    highlightRoll,
    notifyCritical,
  } = useAlertNotifications({ classCode, activeStudents });

  const displayList = useMemo(() => {
    return activeStudents;
  }, [activeStudents]);

  const pulseFocusIndex = useMemo(() => {
    if (displayList.length === 0) return 0;
    const sum = displayList.reduce((acc, s) => acc + (s.attention || 0), 0);
    return Math.round(sum / displayList.length);
  }, [displayList]);

  const driftCount = useMemo(() => {
    return displayList.filter(
      (s) => (s.attention < 75 && s.attention >= 50) || (s.alert && (s.alert.toLowerCase().includes('unfocused') || s.alert.toLowerCase().includes('tab') || s.alert.toLowerCase().includes('gaze')))
    ).length;
  }, [displayList]);

  const criticalCount = useMemo(() => {
    return displayList.filter(
      (s) => s.attention < 50 || (s.alert && s.alert.toLowerCase().includes('critical'))
    ).length;
  }, [displayList]);

  const socraticCount = useMemo(() => {
    return displayList.filter(
      (s) => s.in_socratic || s.socratic_step || (s.status_label && s.status_label.toLowerCase().includes('socratic'))
    ).length;
  }, [displayList]);

  const totalCount = Math.max(1, displayList.length);
  const nominalCount = Math.max(0, displayList.length - driftCount - criticalCount);

  const onTelemetryUpdateRef = useRef(onTelemetryUpdate);
  useEffect(() => {
    onTelemetryUpdateRef.current = onTelemetryUpdate;
  }, [onTelemetryUpdate]);

  useEffect(() => {
    onTelemetryUpdateRef.current?.({
      syncRate: wsStatus === 'connected' ? '120 ms' : 'Offline',
      engagement: displayList.length > 0 ? `${pulseFocusIndex}%` : '--',
      driftAlerts: driftCount,
    });
  }, [pulseFocusIndex, driftCount, wsStatus, displayList.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredDisplayList = useMemo(() => {
    return displayList.filter((s) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.roll_number && s.roll_number.toLowerCase().includes(q)) ||
        (s.current_task && s.current_task.toLowerCase().includes(q)) ||
        (s.alert && s.alert.toLowerCase().includes(q)) ||
        (s.attention_state && s.attention_state.toLowerCase().includes(q)) ||
        (s.status_label && s.status_label.toLowerCase().includes(q));

      const isCrit = s.attention < 50 || (s.alert && s.alert.toLowerCase().includes('critical'));
      const isDr =
        (s.attention < 75 && !isCrit) ||
        (s.alert &&
          (s.alert.toLowerCase().includes('unfocused') ||
            s.alert.toLowerCase().includes('tab') ||
            s.alert.toLowerCase().includes('gaze')));
      const isSoc =
        s.in_socratic || s.socratic_step || (s.status_label && s.status_label.toLowerCase().includes('socratic'));

      let matchesFilter = true;
      if (viewFilter === 'drift') matchesFilter = isDr;
      else if (viewFilter === 'threshold') matchesFilter = isCrit;
      else if (viewFilter === 'socratic') matchesFilter = isSoc;

      const matchesFocus = !focusMode || isDr || isCrit;

      return matchesSearch && matchesFilter && matchesFocus;
    });
  }, [displayList, search, viewFilter, focusMode]);

  const priorityInterventionsList = useMemo(() => {
    if (alerts.length > 0) {
      return alerts.map((a) => ({
        id: a.id,
        studentName: a.name,
        severity: a.critical ? 'critical' : 'drift',
        timeAgo: a.time,
        description: a.alert || 'Comprehension anomaly detected.',
        actionLabel: a.critical ? 'Deconstruct Concept' : 'Socratic Nudge',
        actionType: a.critical ? 'deconstruct' : 'nudge',
      }));
    }
    return [];
  }, [alerts]);

  useEffect(() => {
    setStudents({});
    setAlerts([]);
    setClassSession(null);
    setSelectedStudent(null);
    attentionTimelinesRef.current = {};
    sparklinesRef.current = {};
    cohortTimelineRef.current = [];
    setCohortTimeline([]);
    setHoveredPoint(null);
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
    const active = (list || []).filter((s) => s && s.status === 'active');

    active.forEach((s) => {
      const roll = s.roll_number;
      if (!tl[roll]) tl[roll] = [];
      tl[roll].push(s.attention ?? 0);
      if (tl[roll].length > TIMELINE_MAX) tl[roll] = tl[roll].slice(-TIMELINE_MAX);

      if (!sp[roll]) sp[roll] = [];
      sp[roll].push(s.attention ?? 0);
      if (sp[roll].length > SPARKLINE_MAX) sp[roll] = sp[roll].slice(-SPARKLINE_MAX);
    });

    if (active.length > 0) {
      const avg = Math.round(
        active.reduce((acc, s) => acc + (s.attention ?? 0), 0) / active.length
      );
      const ctl = cohortTimelineRef.current;
      ctl.push({
        time: Date.now(),
        avg,
        count: active.length,
        students: active.map((s) => ({
          roll: s.roll_number,
          name: s.name,
          attention: s.attention ?? 0,
        })),
      });
      if (ctl.length > 600) {
        ctl.shift();
      }
      setCohortTimeline([...ctl]);
    }

    setSessionTimelines({ ...tl });
    setSparklines({ ...sp });
  }, []);

  const detectAlertFlash = useCallback((list) => {
    (list || []).forEach((s) => {
      if (!s) return;
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
      if (!student) return;
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
          attentionState: student.attention_state || 'Attention Drift',
          sustainedSec: Math.round(student.sustained_duration_sec || 15),
          confidence: student.confidence || 85,
          contributingFactors: student.contributing_factors || [],
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

  const recordTimelinesRef = useRef(recordTimelines);
  const detectAlertFlashRef = useRef(detectAlertFlash);
  const pushFeedAlertRef = useRef(pushFeedAlert);

  useEffect(() => {
    recordTimelinesRef.current = recordTimelines;
  }, [recordTimelines]);
  useEffect(() => {
    detectAlertFlashRef.current = detectAlertFlash;
  }, [detectAlertFlash]);
  useEffect(() => {
    pushFeedAlertRef.current = pushFeedAlert;
  }, [pushFeedAlert]);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      setWsStatus('connecting');
      socket = new WebSocket(wsUrl('/ws/teacher'));

      socket.onopen = () => {
        if (!closed) setWsStatus('connected');
      };
      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const list = (data.students || []).filter(Boolean);
          const next = {};
          list.forEach((s) => {
            if (s && (s.roll_number || s.name)) {
              next[s.roll_number || s.name] = s;
            }
          });
          setStudents(next);
          if (data.class_session) {
            setClassSession(data.class_session);
            if (data.class_session.attention_threshold != null) {
              setAttentionThreshold(data.class_session.attention_threshold);
            }
            if (!data.class_session.intervention_eligible) {
              setPedagogicalAlert(null);
            }
          }
          if (data.event === 'pedagogical_intervention_recommended') {
            setPedagogicalAlert(data);
            setDismissedIntervention(false);
          }
          // Existing telemetry processing via refs
          recordTimelinesRef.current?.(list);
          detectAlertFlashRef.current?.(list);
          list.filter((s) => s && s.status === 'active').forEach((s) => pushFeedAlertRef.current?.(s));
          // Socratic event handling
          if (data.event && data.event.startsWith('socratic_')) {
            handleSocraticEvent(data.event, data, {
              setSocraticSessionId,
              setShowTeacherPanel,
              setShowStudentPanel,
              setQuestion,
              setAnswers,
            });
          }
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setWsStatus('disconnected');
        reconnectTimer = setTimeout(connect, 3000);
      };
      socket.onerror = () => {
        if (closed) return;
        socket.close();
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => {
            try { socket.close(); } catch {}
          };
        }
      }
    };
  }, [classCode]);

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
      cohortTimelineRef.current = [];
      setCohortTimeline([]);
      setHoveredPoint(null);
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

  const cohortColor = useMemo(() => {
    if (pulseFocusIndex >= 70) return '#4edea3';
    if (pulseFocusIndex >= 50) return '#ffb95f';
    return '#ffb4ab';
  }, [pulseFocusIndex]);

  const pulseData = useMemo(() => {
    if (displayList.length === 0) {
      return {
        hasData: false,
        cohortSpline: null,
        cohortPts: [],
        individualSplines: [],
        timeTicks: ['-45m', '-35m', '-25m', '-15m', '-5m', 'Standby'],
        pointsInScope: [],
      };
    }

    const scopeMinutes = parseInt(timeScope, 10) || 45;
    const windowMs = scopeMinutes * 60 * 1000;
    const now = Date.now();
    let pointsInScope = cohortTimeline.filter((p) => now - p.time <= windowMs);

    // If no points recorded yet in this session, seed with current instantaneous values
    if (pointsInScope.length === 0) {
      pointsInScope = [
        {
          time: now,
          avg: pulseFocusIndex,
          count: displayList.length,
          students: displayList.map((s) => ({
            roll: s.roll_number,
            name: s.name,
            attention: s.attention ?? 0,
          })),
        },
      ];
    }

    let cohortPts = [];
    if (pointsInScope.length === 1) {
      const y = attentionToY(pointsInScope[0].avg);
      cohortPts = [
        { x: 30, y, raw: pointsInScope[0] },
        { x: 750, y, raw: pointsInScope[0] },
      ];
    } else {
      cohortPts = pointsInScope.map((p, idx) => ({
        x: 30 + (idx / (pointsInScope.length - 1)) * 720,
        y: attentionToY(p.avg),
        raw: p,
      }));
    }

    const cohortSpline = generateSmoothSpline(cohortPts);

    // Individual student traces if more than 1 student active in current session
    const individualSplines = [];
    if (displayList.length > 1) {
      displayList.forEach((st, sIdx) => {
        let sPts = [];
        if (pointsInScope.length === 1) {
          const y = attentionToY(st.attention ?? 0);
          sPts = [
            { x: 30, y },
            { x: 750, y },
          ];
        } else {
          sPts = pointsInScope.map((p, idx) => {
            const found = p.students?.find((item) => item.roll === st.roll_number);
            const val = found != null ? found.attention : (st.attention ?? 0);
            return {
              x: 30 + (idx / (pointsInScope.length - 1)) * 720,
              y: attentionToY(val),
            };
          });
        }
        const colors = ['#60a5fa', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c'];
        individualSplines.push({
          roll: st.roll_number,
          name: st.name,
          spline: generateSmoothSpline(sPts),
          color: colors[sIdx % colors.length],
        });
      });
    }

    // Dynamic Time Ticks reflecting the actual current session
    let timeTicks = [];
    if (pointsInScope.length <= 1) {
      timeTicks = ['Start', '', '', '', 'Now (Live)'];
    } else {
      const durationMs = pointsInScope[pointsInScope.length - 1].time - pointsInScope[0].time;
      if (durationMs < 90000) {
        // Under 90s: seconds ticks
        timeTicks = [
          'Start',
          `-${Math.round((durationMs * 0.75) / 1000)}s`,
          `-${Math.round((durationMs * 0.5) / 1000)}s`,
          `-${Math.round((durationMs * 0.25) / 1000)}s`,
          'Now (Live)',
        ];
      } else if (durationMs < 600000) {
        // Under 10 mins: minute ticks
        timeTicks = [
          'Start',
          `-${((durationMs * 0.75) / 60000).toFixed(1)}m`,
          `-${((durationMs * 0.5) / 60000).toFixed(1)}m`,
          `-${((durationMs * 0.25) / 60000).toFixed(1)}m`,
          'Now (Live)',
        ];
      } else {
        timeTicks = [
          `-${timeScope}`,
          `-${Math.round(scopeMinutes * 0.75)}m`,
          `-${Math.round(scopeMinutes * 0.5)}m`,
          `-${Math.round(scopeMinutes * 0.25)}m`,
          'Now (Live)',
        ];
      }
    }

    return {
      hasData: true,
      cohortSpline,
      cohortPts,
      individualSplines,
      timeTicks,
      pointsInScope,
    };
  }, [cohortTimeline, timeScope, displayList, pulseFocusIndex]);

  const handleSvgMouseMove = useCallback((e) => {
    if (!svgRef.current || !pulseData.cohortPts || pulseData.cohortPts.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const mouseSvgX = ((clientX - rect.left) / rect.width) * 760;

    let closest = pulseData.cohortPts[0];
    let minDiff = Math.abs(closest.x - mouseSvgX);
    for (let i = 1; i < pulseData.cohortPts.length; i++) {
      const diff = Math.abs(pulseData.cohortPts[i].x - mouseSvgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pulseData.cohortPts[i];
      }
    }
    if (closest) {
      setHoveredPoint({
        x: closest.x,
        y: closest.y,
        raw: closest.raw,
        clientX: clientX - rect.left,
        clientY: clientY - rect.top,
      });
    }
  }, [pulseData.cohortPts]);

  const handleSvgMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);

  return (
    <div
      ref={monitorRef}
      className={`monitor-view animate-in ${fullscreen ? 'fullscreen-mode' : ''}`}
    >
      {/* ── Top Closed-Loop Pedagogical Cycle Sub-Bar ── */}
      <section className="telemetry-sub-bar">
        <div className="telemetry-sub-bar-left">
          <div className="telemetry-live-signal">
            <span className="pulse-dot" />
            <span>SYNCHRONOUS FEED</span>
          </div>
          <div className="telemetry-sub-bar-meta">
            <span style={{ color: 'var(--telemetry-outline)' }}>Latency</span>
            <span className="latency">120ms</span>
            <span style={{ color: 'var(--telemetry-outline-variant)' }}>•</span>
            <span>{displayList.length} Students Connected</span>
          </div>
        </div>

        <div className="telemetry-sub-bar-right">
          <div className="telemetry-stat-item drift">
            <span className="dot" />
            <span style={{ color: 'var(--telemetry-outline)' }}>Drift:</span>
            <strong>{driftCount}</strong>
          </div>
          <div className="telemetry-stat-item socratic">
            <span className="dot" />
            <span style={{ color: 'var(--telemetry-outline)' }}>Socratic:</span>
            <strong>{socraticCount}</strong>
          </div>
          <div className="telemetry-stat-item critical">
            <span className="dot" />
            <span style={{ color: 'var(--telemetry-outline)' }}>Critical:</span>
            <strong>{criticalCount}</strong>
          </div>
          <div className="telemetry-engine-badge">
            <Sliders size={13} />
            <span>Engine: Strict</span>
          </div>
          {!sessionActive ? (
            <button
              type="button"
              className="telemetry-start-session-btn"
              onClick={handleStart}
              disabled={starting}
              style={{ marginLeft: '0.5rem' }}
            >
              <Radio size={14} />
              {starting ? 'Starting...' : 'Start Live Session'}
            </button>
          ) : (
            <button
              type="button"
              className="telemetry-end-session-btn"
              onClick={handleReset}
              disabled={resetting}
              style={{ marginLeft: '0.5rem' }}
            >
              <StopCircle size={14} />
              {resetting ? 'Ending...' : 'End Session'}
            </button>
          )}
        </div>
      </section>

      {/* ── Sustained Low-Attention Pedagogical Intervention Recommendation Card ── */}
      {(classSession?.intervention_eligible || pedagogicalAlert) && !dismissedIntervention && (
        <div style={{
          margin: '0.85rem 1.25rem 0.25rem 1.25rem',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(255, 185, 95, 0.16) 0%, rgba(208, 188, 255, 0.12) 100%)',
          border: '1px solid rgba(255, 185, 95, 0.45)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: '280px' }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: '10px',
              background: 'rgba(255, 185, 95, 0.22)',
              border: '1px solid rgba(255, 185, 95, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffb95f',
              flexShrink: 0
            }}>
              <Brain size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(255, 185, 95, 0.25)',
                  color: '#ffb95f',
                  border: '1px solid rgba(255, 185, 95, 0.4)'
                }}>
                  Intervention Eligible
                </span>
                <span style={{ color: '#f3f4f6', fontWeight: 700, fontSize: '0.95rem' }}>
                  Pedagogical Intervention Recommended
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0 0', color: '#d1d5db', fontSize: '0.825rem', lineHeight: 1.4 }}>
                {classSession?.intervention_reason || pedagogicalAlert?.reason || (
                  `Smoothed class attention (${classSession?.class_average_smoothed != null ? Math.round(classSession.class_average_smoothed) : pulseFocusIndex}%) fell below criterion (${classSession?.class_average_threshold || 60}%) for ≥${classSession?.sustained_low_attention_sec || 30}s.`
                )}
                <span style={{ color: '#9ca3af', marginLeft: '0.35rem' }}>
                  The teacher retains full authority to activate or defer intervention activities.
                </span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => {
                if (onOpenInterventions) {
                  onOpenInterventions();
                } else {
                  setShowTeacherPanel(true);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #ffb95f 0%, #ff9800 100%)',
                color: '#121316',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(255, 185, 95, 0.3)',
              }}
            >
              <Sparkles size={16} />
              <span>Review & Activate Intervention</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedIntervention(true)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#9ca3af',
                fontSize: '0.82rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Split 70/30 Cockpit Grid ── */}
      <div className="telemetry-cockpit-grid">
        {/* LEFT / MAIN OBSERVATION ROOM (~68%) */}
        <div className="telemetry-obs-room">
          {/* View Filtering & Quick Matrix Controls Bar */}
          <div className="telemetry-controls-bar">
            <div className="telemetry-filter-tabs">
              <button
                type="button"
                className={`telemetry-filter-tab all ${viewFilter === 'all' ? 'active' : ''}`}
                onClick={() => setViewFilter('all')}
              >
                All Students ({displayList.length})
              </button>
              <button
                type="button"
                className={`telemetry-filter-tab drift ${viewFilter === 'drift' ? 'active' : ''}`}
                onClick={() => setViewFilter('drift')}
              >
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--telemetry-tertiary)' }} />
                Attention Drift ({driftCount})
              </button>
              <button
                type="button"
                className={`telemetry-filter-tab critical ${viewFilter === 'threshold' ? 'active' : ''}`}
                onClick={() => setViewFilter('threshold')}
              >
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--telemetry-error)' }} />
                Below Threshold ({criticalCount})
              </button>
              <button
                type="button"
                className={`telemetry-filter-tab socratic ${viewFilter === 'socratic' ? 'active' : ''}`}
                onClick={() => setViewFilter('socratic')}
              >
                <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--telemetry-secondary)' }} />
                In Socratic Dialogue ({socraticCount})
              </button>
            </div>

            <div className="telemetry-search-group">
              <div className="telemetry-search-box">
                <Search size={14} className="telemetry-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="telemetry-search-input"
                  placeholder="Search student, event, step..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="telemetry-search-actions">
                  {search && (
                    <button
                      type="button"
                      className="telemetry-search-clear"
                      onClick={() => {
                        setSearch('');
                        searchInputRef.current?.focus();
                      }}
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                  <span className="telemetry-cmd-k">⌘K</span>
                </div>
              </div>

              <div className="telemetry-view-mode-group">
                <button
                  type="button"
                  className={`telemetry-view-btn ${displayMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('cards')}
                  title="Observation Card Matrix"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  className={`telemetry-view-btn ${displayMode === 'compact' ? 'active' : ''}`}
                  onClick={() => setDisplayMode('compact')}
                  title="Compact Observability Table"
                >
                  <List size={15} />
                </button>
              </div>

              <button
                type="button"
                className={`telemetry-focus-btn ${focusMode ? 'active' : ''}`}
                onClick={() => setFocusMode((v) => !v)}
                title="Mute non-alert streams (Focus Mode)"
              >
                <Crosshair size={15} />
              </button>
            </div>
          </div>

          {/* Real-Time Cohort Attention Pulse SVG Chart (Current Session) */}
          <section className="telemetry-pulse-card">
            <div className="telemetry-pulse-header">
              <div className="telemetry-pulse-header-left">
                <div className="telemetry-pulse-title-wrap">
                  <TrendingUp size={16} color="var(--telemetry-primary)" />
                  <h2>Real-Time Cohort Attention Pulse</h2>
                  <span className="telemetry-pulse-time-scope">
                    {displayList.length > 0
                      ? sessionElapsed > 0
                        ? `(Current Session · ${formatDuration(sessionElapsed)})`
                        : '(Current Session · Live)'
                      : `(Last ${timeScope})`}
                  </span>
                </div>

                <div className="telemetry-focus-index-stat">
                  <span
                    className="pulse-dot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: displayList.length > 0 ? cohortColor : 'var(--telemetry-outline)',
                    }}
                  />
                  <span className="score">{displayList.length > 0 ? `${pulseFocusIndex}%` : '--'}</span>
                  <span className="label">Cohort Focus Index</span>
                  <span className="delta">
                    {displayList.length > 0
                      ? pulseFocusIndex >= 70
                        ? 'Nominal Flow'
                        : pulseFocusIndex >= 50
                          ? 'Attention Drift'
                          : 'Critical Shift'
                      : 'Awaiting live stream'}
                  </span>
                </div>
              </div>

              <div className="telemetry-pulse-header-right">
                <div className="telemetry-time-range-group">
                  {['15m', '30m', '45m', '1h'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`telemetry-time-range-btn ${timeScope === t ? 'active' : ''}`}
                      onClick={() => setTimeScope(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--telemetry-font-mono)', fontSize: '0.65rem', color: 'var(--telemetry-outline)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: displayList.length > 0 ? cohortColor : 'var(--telemetry-outline)' }} />
                  <span>{displayList.length > 0 ? `${displayList.length} Active · Live 1s` : 'Standby'}</span>
                </div>
              </div>
            </div>

            {/* SVG Interactive Waveform */}
            <div
              className="telemetry-svg-container"
              style={{ position: 'relative' }}
              onMouseMove={handleSvgMouseMove}
              onMouseLeave={handleSvgMouseLeave}
            >
              <svg
                ref={svgRef}
                className="w-full h-36 overflow-visible"
                preserveAspectRatio="none"
                viewBox="0 0 760 144"
                style={{ width: '100%', height: '144px', cursor: displayList.length > 0 ? 'crosshair' : 'default' }}
              >
                <defs>
                  <linearGradient id="pulse-area-grad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={cohortColor} stopOpacity="0.32" />
                    <stop offset="55%" stopColor={cohortColor} stopOpacity="0.08" />
                    <stop offset="100%" stopColor={cohortColor} stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                {/* Reference Grid Lines */}
                <line stroke="#3c4a42" strokeDasharray="3 3" strokeOpacity="0.35" strokeWidth="1" x1="30" x2="750" y1="14" y2="14" />
                <text fill="#86948a" fontFamily="JetBrains Mono" fontSize="9" textAnchor="end" x="24" y="17">100%</text>

                <line stroke="#3c4a42" strokeDasharray="3 3" strokeOpacity="0.4" strokeWidth="1" x1="30" x2="750" y1="48" y2="48" />
                <text fill="#86948a" fontFamily="JetBrains Mono" fontSize="9" textAnchor="end" x="24" y="51">75%</text>

                <line stroke="#ffb95f" strokeDasharray="4 4" strokeOpacity="0.55" strokeWidth="1" x1="30" x2="750" y1="88" y2="88" />
                <text fill="#ffb95f" fontFamily="JetBrains Mono" fontSize="9" textAnchor="end" x="24" y="91">50% Crit</text>

                {/* Wave Area Fill & Stroke */}
                {pulseData.hasData && pulseData.cohortSpline ? (
                  <>
                    {/* Individual student traces if multiple students */}
                    {pulseData.individualSplines.map((st) => (
                      <path
                        key={st.roll}
                        d={st.spline.stroke}
                        fill="none"
                        stroke={st.color}
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                        opacity="0.4"
                      />
                    ))}

                    {/* Area under cohort curve */}
                    <path
                      d={pulseData.cohortSpline.area}
                      fill="url(#pulse-area-grad)"
                    />

                    {/* Main Cohort Attention Pulse Line */}
                    <path
                      d={pulseData.cohortSpline.stroke}
                      fill="none"
                      stroke={cohortColor}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.4"
                      style={{ filter: `drop-shadow(0 0 8px ${cohortColor}60)` }}
                    />

                    {/* Live Point on Right Edge */}
                    {pulseData.cohortSpline.lastPoint && (
                      <>
                        <circle
                          cx={pulseData.cohortSpline.lastPoint.x}
                          cy={pulseData.cohortSpline.lastPoint.y}
                          fill={cohortColor}
                          r="4"
                        />
                        <circle
                          className="animate-ping"
                          cx={pulseData.cohortSpline.lastPoint.x}
                          cy={pulseData.cohortSpline.lastPoint.y}
                          fill="none"
                          opacity="0.75"
                          r="7"
                          stroke={cohortColor}
                          strokeWidth="1.5"
                        />
                      </>
                    )}

                    {/* Interactive hover crosshair */}
                    {hoveredPoint && (
                      <>
                        <line
                          x1={hoveredPoint.x}
                          x2={hoveredPoint.x}
                          y1="14"
                          y2="126"
                          stroke="rgba(255, 255, 255, 0.3)"
                          strokeDasharray="2 2"
                          strokeWidth="1"
                        />
                        <circle
                          cx={hoveredPoint.x}
                          cy={hoveredPoint.y}
                          r="4.5"
                          fill={cohortColor}
                          stroke="#141820"
                          strokeWidth="2"
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <line stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="4 4" strokeWidth="1.5" x1="30" x2="750" y1="70" y2="70" />
                    <text fill="#6B7280" fontFamily="JetBrains Mono" fontSize="11" textAnchor="middle" x="390" y="74">
                      Awaiting live student attention telemetry...
                    </text>
                  </>
                )}
              </svg>

              {/* Hover Tooltip Overlay */}
              {hoveredPoint && hoveredPoint.raw && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(Math.max(10, hoveredPoint.clientX - 90), 580),
                    top: Math.max(6, hoveredPoint.clientY - 85),
                    pointerEvents: 'none',
                    background: 'rgba(20, 24, 32, 0.95)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    zIndex: 20,
                    fontFamily: 'var(--telemetry-font-mono)',
                    fontSize: '0.72rem',
                    color: '#e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
                    <span style={{ color: '#94a3b8' }}>
                      {new Date(hoveredPoint.raw.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ fontWeight: 700, color: hoveredPoint.raw.avg >= 70 ? '#4edea3' : hoveredPoint.raw.avg >= 50 ? '#ffb95f' : '#ffb4ab' }}>
                      {hoveredPoint.raw.avg}% Avg
                    </span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.65rem' }}>
                    {hoveredPoint.raw.count} active student{hoveredPoint.raw.count === 1 ? '' : 's'}
                    {hoveredPoint.raw.students && hoveredPoint.raw.students.length > 0 && (
                      <div style={{ marginTop: 3, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 3 }}>
                        {hoveredPoint.raw.students.map((st) => (
                          <div key={st.roll} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ color: '#cbd5e1' }}>{st.name || st.roll}:</span>
                            <span style={{ fontWeight: 600, color: st.attention >= 70 ? '#4edea3' : st.attention >= 50 ? '#ffb95f' : '#ffb4ab' }}>
                              {st.attention}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Time Ticks */}
              <div className="telemetry-time-ticks">
                {pulseData.timeTicks.map((tick, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: idx === pulseData.timeTicks.length - 1 && displayList.length > 0 ? 'var(--telemetry-primary)' : 'var(--telemetry-outline)',
                      fontWeight: idx === pulseData.timeTicks.length - 1 ? 600 : 400,
                    }}
                  >
                    {tick}
                  </span>
                ))}
              </div>
            </div>

            <div className="telemetry-pulse-footer">
              <div className="telemetry-pulse-stats-row">
                <div className="metric">
                  <span className="metric-label">Active Trackers:</span>
                  <span className="metric-val-emerald">{displayList.length}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--telemetry-outline)' }}>Live</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Class Attention:</span>
                  <span className="metric-val-amber">{displayList.length > 0 ? `${pulseFocusIndex}%` : '--'}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--telemetry-outline)' }}>Average</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Nominal Focus:</span>
                  <span className="metric-val-emerald">{nominalCount}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--telemetry-outline)' }}>&gt;70%</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Attention Alerts:</span>
                  <span className="metric-val-amber" style={{ color: driftCount + criticalCount > 0 ? 'var(--telemetry-error)' : 'var(--telemetry-outline)' }}>
                    {driftCount + criticalCount}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--telemetry-outline)' }}>Active</span>
                </div>
              </div>

              <div className="telemetry-pulse-legend">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="telemetry-legend-bar emerald" /> Nominal Flow (&gt;75%)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="telemetry-legend-bar amber" /> Drift Alert (&lt;50%)
                </span>
                {displayList.length > 1 ? (
                  <span style={{ color: 'var(--telemetry-outline)', fontSize: '0.68rem', marginLeft: 8 }}>
                    • Individual student traces dashed
                  </span>
                ) : displayList.length === 1 ? (
                  <span style={{ color: 'var(--telemetry-outline)', fontSize: '0.68rem', marginLeft: 8 }}>
                    • Student: {displayList[0].name} ({pulseFocusIndex}%)
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {/* ── Observation Matrix: Card Grid vs Compact Table ── */}
          {displayMode === 'cards' ? (
            <div className="telemetry-student-grid">
              {filteredDisplayList.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '3.5rem 1.5rem',
                  textAlign: 'center',
                  background: 'var(--telemetry-surface)',
                  border: '1px solid var(--telemetry-outline-subtle)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.85rem',
                }}>
                  <div style={{
                    width: 54,
                    height: 54,
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--telemetry-outline)'
                  }}>
                    <Users size={28} />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--telemetry-on-surface)', margin: 0 }}>
                    Awaiting Student Connections
                  </h3>
                  <p style={{ maxWidth: 480, fontSize: '0.85rem', color: 'var(--telemetry-outline)', lineHeight: 1.5, margin: 0 }}>
                    No active student trackers are connected to room <strong style={{ color: 'var(--telemetry-primary)' }}>{classCode || 'CLASS'}</strong>.
                    Launch the <strong>Visoria Electron Tracker</strong> and click "Start Tracking" to stream live attention metrics.
                  </p>
                </div>
              ) : (
                filteredDisplayList.map((s) => (
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
                  onRunAction={(studentObj, action) => {
                    if (action === 'socratic_nudge' || action === 'deconstruct') {
                      setShowTeacherPanel(true);
                      setQuestion(`Let's re-examine ${studentObj.current_task || 'the algorithm'} step by step.`);
                    } else {
                      handleRunAction(studentObj, action);
                    }
                  }}
                />
              )))
            }
            </div>
          ) : (
            <div className="telemetry-table-card">
              <table className="telemetry-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Focus Score</th>
                    <th>Status Vector</th>
                    <th>Current Execution Module</th>
                    <th style={{ textAlign: 'right' }}>Intervention Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDisplayList.map((s) => {
                    const isCrit = s.attention < 50;
                    const isDr = s.attention < 75 && !isCrit;
                    return (
                      <tr
                        key={s.roll_number || s.name}
                        onClick={() => setSelectedStudent(s)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ fontFamily: 'var(--telemetry-font-mono)' }}>
                          <span style={{ color: isCrit ? 'var(--telemetry-error)' : isDr ? 'var(--telemetry-tertiary)' : 'var(--telemetry-primary)', fontWeight: 600 }}>
                            {s.attention}% {isCrit ? 'CRITICAL' : isDr ? 'DRIFT' : 'NOMINAL'}
                          </span>
                        </td>
                        <td>
                          <span
                            className="telemetry-status-chip"
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: isCrit ? 'rgba(255, 180, 171, 0.15)' : isDr ? 'rgba(255, 185, 95, 0.15)' : 'rgba(208, 188, 255, 0.15)',
                              color: isCrit ? 'var(--telemetry-error)' : isDr ? 'var(--telemetry-tertiary)' : 'var(--telemetry-secondary)',
                            }}
                          >
                            {s.status_label || (isCrit ? 'Comprehension < 50%' : isDr ? 'Unfocused' : 'Active Proof')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--telemetry-font-mono)', fontSize: '0.75rem', color: 'var(--telemetry-on-surface-variant)' }}>
                          {s.current_task || 'General Comprehension Module'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="telemetry-card-action-btn violet"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowTeacherPanel(true);
                            }}
                          >
                            {isCrit ? 'Deconstruct' : 'Socratic Nudge'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Live Telemetry Alerts & Socratic Interventions Feed (~32%) */}
        <div className="telemetry-intelligence-col">
          {/* Cohort Overview Card */}
          <div className="telemetry-overview-card">
            <div className="telemetry-overview-header">
              <div className="telemetry-overview-header-left">
                <BarChart3 size={16} color="var(--telemetry-primary)" />
                <h3>Cohort Overview</h3>
              </div>
              <span className="telemetry-sync-badge">
                {wsStatus === 'connected' ? '94.2% Sync' : 'Live Stream'}
              </span>
            </div>

            <div className="telemetry-tri-metrics">
              <div className="telemetry-tri-metric-box">
                <div className="metric-title">Median Focus</div>
                <div className="metric-number emerald">84%</div>
              </div>
              <div className="telemetry-tri-metric-box">
                <div className="metric-title">Resolution</div>
                <div className="metric-number violet">92%</div>
              </div>
              <div className="telemetry-tri-metric-box">
                <div className="metric-title">Drift Latency</div>
                <div className="metric-number amber">1m 45s</div>
              </div>
            </div>

            <div className="telemetry-distribution-box">
              <div className="telemetry-dist-header">
                <span className="label">Distribution</span>
                <span className="counts">
                  {nominalCount} nominal • {driftCount} drift • {criticalCount} critical
                </span>
              </div>
              <div className="telemetry-segmented-bar">
                <div
                  className="seg-emerald"
                  style={{ width: `${Math.round((nominalCount / totalCount) * 100)}%` }}
                  title={`${nominalCount} Nominal`}
                />
                <div
                  className="seg-amber"
                  style={{ width: `${Math.round((driftCount / totalCount) * 100)}%` }}
                  title={`${driftCount} Drift`}
                />
                <div
                  className="seg-error"
                  style={{ width: `${Math.round((criticalCount / totalCount) * 100)}%` }}
                  title={`${criticalCount} Critical`}
                />
              </div>
            </div>
          </div>

          {/* Priority Interventions Card */}
          <div className="telemetry-interventions-card">
            <div className="telemetry-interventions-header">
              <div className="telemetry-interventions-title-wrap">
                <Bell size={16} color="var(--telemetry-tertiary)" />
                <h3>Priority Interventions</h3>
              </div>
              <span className="telemetry-active-badge">
                {priorityInterventionsList.length} Active
              </span>
            </div>

            <div className="telemetry-interventions-feed">
              {priorityInterventionsList.length === 0 ? (
                <div style={{
                  padding: '2.5rem 1rem',
                  textAlign: 'center',
                  color: 'var(--telemetry-outline)',
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <CheckCircle2 size={24} color="var(--telemetry-primary)" style={{ opacity: 0.8 }} />
                  <span>No active intervention alerts</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--telemetry-outline-subtle)' }}>
                    Active students are currently maintaining nominal attention.
                  </span>
                </div>
              ) : (
                priorityInterventionsList.map((item) => (
                <div
                  key={item.id}
                  className={`telemetry-alert-item ${item.severity === 'critical' ? 'critical' : ''}`}
                >
                  <div className="telemetry-alert-header">
                    <div className="telemetry-alert-student">
                      <span>{item.studentName}</span>
                      <span className={`telemetry-alert-badge ${item.severity}`}>
                        {item.severity}
                      </span>
                    </div>
                    <span className="telemetry-alert-time">{item.timeAgo}</span>
                  </div>

                  <div className="telemetry-alert-desc">
                    {item.description}
                  </div>

                  <div className="telemetry-alert-action-row">
                    <button
                      type="button"
                      className={`telemetry-intervention-btn ${item.actionType === 'ping' ? 'btn-dark-amber' : ''}`}
                      onClick={() => {
                        setShowTeacherPanel(true);
                        setQuestion(`Intervention for ${item.studentName}: ${item.description}`);
                      }}
                    >
                      {item.actionType === 'deconstruct' && <BookOpen size={13} />}
                      {item.actionType === 'nudge' && <Brain size={13} />}
                      {item.actionType === 'ping' && <MessageSquare size={13} />}
                      <span>{item.actionLabel}</span>
                    </button>
                  </div>
                </div>
              )))
            }
            </div>

            <div className="telemetry-interventions-footer">
              <span className="telemetry-stream-active">
                <span className="dot" />
                Stream Active
              </span>
              <span
                className="telemetry-audit-link"
                onClick={() => onViewStudentHistory?.('all')}
              >
                View Full Audit Log
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Student detail modal */}
      {selectedStudent && (
        <StudentDetailModal
          student={selectedStudent}
          classCode={classCode}
          attentionThreshold={attentionThreshold}
          sessionTimeline={sessionTimelines[selectedStudent.roll_number] || []}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* Socratic UI modals */}
      {classSession?.sustained_low_attention && (
        <SocraticBanner
          classCode={classCode}
          onStart={(id) => {
            setSocraticSessionId(id);
            setShowTeacherPanel(true);
          }}
        />
      )}
      {showTeacherPanel && (
        <SocraticTeacherPanel
          sessionId={socraticSessionId}
          onClose={() => setShowTeacherPanel(false)}
          question={question}
          setQuestion={setQuestion}
          answers={answers}
          setAnswers={setAnswers}
        />
      )}
      {showStudentPanel && (
        <SocraticPanel
          sessionId={socraticSessionId}
          question={question}
          onClose={() => setShowStudentPanel(false)}
          answers={answers}
          setAnswers={setAnswers}
        />
      )}
    </div>
  );
}
