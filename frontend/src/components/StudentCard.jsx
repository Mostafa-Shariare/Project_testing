import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { avatarInitials } from '../utils/attentionTheme';
import { isBelowThreshold, studentCardId } from '../utils/liveMonitorUtils';
import StudentCardMenu from './StudentCardMenu';

export default function StudentCard({
  student,
  highlighted = false,
  attentionThreshold = 50,
  sparkline = [],
  actionState = {},
  alertFlashing = false,
  onClick,
  onViewHistory,
  onRunAction,
}) {
  const cardRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);

  const isOffline = student.status === 'offline';
  const isPaused = student.status === 'paused' || student.is_paused;
  const score = student.attention ?? 0;
  const alert = student.alert || '';
  const isSocratic = student.socratic_state || student.in_socratic || (alert && alert.toLowerCase().includes('socratic'));
  const isCritical = !isOffline && (score < 50 || alert.toLowerCase().includes('critical') || alert.toLowerCase().includes('below threshold'));
  const isDrift = !isOffline && !isCritical && (score < 75 || alert.toLowerCase().includes('drift') || alert.toLowerCase().includes('unfocused') || alert.toLowerCase().includes('phone') || alert.toLowerCase().includes('tab switch') || alert.toLowerCase().includes('gaze'));
  const isNominal = !isOffline && !isCritical && !isDrift;

  // Status color scheme & styling
  let statusType = 'emerald';
  let statusLabel = student.status_label || 'Flow State';
  let avatarClass = '';
  let borderClass = '';

  if (isOffline) {
    statusType = 'offline';
    statusLabel = 'Disconnected';
  } else if (isCritical) {
    statusType = 'error';
    statusLabel = alert || 'Critical Alert';
    avatarClass = 'avatar-error';
    borderClass = 'border-error';
  } else if (isDrift) {
    statusType = 'amber';
    statusLabel = alert || 'Window Unfocused';
    avatarClass = 'avatar-drift';
  } else if (isSocratic) {
    statusType = 'violet';
    statusLabel = student.socratic_step ? `Socratic Step ${student.socratic_step}` : 'In Socratic Dialogue';
  }

  // Radial Gauge Calculations
  const radius = 14;
  const circumference = 2 * Math.PI * radius; // ~88
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (circumference * clampedScore) / 100;
  const gaugeColor = isOffline ? '#86948a' : isCritical ? '#ffb4ab' : isDrift ? '#ffb95f' : '#4edea3';

  // Task / execution module title
  const currentTask = student.current_task || student.task || (isCritical ? 'Comprehension below 50%' : isDrift ? 'Dynamic Programming Knapsack' : 'Recursion Tree Trace & Proof');
  const taskHeader = isCritical ? 'Syntax Faults' : 'Current Task';

  const openMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ x: Math.min(rect.right - 200, window.innerWidth - 220), y: rect.top + 8 });
  };

  const handleMenuAction = async (actionDef, state) => {
    setMenuPos(null);
    if (actionDef.id === 'open_details') {
      onClick?.(student);
      return;
    }
    if (actionDef.id === 'view_history') {
      onViewHistory?.(student.roll_number);
      return;
    }
    let action = actionDef.id;
    if (actionDef.toggle === 'excused') {
      action = state.excused ? 'unexcused' : 'mark_excused';
    }
    if (actionDef.toggle === 'suppress') {
      action = state.suppressed ? 'unsuppress_alerts' : 'suppress_alerts';
    }
    await onRunAction?.(student, action);
  };

  const handleQuickAction = (e, label) => {
    e.stopPropagation();
    setActionFeedback('Dispatched');
    setTimeout(() => {
      setActionFeedback('In Flight');
      setTimeout(() => setActionFeedback(null), 1800);
    }, 600);
    onRunAction?.(student, label);
  };

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [menuPos]);

  return (
    <>
      <div
        ref={cardRef}
        id={studentCardId(student.roll_number)}
        role="button"
        tabIndex={0}
        className={`telemetry-card ${borderClass} ${highlighted ? 'card-highlight' : ''}`}
        onClick={() => onClick?.(student)}
        onContextMenu={openMenu}
        onKeyDown={(e) => e.key === 'Enter' && onClick?.(student)}
      >
        {/* Card Top: Identity + Status + Radial Gauge */}
        <div className="telemetry-card-top">
          <div className="telemetry-identity">
            <div className={`telemetry-avatar ${avatarClass}`}>
              {avatarInitials(student.name)}
            </div>
            <div className="telemetry-identity-meta">
              <div className="telemetry-student-name" title={student.name}>
                {student.name}
              </div>
              <span className={`telemetry-status-chip ${statusType}`}>
                <span className="dot" />
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="telemetry-gauge-wrap">
            <svg className="telemetry-gauge-svg" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke="#31353c"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke={gaugeColor}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={isOffline ? circumference : strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span className={`telemetry-gauge-val ${statusType}`}>
              {isOffline ? '—' : score}
            </span>
          </div>
        </div>

        {/* Card Middle: Current Task or Alert Fault */}
        <div className="telemetry-card-mid">
          <div className={`telemetry-task-header ${isCritical ? 'error' : ''}`}>
            {taskHeader}
          </div>
          <div className="telemetry-task-desc" title={currentTask}>
            {currentTask}
          </div>
        </div>

        {/* Card Bottom: Sync / Idle status + Action Button or Status Tag */}
        <div className="telemetry-card-bottom">
          <span className="telemetry-sync-time">
            {isOffline ? 'Offline' : student.last_synced || 'Synced 2s ago'}
          </span>

          {actionFeedback ? (
            <span className="telemetry-action-tag violet" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              ✓ {actionFeedback}
            </span>
          ) : isCritical ? (
            <button
              type="button"
              className="telemetry-card-action-btn violet"
              onClick={(e) => handleQuickAction(e, 'deconstruct')}
            >
              Deconstruct
            </button>
          ) : isDrift ? (
            <button
              type="button"
              className="telemetry-card-action-btn violet"
              onClick={(e) => handleQuickAction(e, 'socratic_nudge')}
            >
              Socratic Nudge
            </button>
          ) : isSocratic ? (
            <span className="telemetry-action-tag violet">Responding</span>
          ) : (
            <span className="telemetry-action-tag emerald">Nominal</span>
          )}
        </div>
      </div>

      {menuPos && (
        <StudentCardMenu
          student={student}
          state={actionState}
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onAction={handleMenuAction}
        />
      )}
    </>
  );
}

