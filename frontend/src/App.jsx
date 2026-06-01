import { useEffect, useState } from 'react';
import './App.css';
import { apiFetch, clearAuth, getActiveClass, getToken, getUsername } from './api';
import Login from './components/Login';
import Register from './components/Register';
import LiveMonitor from './components/LiveMonitor';
import HistoryPanel from './components/HistoryPanel';
import ClassSelector from './components/ClassSelector';
import RosterPanel from './components/RosterPanel';

function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [authView, setAuthView] = useState('login');
  const [tab, setTab] = useState('live');
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

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <div className="logo-icon">🎓</div>
          <div className="logo-text">
            <h1>Attention Monitor</h1>
            <span>Teacher Portal · {username}</span>
          </div>
        </div>
        <nav className="header-tabs">
          <button
            type="button"
            className={`tab-btn ${tab === 'live' ? 'active' : ''}`}
            onClick={() => setTab('live')}
          >
            Live Monitor
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'roster' ? 'active' : ''}`}
            onClick={() => setTab('roster')}
          >
            Roster
          </button>
        </nav>
        <div className="header-controls">
          <button type="button" className="btn btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <ClassSelector onClassChange={setActiveClass} />

      <main className="app-main">
        {!activeClass ? (
          <div className="empty-class-prompt glass">
            <p>Create or select a class above to start monitoring students.</p>
          </div>
        ) : tab === 'live' ? (
          <LiveMonitor classCode={activeClass} key={activeClass} />
        ) : tab === 'history' ? (
          <HistoryPanel classCode={activeClass} key={`hist-${activeClass}`} />
        ) : (
          <RosterPanel classCode={activeClass} key={`roster-${activeClass}`} />
        )}
      </main>
    </div>
  );
}

export default App;
