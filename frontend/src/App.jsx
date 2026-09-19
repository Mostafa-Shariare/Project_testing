import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Brain,
  Check,
  Clock,
  Copy,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Radio,
  ReceiptText,
  School,
  Settings,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react';
import './App.css';
import './styles/visoria-telemetry.css';
import { apiFetch, clearAuth, getActiveClass, getToken, getUsername } from './api';
import Login from './components/Login';
import Register from './components/Register';
import LiveMonitor from './components/LiveMonitor';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import ClassSelector from './components/ClassSelector';
import RosterPanel from './components/RosterPanel';
import SocraticSection from './components/SocraticSection';
import StudentApp from './components/StudentApp';
import ErrorBoundary from './components/ErrorBoundary';

const NAV = [
  { id: 'overview', label: 'Live Monitor', icon: LayoutDashboard, path: 'live-monitor' },
  { id: 'history', label: 'Analytics', icon: Clock, path: 'analytics' },
  { id: 'interventions', label: 'Activities', icon: Sparkles, path: 'activities' },
  { id: 'roster', label: 'Class Roster', icon: GraduationCap, path: 'roster' },
  { id: 'settings', label: 'Settings', icon: Sliders, path: 'settings' },
];

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('session_id');
  const urlJoinToken = urlParams.get('join_token');
  const urlMode = urlParams.get('mode');
  const urlClassCode = urlParams.get('class_code');
  const urlRollNumber = urlParams.get('roll');

  const [authed, setAuthed] = useState(!!getToken());
  const [authView, setAuthView] = useState('login');
  const [appMode, setAppMode] = useState(urlSessionId || urlMode === 'student' ? 'student' : 'teacher');
  const [tab, setTab] = useState('overview');
  const [username, setUsername] = useState(getUsername());
  const [activeClass, setActiveClass] = useState(getActiveClass());
  const [activeClassObj, setActiveClassObj] = useState(null);
  const [authError, setAuthError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [liveStats, setLiveStats] = useState({ syncRate: '--', engagement: '--', driftAlerts: 0 });

  const handleTelemetryUpdate = useCallback((stats) => {
    if (!stats) return;
    setLiveStats((prev) => {
      if (
        prev.syncRate === stats.syncRate &&
        prev.engagement === stats.engagement &&
        prev.driftAlerts === stats.driftAlerts
      ) {
        return prev;
      }
      return { ...prev, ...stats };
    });
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    apiFetch('/api/auth/me')
      .then((data) => {
        setAuthed(true);
        setUsername(data.username);
        setAuthError('');
      })
      .catch((err) => {
        clearAuth();
        setAuthed(false);
        setAuthError(err.status === 401 ? 'Session expired. Please sign in again.' : err.message);
      });
  }, []);

  const handleLogout = () => {
    clearAuth();
    setAuthed(false);
    setUsername('');
    setActiveClass('');
  };

  const handleCopyJoin = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!authed && appMode !== 'student' && !urlSessionId) {
    return (
      <>
        {authError && <p className="global-auth-error">{authError}</p>}
        {authView === 'login' ? (
          <Login
            onSuccess={() => {
              setAuthed(true);
              setUsername(getUsername());
            }}
            onSwitchRegister={() => setAuthView('register')}
            onEnterStudent={() => setAppMode('student')}
          />
        ) : (
          <Register onSwitchLogin={() => setAuthView('login')} />
        )}
      </>
    );
  }

  if (appMode === 'student' || urlSessionId) {
    return (
      <ErrorBoundary>
        <StudentApp
          initialClassCode={urlClassCode || activeClass || 'CS101'}
          initialRollNumber={urlRollNumber || 'STUDENT-01'}
          urlSessionId={urlSessionId}
          urlJoinToken={urlJoinToken}
          onToggleTeacherMode={() => setAppMode('teacher')}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="telemetry-shell">
      {/* ── Fixed Telemetry Topbar Header ── */}
      <header className="telemetry-header">
        <div className="telemetry-header-left">
          <div className="telemetry-brand">
            <img src="/visoria-logo.jpeg" alt="Visoria" className="telemetry-logo-img" />
            <span className="telemetry-pulse-beacon" />
            <span className="telemetry-brand-name">VISORIA</span>
            <span className="telemetry-badge-monitor">MONITOR</span>
          </div>

          <ClassSelector
            onClassChange={setActiveClass}
            onClassObjChange={setActiveClassObj}
            compact
          />

          {activeClassObj?.join_code && (
            <div className="telemetry-join-chip">
              <span>JOIN:</span>
              <strong>ROOM {activeClassObj.join_code}</strong>
              <button
                type="button"
                className="telemetry-join-copy-btn"
                onClick={() => handleCopyJoin(activeClassObj.join_code)}
                title="Copy Join Code"
              >
                {copiedCode ? <Check size={13} color="#4edea3" /> : <Copy size={13} />}
              </button>
            </div>
          )}

          <div className="telemetry-live-pill">
            <span className="dot" />
            <span>LIVE SESSION ACTIVE</span>
          </div>
        </div>

        <div className="telemetry-header-right">
          {/* TEACHER / STUDENT Mode Switcher */}
          <div className="telemetry-mode-segment">
            <button
              type="button"
              className={`telemetry-mode-btn ${appMode === 'teacher' ? 'active' : ''}`}
              onClick={() => setAppMode('teacher')}
            >
              TEACHER
            </button>
            <button
              type="button"
              className={`telemetry-mode-btn ${appMode === 'student' ? 'active' : ''}`}
              onClick={() => setAppMode('student')}
            >
              STUDENT
            </button>
          </div>

          <button
            type="button"
            className={`telemetry-icon-trigger ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
            title="System Settings"
          >
            <Sliders size={18} />
          </button>

          <div
            className="telemetry-user-avatar"
            title={`${username} (Teacher)`}
          >
            {(username || 'TE').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ── Fixed Operational Navigation Rail (Sidebar) ── */}
      <aside className="telemetry-sidebar">
        <div className="telemetry-sidebar-main">
          <div className="telemetry-sidebar-section">
            <span className="telemetry-section-label">Navigation</span>
            <nav className="telemetry-nav-list">
              {NAV.map(({ id, label, icon: Icon }) => {
                const isActive = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`telemetry-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={18} className="nav-icon" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="telemetry-sidebar-section">
            <span className="telemetry-section-label">Live Class Stats</span>
            <div className="telemetry-feed-box">
              <div className="telemetry-feed-row">
                <span className="feed-label">SYNC SPEED</span>
                <span className="feed-val-emerald">{liveStats.syncRate}</span>
              </div>
              <div className="telemetry-feed-row">
                <span className="feed-label">ATTENTION</span>
                <span className="feed-val-emerald">{liveStats.engagement}</span>
              </div>
              <div className="telemetry-feed-row">
                <span className="feed-label">FOCUS ALERTS</span>
                <span className="feed-val-amber">{liveStats.driftAlerts} ALERTS</span>
              </div>
            </div>
          </div>
        </div>

        <div className="telemetry-sidebar-footer">
          <span className="telemetry-version">
            <span className="dot" />
            v2.14.0-CORE
          </span>
          <button
            type="button"
            className="telemetry-logout-btn"
            onClick={handleLogout}
            title="Sign out"
          >
            <LogOut size={13} />
            Config / Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Viewport Content ── */}
      <div className="telemetry-main-wrap">
        <main className="telemetry-cockpit-content">
          <ErrorBoundary>
            {tab === 'history' ? (
              <HistoryPanel classCode={activeClass || 'CS233'} key={`hist-${activeClass || 'CS233'}`} />
            ) : !activeClass ? (
              <div className="telemetry-pulse-card" style={{ textAlign: 'center', padding: '3rem' }}>
                <Brain size={48} strokeWidth={1.5} color="#4edea3" style={{ margin: '0 auto 1rem auto' }} />
                <h2 style={{ color: '#dfe2eb', marginBottom: '0.5rem' }}>Select a class to begin</h2>
                <p style={{ color: '#bbcabf' }}>Choose an operational class module from the header dropdown above.</p>
              </div>
            ) : tab === 'overview' ? (
              <LiveMonitor
                classCode={activeClass}
                activeClassObj={activeClassObj}
                key={activeClass}
                onViewStudentHistory={(roll) => {
                  setTab('history');
                }}
                onOpenInterventions={() => {
                  setTab('interventions');
                }}
                onTelemetryUpdate={handleTelemetryUpdate}
              />
            ) : (tab === 'interventions' || tab === 'socratic' || tab === 'activities') ? (
              <SocraticSection classCode={activeClass || 'CS233'} key={`interventions-${activeClass || 'CS233'}`} />
            ) : tab === 'settings' ? (
              <SettingsPanel classCode={activeClass} key={`set-${activeClass}`} />
            ) : (
              <RosterPanel classCode={activeClass} key={`roster-${activeClass}`} />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

