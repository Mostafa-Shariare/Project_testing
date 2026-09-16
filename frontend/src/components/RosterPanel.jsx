import { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  Upload,
  Trash2,
  Users,
  Search,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch, getToken } from '../api';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function RosterPanel({ classCode = 'CS233' }) {
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
      setRoster(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [classCode]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!roll.trim() || !name.trim()) return;
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/roster`, {
        method: 'POST',
        body: JSON.stringify({ roll_number: roll.trim(), name: name.trim() }),
      });
      setRoll('');
      setName('');
      setImportMsg(`Added student ${name.trim()} (${roll.trim()})`);
      setTimeout(() => setImportMsg(''), 3000);
      load();
    } catch (err) {
      setError(err.message || 'Failed to add student');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleDelete = async (rollNumber, studentName) => {
    if (!confirm(`Remove ${studentName || rollNumber} from ${classCode} roster?`)) return;
    try {
      await apiFetch(
        `/api/classes/${encodeURIComponent(classCode)}/roster/${encodeURIComponent(rollNumber)}`,
        { method: 'DELETE' },
      );
      setImportMsg(`Removed student ${rollNumber}`);
      setTimeout(() => setImportMsg(''), 3000);
      load();
    } catch (err) {
      setError(err.message || 'Failed to delete student');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    setError('');
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
      setImportMsg(`Imported ${data.imported || 0} students from ${data.filename || file.name}`);
      setTimeout(() => setImportMsg(''), 4000);
      load();
    } catch (err) {
      setError(err.message || 'Failed to import CSV');
      setTimeout(() => setError(''), 4000);
    }
    e.target.value = '';
  };

  const filtered = roster.filter(
    (s) =>
      (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.roll_number || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="telemetry-roster-wrapper">
      {/* Notifications */}
      {importMsg && (
        <div style={{
          background: 'rgba(78, 222, 163, 0.12)',
          border: '1px solid rgba(78, 222, 163, 0.3)',
          borderRadius: 6,
          color: '#4edea3',
          padding: '0.6rem 1rem',
          fontSize: '0.8125rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <CheckCircle2 size={16} />
          <span>{importMsg}</span>
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 6,
          color: '#ffb4ab',
          padding: '0.6rem 1rem',
          fontSize: '0.8125rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="telemetry-roster-header">
        <div className="telemetry-roster-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 className="telemetry-roster-title">Class Roster</h1>
            <span className="telemetry-roster-badge">{classCode}</span>
          </div>
          <p className="telemetry-roster-subtitle">
            Manage enrolled students, assign identifiers, and import classroom datasets for course <strong>{classCode}</strong>.
          </p>
        </div>

        <div className="telemetry-roster-count-pill">
          <Users size={15} />
          <span>{roster.length} {roster.length === 1 ? 'Student' : 'Students'} Enrolled</span>
        </div>
      </div>

      {/* 2-Column Grid Layout */}
      <div className="telemetry-roster-grid">
        {/* Left Column (5 cols): Add Student & Bulk Import */}
        <div className="telemetry-roster-card">
          <div className="telemetry-roster-card-header">
            <h2 className="telemetry-roster-card-title">
              <UserPlus size={18} style={{ color: '#d0bcff' }} />
              <span>Add Student</span>
            </h2>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
              Manual Entry
            </span>
          </div>

          <form className="telemetry-roster-form" onSubmit={handleAdd}>
            <div className="telemetry-roster-field">
              <label className="telemetry-roster-label">Roll Number / ID</label>
              <input
                placeholder="e.g. CS-001 or 12345"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                required
                className="telemetry-roster-input"
                style={{ fontFamily: 'JetBrains Mono' }}
              />
            </div>

            <div className="telemetry-roster-field">
              <label className="telemetry-roster-label">Full Name</label>
              <input
                placeholder="e.g. Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="telemetry-roster-input"
              />
            </div>

            <button type="submit" className="telemetry-roster-btn-add">
              <UserPlus size={16} />
              <span>Add Student to Class</span>
            </button>
          </form>

          <div className="telemetry-roster-divider" />

          {/* CSV Upload Dropzone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span className="telemetry-roster-label">Bulk Import via CSV:</span>
            <label className="telemetry-roster-csv-box">
              <FileSpreadsheet size={24} style={{ color: '#d0bcff' }} />
              <div>
                <span style={{ color: '#f9fafb', fontWeight: 600, fontSize: '0.85rem' }}>
                  Click to select CSV file
                </span>
              </div>
              <span style={{ color: '#9ca3af', fontSize: '0.72rem', fontFamily: 'JetBrains Mono' }}>
                Required headers: roll_number, name
              </span>
              <input type="file" accept=".csv,text/csv" onChange={handleCsv} hidden />
            </label>
          </div>
        </div>

        {/* Right Column (7 cols): Enrolled Student Directory */}
        <div className="telemetry-roster-card">
          <div className="telemetry-roster-card-header">
            <h2 className="telemetry-roster-card-title">
              <GraduationCap size={18} style={{ color: '#4edea3' }} />
              <span>Student Directory</span>
            </h2>

            {roster.length > 0 && (
              <div className="telemetry-roster-search-box">
                <Search size={14} className="telemetry-roster-search-icon" />
                <input
                  type="text"
                  placeholder="Search by name or roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="telemetry-roster-search-input"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              Loading classroom roster...
            </div>
          ) : roster.length === 0 ? (
            <div style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#9ca3af',
            }}>
              <Users size={40} strokeWidth={1.5} style={{ opacity: 0.4 }} />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f9fafb', margin: '0 0 0.25rem 0' }}>
                  No students in roster yet
                </h3>
                <p style={{ fontSize: '0.8125rem', margin: 0, maxWidth: 320 }}>
                  Add students using the form on the left or upload a roster CSV file.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
              No students match "{searchQuery}"
            </div>
          ) : (
            <div className="telemetry-roster-table-wrap">
              <table className="telemetry-roster-table">
                <thead>
                  <tr>
                    <th>Roll Number</th>
                    <th>Student Name</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.roll_number}>
                      <td className="telemetry-roster-roll">{s.roll_number}</td>
                      <td className="telemetry-roster-name">{s.name}</td>
                      <td>
                        <span className="telemetry-roster-status-enrolled">
                          ENROLLED
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="telemetry-roster-btn-del"
                          onClick={() => handleDelete(s.roll_number, s.name)}
                          title={`Remove ${s.name} from class`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
