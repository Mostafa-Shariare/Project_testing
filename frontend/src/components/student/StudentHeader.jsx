import { Bell, SlidersHorizontal, ArrowRightLeft, Menu } from 'lucide-react';

export default function StudentHeader({
  rollNumber,
  classCode,
  onChangeClassCode,
  unreadCount = 2,
  onOpenNotifications,
  onOpenProfile,
  onToggleTeacherMode,
  onToggleMobileMenu
}) {
  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  return (
    <header className="calm-header">
      <div className="calm-header-left">
        {onToggleMobileMenu && (
          <button
            type="button"
            className="calm-icon-btn mobile-hamburger-btn"
            onClick={onToggleMobileMenu}
            title="Toggle Menu"
          >
            <Menu size={18} />
          </button>
        )}
        <div>
          <h1 className="calm-welcome-title">
            Welcome back, <span className="highlight-name">{rollNumber || 'Student'}</span> 👋
          </h1>
          <p className="calm-welcome-sub">
            {todayDateStr} • Ready for a calm & focused learning session?
          </p>
        </div>
      </div>

      <div className="calm-header-right">
        {/* Active Focus Pill */}
        <div className="calm-focus-pill">
          <span className="calm-pulse-dot" />
          <span>Calm Focus: Active</span>
        </div>

        {/* Class Code Switcher */}
        <div className="header-class-bar">
          <span className="class-bar-tag">Class:</span>
          <input
            type="text"
            value={classCode}
            onChange={(e) => onChangeClassCode(e.target.value.toUpperCase())}
            placeholder="e.g. CS101"
            className="class-bar-input"
          />
        </div>

        {/* Notifications Icon Button */}
        <button
          type="button"
          className="calm-icon-btn"
          onClick={onOpenNotifications}
          title="View Notifications & Reminders"
        >
          <Bell size={18} />
          {unreadCount > 0 && <span className="calm-unread-dot" />}
        </button>

        {/* Profile Settings Icon Button */}
        <button
          type="button"
          className="calm-icon-btn"
          onClick={onOpenProfile}
          title="Student Settings"
        >
          <SlidersHorizontal size={18} />
        </button>

        {/* Teacher Mode Switcher button (if applicable) */}
        {onToggleTeacherMode && (
          <button
            type="button"
            className="calm-btn calm-btn-ghost calm-btn-sm"
            onClick={onToggleTeacherMode}
            title="Switch view to Teacher Dashboard"
          >
            <ArrowRightLeft size={14} /> Teacher View
          </button>
        )}
      </div>
    </header>
  );
}
