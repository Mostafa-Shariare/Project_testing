import { useState } from 'react';
import { Bell, AlertCircle, Zap, Check, ArrowRight } from 'lucide-react';

export default function NotificationsPanel({ onJoinSession }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([
    {
      id: 1,
      type: 'session',
      title: 'Socratic Session Live — CS101',
      message: 'Prof. Sarah Jenkins launched a live Socratic session for CS101: Data Structures.',
      time: '2 mins ago',
      amber: true,
      action: 'join'
    },
    {
      id: 2,
      type: 'reminder',
      title: 'Assignment Deadline Prompt',
      message: 'Linear Algebra Problem Set 4 is due today at 5:00 PM.',
      time: '1 hour ago',
      amber: true,
      action: 'view'
    },
    {
      id: 3,
      type: 'insight',
      title: 'Weekly Focus Goal Completed!',
      message: 'You have achieved 84% of your weekly 5-hour study target with 85% avg focus.',
      time: 'Yesterday',
      amber: false,
      action: null
    }
  ]);

  const handleDismiss = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'reminders') return item.type === 'reminder';
    if (filter === 'sessions') return item.type === 'session';
    return true;
  });

  return (
    <div className="calm-card calm-fade-in">
      <div className="calm-card-header">
        <div className="calm-card-title-group">
          <div className="calm-card-icon icon-amber">
            <Bell size={18} />
          </div>
          <div>
            <h3 className="calm-card-title">Reminders & Attention Prompts</h3>
            <span className="calm-card-subtitle">{items.length} unread alerts and course reminders</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            className={`calm-btn calm-btn-sm ${filter === 'all' ? 'calm-btn-primary' : 'calm-btn-ghost'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`calm-btn calm-btn-sm ${filter === 'sessions' ? 'calm-btn-primary' : 'calm-btn-ghost'}`}
            onClick={() => setFilter('sessions')}
          >
            Sessions
          </button>
          <button
            type="button"
            className={`calm-btn calm-btn-sm ${filter === 'reminders' ? 'calm-btn-primary' : 'calm-btn-ghost'}`}
            onClick={() => setFilter('reminders')}
          >
            Reminders
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--calm-text-secondary)', fontSize: '0.88rem' }}>
            No alerts or reminders right now. Enjoy your calm study session!
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="calm-alert-banner"
              style={{
                backgroundColor: 'var(--calm-surface-elevated)',
                borderColor: item.amber ? 'var(--calm-amber-border)' : 'var(--calm-mint-border)',
                margin: 0
              }}
            >
              <div
                className="calm-alert-icon"
                style={{ backgroundColor: item.amber ? 'var(--calm-amber)' : 'var(--calm-mint)' }}
              >
                {item.type === 'session' ? <Zap size={18} /> : <AlertCircle size={18} />}
              </div>

              <div className="calm-alert-content">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 className="calm-alert-title">{item.title}</h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--calm-text-tertiary)' }}>{item.time}</span>
                </div>
                <p className="calm-alert-desc">{item.message}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {item.action === 'join' && (
                  <button
                    type="button"
                    className="calm-btn calm-btn-amber calm-btn-sm"
                    onClick={() => onJoinSession && onJoinSession('CS101')}
                  >
                    Join Session <ArrowRight size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="calm-icon-btn"
                  style={{ width: 32, height: 32 }}
                  onClick={() => handleDismiss(item.id)}
                  title="Dismiss alert"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
