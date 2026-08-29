import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  avatarInitials,
  BAND_COLORS,
  getAttentionBand,
  getFocusLabel,
} from '../utils/attentionTheme';
import { isBelowThreshold, studentCardId } from '../utils/liveMonitorUtils';
import StudentSparkline from './StudentSparkline';
import StudentCardMenu from './StudentCardMenu';

function computeTrend(sparkline) {
  if (!sparkline || sparkline.length < 2) return 'flat';
  const a = sparkline[sparkline.length - 2];
  const b = sparkline[sparkline.length - 1];
  if (b > a + 2) return 'up';
  if (b < a - 2) return 'down';
  return 'flat';
}

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

  const isOffline = student.status === 'offline';
  const score = student.attention ?? 0;
  const band = isOffline ? 'offline' : getAttentionBand(score);
  const colors = BAND_COLORS[band];
  const alert = student.alert || '';
  const excused = actionState.excused;
  const suppressed = actionState.suppress_alerts;
  const belowThreshold = !isOffline && isBelowThreshold(student, attentionThreshold);

  const hasAlert =
    alert && alert !== 'LEFT SESSION' && alert !== 'DISCONNECTED' && !suppressed;

  const trend = computeTrend(sparkline);
  const trendSymbol = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';

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
        className={[
          'student-card',
          'student-card-clickable',
          `band-${band}`,
          highlighted ? 'card-highlight' : '',
          alertFlashing ? 'card-alert-flash' : '',
          excused ? 'card-excused' : '',
          belowThreshold ? 'card-below-threshold' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-roll={student.roll_number}
        onClick={() => onClick?.(student)}
        onContextMenu={openMenu}
        onKeyDown={(e) => e.key === 'Enter' && onClick?.(student)}
      >
        <div className="card-top">
          <div className="student-identity-row">
            <div
              className="student-avatar"
              style={{ background: colors.bg, color: colors.main, border: `2px solid ${colors.border}` }}
            >
              {avatarInitials(student.name)}
            </div>
            <div className="student-identity-text">
              <div className="student-name" title={student.name}>
                {student.name}
              </div>
              <div className="student-roll">
                {student.roll_number}
                {excused && <span className="excused-tag"> \u00b7 Excused</span>}
              </div>
            </div>
          </div>
          <div className="card-top-actions">
            <span className={`focus-badge ${band}`}>{getFocusLabel(score, isOffline)}</span>
            <button type="button" className="card-menu-btn" aria-label="Actions" onClick={openMenu}>
              <MoreVertical size={16} />
            </button>
          </div>
        </div>

        <div className="card-score-row">
          <div
            className="attention-ring"
            style={{
              background: `conic-gradient(${colors.main} ${isOffline ? '0%' : `${score}%`}, ${colors.bg} 0)`,
            }}
          >
            <div className="attention-ring-inner">
              {isOffline ? '\u2014' : `${score}%`}
            </div>
            {!isOffline && <span className={`attention-trend trend-${trend}`}>{trendSymbol}</span>}
          </div>
          <div className="sparkline-wrap">
            <div className="sparkline-label">Last {sparkline.length} readings</div>
            <StudentSparkline data={sparkline} width={120} height={32} color={colors.main} />
          </div>
        </div>

        {hasAlert && (
          <div className="card-alert-banner has-alert">
            <span className="alert-banner-dot" />
            {alert}
          </div>
        )}
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
