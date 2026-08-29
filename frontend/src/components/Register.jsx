import { useState } from 'react';
import { apiFetch } from '../api';

export default function Register({ onSwitchLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setSuccess('Account created! You can sign in now.');
      setTimeout(() => onSwitchLogin(), 1500);
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
        <h1>Create Account</h1>
        <p className="auth-sub">Register to access the attention monitoring dashboard</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </label>
          <label>
            Confirm Password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          {success && <p className="save-toast" style={{ position: 'static' }}>{success}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          Already registered?{' '}
          <button type="button" className="link-btn" onClick={onSwitchLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
