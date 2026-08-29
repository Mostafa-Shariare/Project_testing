import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Upload, Trash2, Users, Search, BookOpen } from 'lucide-react';
import { apiFetch, getToken } from '../api';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function RosterPanel({ classCode }) {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

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

  const filtered = roster.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!classCode) {
    return (
      <div className="empty-class-prompt glass">
        <p>Select a class to manage its roster.</p>
      </div>
    );
  }

  return (
    <div className="roster-view animate-in">
      <div className="page-header-section">
        <div className="page-header-text">
          <h1 className="page-heading">Class Roster</h1>
          <p className="page-heading-sub">Manage students for <strong>{classCode}</strong></p>
        </div>
        <div className="page-header-badge">
          <Users size={16} />
          <span>{roster.length} students</span>
        </div>
      </div>

      <div className="roster-layout">
        <div className="panel glass roster-form-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <UserPlus size={16} className="panel-title-icon" />
              <h2>Add Student</h2>
            </div>
          </div>

          <form className="roster-add-form-enhanced" onSubmit={handleAdd}>
            <div className="form-field-group">
              <label className="form-field-label">Roll Number</label>
              <input
                placeholder="e.g. CS-001"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Full Name</label>
              <input
                placeholder="e.g. Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="form-input"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm add-student-btn">
              <UserPlus size={15} />
              Add Student
            </button>
          </form>

          <div className="roster-divider" />

          <div className="csv-import-section">
            <label className="btn btn-ghost btn-sm csv-upload-btn">
              <Upload size={15} />
              Import from CSV
              <input type="file" accept=".csv,text/csv" onChange={handleCsv} hidden />
            </label>
            <span className="muted csv-hint">Required columns: roll_number, name</span>
          </div>
          {importMsg && <p className="import-success-msg">{importMsg}</p>}
          {error && <p className="auth-error">{error}</p>}
        </div>

        <div className="panel glass roster-table-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <BookOpen size={16} className="panel-title-icon" />
              <h2>Student List</h2>
            </div>
            {roster.length > 0 && (
              <div className="roster-search-wrap">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="roster-search-input"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="roster-empty-state">
              <div className="spinner" />
              <p>Loading roster...</p>
            </div>
          ) : roster.length === 0 ? (
            <div className="roster-empty-state">
              <div className="roster-empty-icon">
                <Users size={40} strokeWidth={1.5} />
              </div>
              <h3>No students yet</h3>
              <p>Add students manually or import a CSV file to get started.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="roster-empty-state">
              <Search size={32} />
              <p>No students match "{searchQuery}"</p>
            </div>
          ) : (
            <table className="history-table roster-table enhanced-table">
              <thead>
                <tr>
                  <th className="col-roll">Roll</th>
                  <th className="col-name">Name</th>
                  <th className="col-action" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.roll_number} style={{ animationDelay: `${i * 25}ms` }}>
                    <td className="mono">{s.roll_number}</td>
                    <td className="student-name-cell">{s.name}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon-danger"
                        onClick={() => handleDelete(s.roll_number)}
                        title={`Remove ${s.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
