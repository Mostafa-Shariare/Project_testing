import { useEffect, useRef } from 'react';

const ACTIONS = [
  { id: 'mark_excused', label: 'Mark as Excused', toggle: 'excused' },
  { id: 'suppress_alerts', label: 'Suppress Alerts', toggle: 'suppress' },
  { id: 'view_history', label: 'View History' },
  { id: 'open_details', label: 'View Details' },
];

export default function StudentCardMenu({
  student,
  state,
  position,
  onClose,
  onAction,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  if (!position) return null;

  const excused = state?.excused;
  const suppressed = state?.suppress_alerts;

  return (
    <div
      ref={ref}
      className="student-card-menu"
      style={{ top: position.y, left: position.x }}
      role="menu"
    >
      <div className="menu-header">
        {student.name} <span className="muted">({student.roll_number})</span>
      </div>
      {ACTIONS.map((a) => {
        let label = a.label;
        if (a.toggle === 'excused' && excused) label = 'Remove Excused';
        if (a.toggle === 'suppress' && suppressed) label = 'Unsuppress Alerts';

        return (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            className={`menu-item ${a.critical ? 'menu-critical' : ''}`}
            onClick={() => onAction(a, { excused, suppressed })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
