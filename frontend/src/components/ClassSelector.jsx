import { useCallback, useEffect, useState } from 'react';
import { Plus, School } from 'lucide-react';
import { apiFetch, getActiveClass, setActiveClass } from '../api';

export default function ClassSelector({ onClassChange, onClassObjChange, compact = false }) {
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState(getActiveClass());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [lastJoinCode, setLastJoinCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch('/api/classes');
      setClasses(list);
      const stored = getActiveClass();
      if (stored && list.some((c) => c.class_code === stored)) {
        setSelected(stored);
        onClassChange?.(stored);
        const obj = list.find((c) => c.class_code === stored);
        onClassObjChange?.(obj);
      } else if (list.length > 0) {
        setSelected(list[0].class_code);
        setActiveClass(list[0].class_code);
        onClassChange?.(list[0].class_code);
        onClassObjChange?.(list[0]);
      } else {
        setSelected('');
        onClassChange?.('');
        onClassObjChange?.(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onClassChange, onClassObjChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (code) => {
    setSelected(code);
    setActiveClass(code);
    onClassChange?.(code);
    const obj = classes.find((c) => c.class_code === code);
    onClassObjChange?.(obj);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          class_code: newCode,
          display_name: newName,
        }),
      });
      setLastJoinCode(data.join_code);
      setNewCode('');
      setNewName('');
      setShowCreate(false);
      await load();
      handleSelect(data.class_code);
    } catch (err) {
      setError(err.message);
    }
  };

  const activeClass = classes.find((c) => c.class_code === selected);

  if (loading) {
    return (
      <div className="telemetry-class-pill" style={{ opacity: 0.7 }}>
        <School size={16} color="var(--telemetry-primary)" />
        <span style={{ fontSize: '0.8rem', color: 'var(--telemetry-outline)' }}>Loading classes…</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="telemetry-class-wrap" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div className="telemetry-class-pill">
          <School size={16} color="var(--telemetry-primary)" style={{ flexShrink: 0 }} />
          <select
            value={selected}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={classes.length === 0}
            title="Active Operational Class"
          >
            {classes.length === 0 && <option value="">No classes yet</option>}
            {classes.map((c) => (
              <option key={c.class_code} value={c.class_code}>
                {c.class_code} — {c.display_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          title={showCreate ? 'Cancel' : 'Create new class'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'var(--telemetry-surface-container)',
            border: '1px solid var(--telemetry-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.35rem 0.6rem',
            color: 'var(--telemetry-on-surface-variant)',
            fontSize: '0.72rem',
            fontFamily: 'var(--telemetry-font-mono)',
            cursor: 'pointer',
          }}
        >
          <Plus size={13} />
          <span>{showCreate ? 'Cancel' : 'New'}</span>
        </button>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'var(--telemetry-surface-container)',
              border: '1px solid var(--telemetry-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.25rem 0.5rem',
            }}
          >
            <input
              placeholder="Code (e.g. CS233)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              required
              style={{
                background: 'var(--telemetry-surface-lowest)',
                border: '1px solid var(--telemetry-border)',
                color: 'var(--telemetry-on-surface)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.45rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--telemetry-font-mono)',
                width: '85px',
                outline: 'none',
              }}
            />
            <input
              placeholder="Display name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              style={{
                background: 'var(--telemetry-surface-lowest)',
                border: '1px solid var(--telemetry-border)',
                color: 'var(--telemetry-on-surface)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.45rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--telemetry-font-sans)',
                width: '110px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                background: 'var(--telemetry-primary)',
                color: 'var(--telemetry-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.55rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="class-bar card" style={{ padding: 16, marginBottom: 16 }}>
      <label className="class-bar-label">
        Class
        <select
          value={selected}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={classes.length === 0}
        >
          {classes.length === 0 && <option value="">No classes yet</option>}
          {classes.map((c) => (
            <option key={c.class_code} value={c.class_code}>
              {c.class_code} — {c.display_name}
            </option>
          ))}
        </select>
      </label>

      {activeClass && (
        <span className="join-code-pill" title="Share with students">
          Join: <strong>{activeClass.join_code}</strong>
        </span>
      )}

      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate((v) => !v)}>
        <Plus size={14} />
        {showCreate ? 'Cancel' : 'New class'}
      </button>

      {error && <span className="class-error">{error}</span>}

      {showCreate && (
        <form className="create-class-form" onSubmit={handleCreate}>
          <input placeholder="Class code (e.g. CS201)" value={newCode} onChange={(e) => setNewCode(e.target.value)} required />
          <input placeholder="Display name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <button type="submit" className="btn btn-primary btn-sm">
            Create
          </button>
        </form>
      )}

      {lastJoinCode && (
        <p className="join-hint muted">
          Class created. Student join code: <strong>{lastJoinCode}</strong>
        </p>
      )}
    </div>
  );
}
