import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch, getActiveClass, setActiveClass } from '../api';

export default function ClassSelector({ onClassChange, compact = false }) {
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
      } else if (list.length > 0) {
        setSelected(list[0].class_code);
        setActiveClass(list[0].class_code);
        onClassChange?.(list[0].class_code);
      } else {
        setSelected('');
        onClassChange?.('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onClassChange]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (code) => {
    setSelected(code);
    setActiveClass(code);
    onClassChange?.(code);
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

  if (loading) return <div className="class-bar muted">Loading classes…</div>;

  return (
    <div className={`class-bar ${compact ? 'compact' : 'card'}`} style={compact ? {} : { padding: 16, marginBottom: 16 }}>
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

      {lastJoinCode && !compact && (
        <p className="join-hint muted">
          Class created. Student join code: <strong>{lastJoinCode}</strong>
        </p>
      )}
    </div>
  );
}
