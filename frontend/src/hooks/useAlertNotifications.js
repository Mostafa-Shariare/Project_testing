import { useCallback, useEffect, useRef, useState } from 'react';
import { isCriticalAlert, studentCardId } from '../utils/liveMonitorUtils';

const SOUND_KEY = 'attention_monitor_sound_alerts';
const BASE_TITLE = 'Attention Monitor';

function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio unavailable */
  }
}

export function useAlertNotifications({ classCode, activeStudents }) {
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [highlightRoll, setHighlightRoll] = useState(null);
  const notifyHistoryRef = useRef([]);
  const originalTitleRef = useRef(BASE_TITLE);

  const criticalCount = activeStudents.filter((s) => isCriticalAlert(s.alert)).length;

  useEffect(() => {
    originalTitleRef.current = classCode ? `${BASE_TITLE} — ${classCode}` : BASE_TITLE;
  }, [classCode]);

  useEffect(() => {
    const base = originalTitleRef.current;
    document.title = criticalCount > 0 ? `(${criticalCount}) ${base}` : base;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [criticalCount]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, soundEnabled ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [soundEnabled]);

  const scrollToStudent = useCallback((roll) => {
    const id = studentCardId(roll);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightRoll(roll);
      setTimeout(() => setHighlightRoll(null), 2500);
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    return result;
  }, []);

  const notifyCritical = useCallback(
    (student) => {
      const alertText = student.alert;
      if (!isCriticalAlert(alertText)) return;

      const key = `${student.roll_number}:${alertText}`;
      const now = Date.now();
      const hist = notifyHistoryRef.current;
      const idx = hist.findIndex((h) => h.key === key);
      if (idx !== -1 && now - hist[idx].time < 15000) return;
      if (idx !== -1) hist.splice(idx, 1);
      hist.push({ key, time: now });
      if (hist.length > 80) hist.shift();

      if (soundEnabled) playAlertTone();

      const pushEnabled = localStorage.getItem('attention_monitor_push_alerts') !== 'false';
      if (
        pushEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          const n = new Notification('Critical attention alert', {
            body: `${student.name} (${student.roll_number}): ${alertText}`,
            tag: key,
            requireInteraction: false,
          });
          n.onclick = () => {
            window.focus();
            scrollToStudent(student.roll_number);
            n.close();
          };
        } catch {
          /* notification failed */
        }
      }
    },
    [soundEnabled, scrollToStudent],
  );

  return {
    notifPermission,
    soundEnabled,
    setSoundEnabled,
    requestNotificationPermission,
    notifyCritical,
    scrollToStudent,
    highlightRoll,
    criticalCount,
  };
}
