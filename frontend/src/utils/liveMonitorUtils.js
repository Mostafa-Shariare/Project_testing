/** Alert classification and list helpers for Live Monitor */

export const CRITICAL_ALERTS = ['PHONE DETECTED', 'NO FACE', 'EYES CLOSED'];

export function normalizeAlert(alert = '') {
  return String(alert).trim().toUpperCase();
}

export function isCriticalAlert(alert) {
  const a = normalizeAlert(alert);
  if (!a) return false;
  return (
    a.includes('PHONE') ||
    a.includes('NO FACE') ||
    a.includes('EYES CLOSED')
  );
}

export function matchesAlertFilter(student, filterId) {
  const alert = normalizeAlert(student.alert);
  switch (filterId) {
    case 'phone':
      return alert.includes('PHONE') || student.phone_detected;
    case 'no_face':
      return alert.includes('NO FACE');
    case 'eyes_closed':
      return alert.includes('EYES CLOSED');
    default:
      return true;
  }
}

export function isBelowThreshold(student, threshold = 50) {
  if (student.status !== 'active') return false;
  return (student.attention ?? 0) < threshold;
}

export function attentionLevel(student, threshold = 50) {
  if (student.status === 'offline') return 'offline';
  const score = student.attention ?? 0;
  if (score < threshold) return 'distracted';
  if (score < 70) return 'moderate';
  return 'focused';
}

export function matchesStatusFilter(student, filterId, threshold = 50) {
  switch (filterId) {
    case 'active':
      return student.status === 'active';
    case 'offline':
      return student.status === 'offline';
    case 'distracted':
      return isBelowThreshold(student, threshold);
    default:
      return true;
  }
}

export function studentCardId(roll) {
  return `student-card-${String(roll || '').toUpperCase()}`;
}

export function attentionStatusClass(avg) {
  if (avg > 70) return 'hero-good';
  if (avg >= 40) return 'hero-warn';
  return 'hero-bad';
}

export function sortStudents(list, sortBy) {
  const arr = [...list];
  switch (sortBy) {
    case 'attention-desc':
      return arr.sort((a, b) => (b.attention ?? 0) - (a.attention ?? 0));
    case 'attention-asc':
      return arr.sort((a, b) => (a.attention ?? 0) - (b.attention ?? 0));
    case 'name-asc':
      return arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    default:
      return arr;
  }
}

export function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function isMonitorAlert(alert) {
  return alert && alert !== 'LEFT SESSION' && alert !== 'DISCONNECTED';
}

export function filterAndSortStudents(
  list,
  { search, viewFilter = 'all', sortBy, threshold = 50, suppressCheck = () => false },
) {
  let result = list;

  const q = search.toLowerCase().trim();
  if (q) {
    result = result.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.roll_number?.toLowerCase().includes(q),
    );
  }

  switch (viewFilter) {
    case 'offline':
      result = result.filter((s) => s.status === 'offline');
      break;
    case 'distracted':
      result = result.filter((s) => isBelowThreshold(s, threshold));
      break;
    case 'alerts':
      result = result.filter(
        (s) => isMonitorAlert(s.alert) && !suppressCheck(s.roll_number),
      );
      break;
    default:
      break;
  }

  return sortStudents(result, sortBy);
}
