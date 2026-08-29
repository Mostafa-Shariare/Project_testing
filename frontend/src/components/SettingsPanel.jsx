import { useCallback, useEffect, useState } from 'react';
import { Bell, Gauge, Save, Volume2, Globe, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api';

const SOUND_KEY = 'attention_monitor_sound_alerts';
const PUSH_KEY = 'attention_monitor_push_alerts';

export default function SettingsPanel({ classCode }) {
  const [threshold, setThreshold] = useState(50);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSoundAlerts(localStorage.getItem(SOUND_KEY) !== 'false');
    setPushAlerts(localStorage.getItem(PUSH_KEY) !== 'false');
  }, []);

  useEffect(() => {
    if (!classCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`);
        if (!cancelled) setThreshold(data.attention_threshold ?? 50);
      } catch {
        /* default */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classCode]);

  const saveThreshold = useCallback(
    async (value) => {
      if (!classCode) return;
      try {
        await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({ attention_threshold: value }),
        });
        setSaved('Threshold saved');
        setTimeout(() => setSaved(''), 2500);
      } catch {
        setSaved('Save failed');
      }
    },
    [classCode],
  );

  const handleThresholdChange = (e) => {
    const v = Number(e.target.value);
    setThreshold(v);
    clearTimeout(handleThresholdChange._t);
    handleThresholdChange._t = setTimeout(() => saveThreshold(v), 400);
  };

  const persistNotifications = () => {
    localStorage.setItem(SOUND_KEY, String(soundAlerts));
    localStorage.setItem(PUSH_KEY, String(pushAlerts));
    setSaved('Notification preferences saved');
    setTimeout(() => setSaved(''), 2500);
  };

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') return;
    await Notification.requestPermission();
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  const getThresholdColor = () => {
    if (threshold >= 70) return 'var(--success)';
    if (threshold >= 40) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className="settings-page animate-in">
      <div className="page-header-section">
        <div className="page-header-text">
          <h1 className="page-heading">Settings</h1>
          <p className="page-heading-sub">Configure monitoring thresholds and notification preferences.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card settings-card settings-card-enhanced">
          <div className="settings-card-top settings-card-top-blue">
            <div className="settings-card-icon-wrap">
              <Gauge size={22} />
            </div>
          </div>
          <div className="settings-card-body">
            <div className="card-header">
              <h2>Distraction Threshold</h2>
            </div>
            <p className="card-desc">
              Students below this attention score are flagged as distracted on the live dashboard.
            </p>

            <div className="threshold-display-enhanced">
              <div className="threshold-circle" style={{ '--threshold-color': getThresholdColor() }}>
                <span className="threshold-number">{threshold}</span>
                <span className="threshold-pct">%</span>
              </div>
            </div>

            <div className="threshold-slider-wrap">
              <div className="threshold-scale-labels">
                <span>Low</span>
                <span>High</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                onChange={handleThresholdChange}
                className="range-input range-input-enhanced"
              />
              <div className="threshold-scale-numbers">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="threshold-info-row">
              <ShieldCheck size={14} />
              <span>Saves automatically as you adjust</span>
            </div>
          </div>
        </section>

        <section className="card settings-card settings-card-enhanced">
          <div className="settings-card-top settings-card-top-orange">
            <div className="settings-card-icon-wrap settings-card-icon-orange">
              <Bell size={22} />
            </div>
          </div>
          <div className="settings-card-body">
            <div className="card-header">
              <h2>Notifications</h2>
            </div>
            <p className="card-desc">
              Control how you receive alerts when students need attention.
            </p>

            <div className="notification-toggles">
              <div className="notif-toggle-card">
                <div className="notif-toggle-info">
                  <Volume2 size={18} className="notif-icon" />
                  <div>
                    <strong>Sound Alerts</strong>
                    <span>Play a sound for critical attention drops</span>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => setSoundAlerts(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>

              <div className="notif-toggle-card">
                <div className="notif-toggle-info">
                  <Globe size={18} className="notif-icon" />
                  <div>
                    <strong>Browser Notifications</strong>
                    <span>Receive push notifications in your browser</span>
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={pushAlerts}
                    onChange={(e) => setPushAlerts(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>

            <div className="settings-actions-enhanced">
              <button type="button" className="btn btn-ghost btn-sm" onClick={requestPushPermission}>
                <Bell size={14} />
                Enable Browser Notifications
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={persistNotifications}>
                <Save size={14} />
                Save Preferences
              </button>
            </div>
          </div>
        </section>
      </div>

      {saved && (
        <div className="save-toast-enhanced">
          <ShieldCheck size={16} />
          {saved}
        </div>
      )}
    </div>
  );
}
