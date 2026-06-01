import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken } from '../api';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function RosterPanel({ classCode }) {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const load = useCallback(async () => {
    if (!classCode) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/roster`);
      setRoster(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [classCode]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/roster`, {
        method: 'POST',
        body: JSON.stringify({ roll_number: roll, name }),
      });
      setRoll('');
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (rollNumber) => {
    if (!confirm(`Remove ${rollNumber} from roster?`)) return;
    try {
      await apiFetch(
        `/api/classes/${encodeURIComponent(classCode)}/roster/${encodeURIComponent(rollNumber)}`,
        { method: 'DELETE' },
      );
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    const form = new FormData();
    form.append('file', file);
    const token = getToken();
    try {
      const res = await fetch(
        `${API_BASE}/api/classes/${encodeURIComponent(classCode)}/roster/import-csv`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      setImportMsg(`Imported ${data.imported} students from ${data.filename}`);
      load();
    } catch (err) {
      setError(err.message);
    }
    e.target.value = '';
  };

  if (!classCode) {
    return (
      <div className="empty-class-prompt glass">
        <p>Select a class to manage its roster.</p>
      </div>
    );
  }

  return (
    <div className="roster-view">
      <div className="panel glass roster-form-panel">
        <div className="panel-header">
          <h2>Class Roster — {classCode}</h2>
          <span className="muted">{roster.length} students</span>
        </div>

        <form className="roster-add-form" onSubmit={handleAdd}>
          <input
            placeholder="Roll number"
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            required
          />
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Add student
          </button>
        </form>

        <div className="roster-import-row">
          <label className="btn btn-ghost btn-sm csv-upload-btn">
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={handleCsv} hidden />
          </label>
          <span className="muted csv-hint">Columns: roll_number, name</span>
        </div>
        {importMsg && <p className="import-success">{importMsg}</p>}
        {error && <p className="auth-error">{error}</p>}
      </div>

      <div className="panel glass roster-table-panel">
        {loading ? (
          <p className="muted roster-loading">Loading roster…</p>
        ) : roster.length === 0 ? (
          <p className="muted roster-loading">No students yet. Add manually or import a CSV.</p>
        ) : (
          <table className="history-table roster-table">
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.roll_number}>
                  <td className="mono">{s.roll_number}</td>
                  <td>{s.name}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => handleDelete(s.roll_number)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
