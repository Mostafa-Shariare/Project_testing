import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Gauge,
  Save,
  Volume2,
  Globe,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sliders,
  HelpCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../api';

const SOUND_KEY = 'attention_monitor_sound_alerts';
const PUSH_KEY = 'attention_monitor_push_alerts';
const AUTO_SOCRATIC_KEY = 'attention_monitor_auto_socratic';
const SOCRATIC_TIMEOUT_KEY = 'attention_monitor_socratic_timeout';

// Helpful audio test tone generator
function playTestAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.09;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio unavailable */
  }
}

export default function SettingsPanel({ classCode = 'CS233' }) {
  const [threshold, setThreshold] = useState(50);
  const [sustainedLowAttentionSec, setSustainedLowAttentionSec] = useState(30);
  const [classAverageThreshold, setClassAverageThreshold] = useState(60);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [autoSocratic, setAutoSocratic] = useState(false);
  const [socraticTimeout, setSocraticTimeout] = useState(60);
  const [socraticMode, setSocraticMode] = useState('scaffolded');
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef(null);

  // Initialize client preferences from localStorage
  useEffect(() => {
    try {
      setSoundAlerts(localStorage.getItem(SOUND_KEY) !== 'false');
      setPushAlerts(localStorage.getItem(PUSH_KEY) !== 'false');
      setAutoSocratic(localStorage.getItem(AUTO_SOCRATIC_KEY) === 'true');
      const savedTimeout = localStorage.getItem(SOCRATIC_TIMEOUT_KEY);
      if (savedTimeout) setSocraticTimeout(Number(savedTimeout));
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch class settings from backend API
  useEffect(() => {
    if (!classCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`);
        if (!cancelled && data) {
          if (typeof data.attention_threshold === 'number') {
            setThreshold(data.attention_threshold);
          }
          if (typeof data.sustained_low_attention_sec === 'number') {
            setSustainedLowAttentionSec(data.sustained_low_attention_sec);
          }
          if (typeof data.class_average_threshold === 'number') {
            setClassAverageThreshold(data.class_average_threshold);
          }
          if (typeof data.auto_socratic === 'boolean') {
            setAutoSocratic(data.auto_socratic);
          }
          if (typeof data.socratic_timeout === 'number') {
            setSocraticTimeout(data.socratic_timeout);
          }
        }
      } catch {
        /* fallback to defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classCode]);

  const showToast = (msg, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3500);
    } else {
      setSavedMsg(msg);
      setTimeout(() => setSavedMsg(''), 3000);
    }
  };

  const saveClassSetting = useCallback(
    async (patch) => {
      if (!classCode) return;
      setSavingThreshold(true);
      try {
        await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        if ('attention_threshold' in patch) {
          showToast(`Attention threshold set to ${patch.attention_threshold}%`);
        } else if ('sustained_low_attention_sec' in patch) {
          showToast(`Sustained duration threshold set to ${patch.sustained_low_attention_sec}s`);
        } else if ('class_average_threshold' in patch) {
          showToast(`Class average threshold set to ${patch.class_average_threshold}%`);
        } else {
          showToast('Settings saved to live session');
        }
      } catch (err) {
        showToast('Failed to save settings to server', true);
      } finally {
        setSavingThreshold(false);
      }
    },
    [classCode]
  );

  const handleThresholdChange = (e) => {
    const v = Number(e.target.value);
    setThreshold(v);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveClassSetting({ attention_threshold: v });
    }, 450);
  };

  const handleSustainedChange = (e) => {
    const v = Number(e.target.value);
    setSustainedLowAttentionSec(v);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveClassSetting({ sustained_low_attention_sec: v });
    }, 450);
  };

  const handleClassAverageChange = (e) => {
    const v = Number(e.target.value);
    setClassAverageThreshold(v);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveClassSetting({ class_average_threshold: v });
    }, 450);
  };

  const persistNotifications = () => {
    try {
      localStorage.setItem(SOUND_KEY, String(soundAlerts));
      localStorage.setItem(PUSH_KEY, String(pushAlerts));
      showToast('Notification preferences saved');
    } catch {
      showToast('Error saving preferences', true);
    }
  };

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') {
      showToast('Browser notifications not supported', true);
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotifPermission(res);
      if (res === 'granted') {
        showToast('Browser notifications enabled!');
      } else {
        showToast(`Permission status: ${res}`, true);
      }
    } catch {
      showToast('Unable to request permission', true);
    }
  };

  const saveSocraticSettings = async () => {
    try {
      localStorage.setItem(AUTO_SOCRATIC_KEY, String(autoSocratic));
      localStorage.setItem(SOCRATIC_TIMEOUT_KEY, String(socraticTimeout));

      if (classCode) {
        await apiFetch(`/api/classes/${encodeURIComponent(classCode)}/settings`, {
          method: 'PATCH',
          body: JSON.stringify({
            auto_socratic: autoSocratic,
            socratic_timeout: socraticTimeout,
          }),
        });
      }
      showToast('Socratic intervention settings saved');
    } catch {
      showToast('Preferences saved locally (server sync failed)', true);
    }
  };

  // Determine dynamic visual priority for threshold
  const getThresholdColor = () => {
    if (threshold >= 70) return '#4edea3'; // emerald
    if (threshold >= 40) return '#ffb95f'; // amber
    return '#ffb4ab'; // coral / alert
  };

  const getThresholdGlow = () => {
    if (threshold >= 70) return 'rgba(78, 222, 163, 0.28)';
    if (threshold >= 40) return 'rgba(255, 185, 95, 0.28)';
    return 'rgba(255, 180, 171, 0.28)';
  };

  const getThresholdTag = () => {
    if (threshold >= 70) {
      return {
        label: 'Strict (High Attention Required)',
        bg: 'rgba(78, 222, 163, 0.12)',
        color: '#4edea3',
        border: 'rgba(78, 222, 163, 0.3)',
      };
    }
    if (threshold >= 40) {
      return {
        label: 'Balanced (Standard Classroom)',
        bg: 'rgba(255, 185, 95, 0.12)',
        color: '#ffb95f',
        border: 'rgba(255, 185, 95, 0.3)',
      };
    }
    return {
      label: 'Sensitive (Early Drift Warnings)',
      bg: 'rgba(255, 180, 171, 0.12)',
      color: '#ffb4ab',
      border: 'rgba(255, 180, 171, 0.3)',
    };
  };

  if (loading) {
    return (
      <div className="telemetry-settings-wrapper" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div className="telemetry-pulse-beacon" style={{ width: 18, height: 18 }} />
          <p style={{ color: '#9ca3af', fontFamily: 'var(--telemetry-font-mono)', fontSize: '0.85rem' }}>
            Loading System Settings for {classCode}...
          </p>
        </div>
      </div>
    );
  }

  const tagInfo = getThresholdTag();
  const currentColor = getThresholdColor();
  const currentGlow = getThresholdGlow();

  return (
    <div className="telemetry-settings-wrapper">
      {/* Header Bar */}
      <div className="telemetry-settings-header">
        <div className="telemetry-settings-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 className="telemetry-settings-title">
              <Sliders size={22} style={{ color: '#4edea3' }} />
              <span>System Settings</span>
            </h1>
            <span className="telemetry-settings-badge">Configuration</span>
          </div>
          <p className="telemetry-settings-subtitle">
            Configure live monitoring sensitivity, teacher alert channels, and Socratic intervention defaults.
          </p>
        </div>

        <div className="telemetry-settings-meta-pill">
          <span>Target Course:</span>
          <strong>{classCode}</strong>
        </div>
      </div>

      {/* 3-Column Settings Grid */}
      <div className="telemetry-settings-grid">
        {/* Card 1: Attention Drift Threshold */}
        <section className="telemetry-settings-card">
          <div className="telemetry-settings-card-header">
            <div className="telemetry-settings-icon-box emerald">
              <Gauge size={22} />
            </div>
            <div className="telemetry-settings-card-headings">
              <h2 className="telemetry-settings-card-title">Attention Drift Threshold</h2>
              <p className="telemetry-settings-card-desc">
                Defines the baseline attention score required before triggering drift alerts.
              </p>
            </div>
          </div>

          <div className="telemetry-settings-card-body">
            {/* Circular Gauge Display */}
            <div className="telemetry-threshold-gauge-wrap">
              <div
                className="telemetry-threshold-circle"
                style={{
                  '--threshold-color': currentColor,
                  '--threshold-glow': currentGlow,
                }}
              >
                <span className="telemetry-threshold-number">{threshold}</span>
                <span className="telemetry-threshold-unit">%</span>
              </div>
              <div
                className="telemetry-threshold-status-tag"
                style={{
                  '--status-tag-bg': tagInfo.bg,
                  '--status-tag-color': tagInfo.color,
                  '--status-tag-border': tagInfo.border,
                }}
              >
                {tagInfo.label}
              </div>
            </div>

            {/* Slider */}
            <div className="telemetry-slider-wrap">
              <div className="telemetry-slider-labels">
                <span>Sensitive (0%)</span>
                <span>Strict (100%)</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                onChange={handleThresholdChange}
                className="telemetry-range-input"
                style={{
                  '--threshold-color': currentColor,
                  '--threshold-glow': currentGlow,
                }}
              />
              <div className="telemetry-slider-ticks">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Sustained Low-Attention Duration Setting */}
            <div style={{
              marginTop: '0.75rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#f3f4f6', fontSize: '0.825rem', fontWeight: 600 }}>
                    Sustained Low-Attention Duration
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '2px' }}>
                    Continuous drift window required before triggering alerts & intervention eligibility.
                  </div>
                </div>
                <div style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: 'rgba(78, 222, 163, 0.12)',
                  border: '1px solid rgba(78, 222, 163, 0.3)',
                  color: '#4edea3',
                  fontFamily: 'var(--telemetry-font-mono)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  minWidth: '50px',
                  textAlign: 'center'
                }}>
                  {sustainedLowAttentionSec}s
                </div>
              </div>
              <div className="telemetry-slider-wrap">
                <div className="telemetry-slider-labels">
                  <span>Fast (10s)</span>
                  <span>Default (30s)</span>
                  <span>Extended (120s)</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={sustainedLowAttentionSec}
                  onChange={handleSustainedChange}
                  className="telemetry-range-input"
                  style={{
                    '--threshold-color': '#4edea3',
                    '--threshold-glow': 'rgba(78, 222, 163, 0.25)',
                  }}
                />
              </div>
            </div>

            {/* Class Average Attention Threshold Setting */}
            <div style={{
              marginTop: '0.4rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#f3f4f6', fontSize: '0.825rem', fontWeight: 600 }}>
                    Class Average Attention Threshold
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '2px' }}>
                    Minimum acceptable class average. Alerts teacher when smoothed class attention drops below this.
                  </div>
                </div>
                <div style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: 'rgba(255, 185, 95, 0.12)',
                  border: '1px solid rgba(255, 185, 95, 0.3)',
                  color: '#ffb95f',
                  fontFamily: 'var(--telemetry-font-mono)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  minWidth: '50px',
                  textAlign: 'center'
                }}>
                  {classAverageThreshold}%
                </div>
              </div>
              <div className="telemetry-slider-wrap">
                <div className="telemetry-slider-labels">
                  <span>Lenient (30%)</span>
                  <span>Default (60%)</span>
                  <span>Strict (85%)</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={85}
                  step={5}
                  value={classAverageThreshold}
                  onChange={handleClassAverageChange}
                  className="telemetry-range-input"
                  style={{
                    '--threshold-color': '#ffb95f',
                    '--threshold-glow': 'rgba(255, 185, 95, 0.25)',
                  }}
                />
              </div>
            </div>

            {/* Auto-save status note */}
            <div className="telemetry-status-note">
              <ShieldCheck size={15} style={{ color: savingThreshold ? '#ffb95f' : '#4edea3', flexShrink: 0 }} />
              <span>
                {savingThreshold
                  ? 'Saving changes to live session...'
                  : 'Saves automatically to live session as adjusted'}
              </span>
            </div>
          </div>
        </section>

        {/* Card 2: Notifications & Audio */}
        <section className="telemetry-settings-card">
          <div className="telemetry-settings-card-header">
            <div className="telemetry-settings-icon-box amber">
              <Bell size={22} />
            </div>
            <div className="telemetry-settings-card-headings">
              <h2 className="telemetry-settings-card-title">Notification Channels</h2>
              <p className="telemetry-settings-card-desc">
                Control alert mechanisms for critical student drift and disengagement events.
              </p>
            </div>
          </div>

          <div className="telemetry-settings-card-body">
            <div className="telemetry-toggle-group">
              {/* Sound Alerts */}
              <div className="telemetry-toggle-card">
                <div className="telemetry-toggle-info">
                  <div className="icon-wrap">
                    <Volume2 size={18} style={{ color: soundAlerts ? '#ffb95f' : '#86948a' }} />
                  </div>
                  <div className="telemetry-toggle-texts">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="telemetry-toggle-title">Sound Alerts</span>
                      <button
                        type="button"
                        className="telemetry-btn-tone-test"
                        onClick={playTestAlertTone}
                        title="Audition Alert Sound Tone"
                      >
                        <Play size={10} />
                        <span>Test</span>
                      </button>
                    </div>
                    <span className="telemetry-toggle-desc">Play synthesized chime on critical attention drops</span>
                  </div>
                </div>
                <label className="telemetry-switch">
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => setSoundAlerts(e.target.checked)}
                  />
                  <span className="telemetry-switch-track" />
                </label>
              </div>

              {/* Browser Push Notifications */}
              <div className="telemetry-toggle-card">
                <div className="telemetry-toggle-info">
                  <div className="icon-wrap">
                    <Globe size={18} style={{ color: pushAlerts ? '#4edea3' : '#86948a' }} />
                  </div>
                  <div className="telemetry-toggle-texts">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="telemetry-toggle-title">Browser Notifications</span>
                      <span className={`telemetry-notif-perm-badge ${notifPermission}`}>
                        {notifPermission === 'granted' ? 'Granted' : notifPermission === 'denied' ? 'Blocked' : 'Default'}
                      </span>
                    </div>
                    <span className="telemetry-toggle-desc">Receive system tray notifications while tab is unfocused</span>
                  </div>
                </div>
                <label className="telemetry-switch">
                  <input
                    type="checkbox"
                    checked={pushAlerts}
                    onChange={(e) => setPushAlerts(e.target.checked)}
                  />
                  <span className="telemetry-switch-track" />
                </label>
              </div>
            </div>

            {/* Permission Prompt Help Note */}
            {notifPermission !== 'granted' && (
              <div className="telemetry-status-note" style={{ borderColor: 'rgba(255, 185, 95, 0.2)' }}>
                <HelpCircle size={15} style={{ color: '#ffb95f', flexShrink: 0 }} />
                <span>
                  Push permission is required for notifications to appear when the window is in background.
                </span>
              </div>
            )}
          </div>

          <div className="telemetry-settings-actions">
            {notifPermission !== 'granted' && (
              <button
                type="button"
                className="telemetry-btn-secondary"
                onClick={requestPushPermission}
              >
                <Bell size={14} />
                <span>Grant Permission</span>
              </button>
            )}
            <button
              type="button"
              className="telemetry-btn-primary"
              onClick={persistNotifications}
            >
              <Save size={14} />
              <span>Save Preferences</span>
            </button>
          </div>
        </section>

        {/* Card 3: Socratic & Pedagogical Defaults */}
        <section className="telemetry-settings-card">
          <div className="telemetry-settings-card-header">
            <div className="telemetry-settings-icon-box purple">
              <Sparkles size={22} />
            </div>
            <div className="telemetry-settings-card-headings">
              <h2 className="telemetry-settings-card-title">Socratic & Intervention</h2>
              <p className="telemetry-settings-card-desc">
                Configure auto-prompt triggering heuristics and default student response timeouts.
              </p>
            </div>
          </div>

          <div className="telemetry-settings-card-body">
            <div className="telemetry-toggle-group">
              {/* Auto-Trigger Toggle */}
              <div className="telemetry-toggle-card">
                <div className="telemetry-toggle-info">
                  <div className="icon-wrap">
                    <Sparkles size={18} style={{ color: autoSocratic ? '#d0bcff' : '#86948a' }} />
                  </div>
                  <div className="telemetry-toggle-texts">
                    <span className="telemetry-toggle-title">Auto-Trigger Socratic Prompt</span>
                    <span className="telemetry-toggle-desc">
                      Suggest question check automatically when sustained drift exceeds {sustainedLowAttentionSec}s
                    </span>
                  </div>
                </div>
                <label className="telemetry-switch">
                  <input
                    type="checkbox"
                    checked={autoSocratic}
                    onChange={(e) => setAutoSocratic(e.target.checked)}
                  />
                  <span className="telemetry-switch-track violet" />
                </label>
              </div>

              {/* Response Timeout Select */}
              <div className="telemetry-field-group">
                <label className="telemetry-field-label">Default Question Response Timeout</label>
                <select
                  value={socraticTimeout}
                  onChange={(e) => setSocraticTimeout(Number(e.target.value))}
                  className="telemetry-select"
                >
                  <option value={30}>30 seconds (Rapid check)</option>
                  <option value={45}>45 seconds (Balanced)</option>
                  <option value={60}>60 seconds (Default Standard)</option>
                  <option value={90}>90 seconds (Extended Thinking)</option>
                  <option value={120}>120 seconds (2 Minutes Deep Dive)</option>
                </select>
              </div>

              {/* Intervention Strategy Select */}
              <div className="telemetry-field-group">
                <label className="telemetry-field-label">Default Pedagogical Strategy</label>
                <select
                  value={socraticMode}
                  onChange={(e) => setSocraticMode(e.target.value)}
                  className="telemetry-select"
                >
                  <option value="scaffolded">Socratic Inquiry (Scaffolded Questions)</option>
                  <option value="diagnostic">Conceptual Diagnostic (Quick Polling)</option>
                  <option value="reflection">Metacognitive Reflection & Breakout</option>
                </select>
              </div>
            </div>
          </div>

          <div className="telemetry-settings-actions">
            <button
              type="button"
              className="telemetry-btn-violet"
              onClick={saveSocraticSettings}
            >
              <Save size={14} />
              <span>Save Socratic Settings</span>
            </button>
          </div>
        </section>
      </div>

      {/* Floating Save / Toast Feedback */}
      {savedMsg && (
        <div className="telemetry-save-toast">
          <CheckCircle2 size={18} style={{ color: '#4edea3' }} />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="telemetry-save-toast" style={{ borderColor: '#ffb4ab', color: '#ffb4ab' }}>
          <AlertCircle size={18} style={{ color: '#ffb4ab' }} />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
