import { useEffect, useState } from 'react';
import { formatDuration } from '../utils/liveMonitorUtils';

export default function SessionTimerBar({ classSession, serverTimestamp }) {
  const [now, setNow] = useState(Date.now() / 1000);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  const startTime = classSession?.start_time;
  const lastClassAlert = classSession?.last_alert_time;
  const elapsed = startTime ? Math.max(0, Math.floor(now - startTime)) : 0;
  const sinceClassAlert =
    lastClassAlert != null ? Math.max(0, Math.floor(now - lastClassAlert)) : null;

  const startedAt = startTime
    ? new Date(startTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="session-timer-bar glass">
      <div className="timer-block">
        <span className="timer-label">Live session</span>
        <span className="timer-value">{formatDuration(elapsed)}</span>
        <span className="timer-sub">Started {startedAt}</span>
      </div>
      <div className="timer-block">
        <span className="timer-label">Last class alert</span>
        <span className="timer-value">
          {sinceClassAlert != null ? `${formatDuration(sinceClassAlert)} ago` : 'None yet'}
        </span>
      </div>
      {serverTimestamp && (
        <div className="timer-block timer-sync">
          <span className="timer-label">Synced</span>
          <span className="timer-sub">
            {new Date(serverTimestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
      )}
    </div>
  );
}
