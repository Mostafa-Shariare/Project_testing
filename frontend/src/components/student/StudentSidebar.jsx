import {
  LayoutDashboard,
  BookOpen,
  Zap,
  TrendingUp,
  Sparkles,
  Bell,
  Settings,
  User,
  Sliders,
  X
} from 'lucide-react';

export default function StudentSidebar({
  activeTab,
  onSelectTab,
  rollNumber,
  onOpenProfile,
  unreadCount = 2,
  isMobileOpen = false,
  onCloseMobile
}) {
  const NAV_SECTIONS = [
    {
      title: 'Learning',
      items: [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'session', label: 'Active Sessions', icon: Zap, badge: 'LIVE' },
        { id: 'courses', label: 'My Courses', icon: BookOpen },
      ]
    },
    {
      title: 'Reflection & Analytics',
      items: [
        { id: 'insights', label: 'Focus Insights', icon: TrendingUp },
        { id: 'socratic', label: 'Socratic Activities', icon: Sparkles },
      ]
    },
    {
      title: 'Preferences',
      items: [
        { id: 'notifications', label: 'Notifications', icon: Bell, count: unreadCount },
        { id: 'profile', label: 'Settings', icon: Sliders },
      ]
    }
  ];

  const handleNavClick = (id) => {
    onSelectTab(id);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="calm-sidebar-overlay" onClick={onCloseMobile} />
      )}

      <aside className={`calm-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        {/* Brand Header */}
        <div className="calm-brand-area">
          <div className="calm-brand-icon">
            <img src="/visoria-logo.jpeg" alt="Visoria" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
          </div>
          <div className="calm-brand-text">
            <h1>Visoria</h1>
            <span>Student Desktop</span>
          </div>
          {isMobileOpen && (
            <button
              type="button"
              className="calm-icon-btn mobile-close-btn"
              onClick={onCloseMobile}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Structured Desktop Navigation Menu */}
        <nav className="calm-sidebar-nav">
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="calm-nav-section-title">{sec.title}</div>
              {sec.items.map(({ id, label, icon: Icon, badge, count }) => (
                <button
                  key={id}
                  type="button"
                  className={`calm-nav-item ${activeTab === id ? 'active' : ''}`}
                  onClick={() => handleNavClick(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {badge && <span className="calm-nav-badge">{badge}</span>}
                  {count > 0 && (
                    <span className="calm-nav-badge" style={{ background: 'var(--calm-amber)', color: '#0F1115' }}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Student Profile Quick Card at Bottom */}
        <div className="calm-sidebar-profile">
          <div className="calm-profile-card" onClick={onOpenProfile} title="Click to view profile settings">
            <div className="calm-avatar">
              {rollNumber ? rollNumber.slice(0, 2).toUpperCase() : 'ST'}
              <span className="calm-avatar-status" title="Active Focus Mode" />
            </div>
            <div className="calm-profile-info">
              <div className="calm-profile-name">{rollNumber || 'Student Roll'}</div>
              <div className="calm-profile-role">Focus Mode: Active</div>
            </div>
            <User size={15} style={{ color: 'var(--calm-text-secondary)', marginLeft: 'auto' }} />
          </div>
        </div>
      </aside>
    </>
  );
}
