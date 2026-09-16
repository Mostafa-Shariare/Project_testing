export function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

export function formatDurationSec(sec) {
  if (sec == null || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function dateRangeToUnix(fromDateStr, toDateStr) {
  const params = {};
  if (fromDateStr) {
    params.from_date = Math.floor(new Date(fromDateStr).getTime() / 1000);
  }
  if (toDateStr) {
    const end = new Date(toDateStr);
    end.setHours(23, 59, 59, 999);
    params.to_date = Math.floor(end.getTime() / 1000);
  }
  return params;
}

export function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, String(v));
  });
  return q.toString();
}

export const FOCUS_BAND_LABELS = {
  high_focus: 'High Focus (≥70%)',
  moderate_drift: 'Moderate Drift (45-69%)',
  low_focus: 'Low Focus (<45%)',
  active: 'Active Session',
  offline: 'Completed',
};

export const FOCUS_BAND_CLASS = {
  high_focus: 'pill-good',
  moderate_drift: 'pill-warn',
  low_focus: 'pill-bad',
  active: 'pill-active',
  offline: 'pill-off',
};

// Backwards compatibility aliases
export const ATTENDANCE_LABELS = FOCUS_BAND_LABELS;
export const ATTENDANCE_CLASS = FOCUS_BAND_CLASS;
