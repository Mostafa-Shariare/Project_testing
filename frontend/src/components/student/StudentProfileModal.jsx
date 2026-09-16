import { useState } from 'react';
import { X, User, Save, Sparkles } from 'lucide-react';

export default function StudentProfileModal({ isOpen, onClose, rollNumber, setRollNumber, classCode, setClassCode }) {
  const [tempRoll, setTempRoll] = useState(rollNumber || 'STUDENT-01');
  const [tempClass, setTempClass] = useState(classCode || 'CS101');
  const [weeklyGoal, setWeeklyGoal] = useState('5');
  const [savedMsg, setSavedMsg] = useState('');

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    setRollNumber(tempRoll.trim() || 'STUDENT-01');
    setClassCode(tempClass.trim().toUpperCase() || 'CS101');
    setSavedMsg('Profile settings saved successfully!');
    setTimeout(() => {
      setSavedMsg('');
      onClose();
    }, 1200);
  };

  return (
    <div className="calm-modal-backdrop calm-fade-in" onClick={onClose}>
      <div className="calm-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="calm-card-icon icon-violet">
              <User size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--calm-text-primary)', margin: 0 }}>
                Student Profile & Settings
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--calm-text-secondary)' }}>Personalize your roll ID and study targets</span>
            </div>
          </div>

          <button type="button" className="calm-icon-btn" onClick={onClose} style={{ width: 34, height: 34 }}>
            <X size={16} />
          </button>
        </div>

        {savedMsg && (
          <div style={{ background: 'var(--calm-mint-light)', border: '1px solid var(--calm-mint-border)', color: 'var(--calm-mint)', padding: '0.65rem 0.85rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
            {savedMsg}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="calm-form-label">Student Roll Number / ID:</label>
            <input
              type="text"
              className="calm-textarea"
              style={{ padding: '0.65rem 0.85rem' }}
              value={tempRoll}
              onChange={(e) => setTempRoll(e.target.value)}
              placeholder="e.g. STUDENT-01 or CS-2024"
              required
            />
          </div>

          <div>
            <label className="calm-form-label">Primary Active Class Code:</label>
            <input
              type="text"
              className="calm-textarea"
              style={{ padding: '0.65rem 0.85rem', textTransform: 'uppercase' }}
              value={tempClass}
              onChange={(e) => setTempClass(e.target.value.toUpperCase())}
              placeholder="e.g. CS101"
              required
            />
          </div>

          <div>
            <label className="calm-form-label">Weekly Study Time Target (Hours):</label>
            <select
              className="calm-textarea"
              style={{ padding: '0.65rem 0.85rem' }}
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(e.target.value)}
            >
              <option value="3">3 Hours / week (Light)</option>
              <option value="5">5 Hours / week (Balanced — Recommended)</option>
              <option value="8">8 Hours / week (Intensive)</option>
              <option value="10">10+ Hours / week (Mastery)</option>
            </select>
          </div>

          <div style={{ background: 'var(--calm-surface-elevated)', border: '1px solid var(--calm-border)', padding: '0.85rem 1rem', borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Sparkles size={16} style={{ color: 'var(--calm-violet)', flexShrink: 0 }} />
            <div style={{ fontSize: '0.78rem', color: 'var(--calm-text-secondary)' }}>
              <strong style={{ color: 'var(--calm-text-primary)' }}>Visoria Dark Theme:</strong> Clean charcoal surfaces, high-contrast typography, and purposeful learning accents.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="calm-btn calm-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="calm-btn calm-btn-primary">
              <Save size={15} /> Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
