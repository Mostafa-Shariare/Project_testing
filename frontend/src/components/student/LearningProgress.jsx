import { Clock, Flame, CheckCircle2, TrendingUp } from 'lucide-react';

export default function LearningProgress() {
  const STATS = [
    {
      id: 'time',
      label: 'Weekly Study Target',
      value: '4.2 / 5.0 hrs',
      icon: Clock,
      colorClass: 'icon-mint',
      fillClass: 'fill-mint',
      progressPct: 84
    },
    {
      id: 'streak',
      label: 'Learning Streak',
      value: '7 Days',
      icon: Flame,
      colorClass: 'icon-amber',
      fillClass: 'fill-amber',
      progressPct: 100
    },
    {
      id: 'socratic',
      label: 'Socratic Inquiries',
      value: '18 / 20',
      icon: CheckCircle2,
      colorClass: 'icon-violet',
      fillClass: 'fill-violet',
      progressPct: 90
    },
    {
      id: 'score',
      label: 'Attention Stability',
      value: 'Consistent',
      icon: TrendingUp,
      colorClass: 'icon-mint',
      fillClass: 'fill-mint',
      progressPct: 85
    }
  ];

  return (
    <section className="calm-progress-grid">
      {STATS.map(({ id, label, value, icon: Icon, colorClass, fillClass, progressPct }) => (
        <div key={id} className="calm-stat-card">
          <div className="calm-stat-top">
            <span className="calm-stat-label">{label}</span>
            <div className={`calm-card-icon ${colorClass}`} style={{ width: 32, height: 32 }}>
              <Icon size={16} />
            </div>
          </div>
          <div className="calm-stat-value">
            {value}
          </div>
          <div className="calm-progress-bar-bg">
            <div
              className={`calm-progress-bar-fill ${fillClass}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

