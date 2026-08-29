import { useState } from 'react';
import { apiFetch, setAuth } from '../api';

export default function Login({ onSuccess, onSwitchRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuth(data.access_token, data.username);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card card">
        <img src="/visoria-logo.jpeg" alt="Visoria" className="auth-logo-img" />
        <h1>Visoria</h1>
        <p className="auth-sub">AI-powered classroom attention monitoring</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="auth-switch">
          New teacher?{' '}
          <button type="button" className="link-btn" onClick={onSwitchRegister}>
            Create account
          </button>
        </p>
      </div>
    </div>
  );
}
