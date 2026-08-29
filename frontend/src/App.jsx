import { useEffect, useState } from 'react';
import {
  Activity,
  Brain,
  Clock,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  UserPlus,
} from 'lucide-react';
import './App.css';
import { apiFetch, clearAuth, getActiveClass, getToken, getUsername } from './api';
import Login from './components/Login';
import Register from './components/Register';
import LiveMonitor from './components/LiveMonitor';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import ClassSelector from './components/ClassSelector';
import RosterPanel from './components/RosterPanel';
import ErrorBoundary from './components/ErrorBoundary';

const NAV = [
  { id: 'overview', label: 'Live Monitor', icon: LayoutDashboard },
  { id: 'history', label: 'History & Analytics', icon: Clock },
  { id: 'roster', label: 'Roster', icon: UserPlus },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [authView, setAuthView] = useState('login');
  const [tab, setTab] = useState('overview');
  const [username, setUsername] = useState(getUsername());
  const [activeClass, setActiveClass] = useState(getActiveClass());
  const [authError, setAuthError] = useState('');

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

  if (!authed) {
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
          />
        ) : (
          <Register onSwitchLogin={() => setAuthView('login')} />
        )}
      </>
    );
  }

  const currentNav = NAV.find((n) => n.id === tab);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/visoria-logo.jpeg" alt="Visoria" className="brand-logo-img" />
          <div>
            <strong>Visoria</strong>
            <span>Classroom Monitor</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{username.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{username}</strong>
              <span>Teacher</span>
            </div>
          </div>
          <button type="button" className="nav-item logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <Activity size={18} className="topbar-icon" />
            <div>
              <h1 className="topbar-title">{currentNav?.label || 'Dashboard'}</h1>
            </div>
          </div>
          <ClassSelector onClassChange={setActiveClass} compact />
        </header>

        <main className="main-content">
          <ErrorBoundary>
          {!activeClass ? (
            <div className="empty-state card">
              <Brain size={48} strokeWidth={1.5} className="empty-icon" />
              <h2>Select a class to begin</h2>
              <p>Choose a class from the dropdown above.</p>
            </div>
          ) : tab === 'overview' ? (
            <LiveMonitor
              classCode={activeClass}
              key={activeClass}
              onViewStudentHistory={(roll) => {
                setTab('history');
              }}
            />
          ) : tab === 'history' ? (
            <HistoryPanel classCode={activeClass} key={`hist-${activeClass}`} />
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
