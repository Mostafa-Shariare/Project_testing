/** UI-only attention color bands and labels (no backend behavior) */

export function getAttentionBand(score) {
  if (score == null || score < 0) return 'offline';
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'moderate';
  return 'low';
}

export function getFocusLabel(score, isOffline, isPaused = false) {
  if (isOffline) return 'Offline';
  if (isPaused) return '⏸️ Paused';
  const band = getAttentionBand(score);
  switch (band) {
    case 'excellent':
      return 'Excellent Focus';
    case 'good':
      return 'Good Focus';
    case 'moderate':
      return 'Moderate Attention';
    case 'low':
      return 'Attention Drift';
    default:
      return 'Unknown';
  }
}

export const BAND_COLORS = {
  excellent: { main: '#16A34A', bg: '#DCFCE7', border: '#86EFAC' },
  good: { main: '#2563EB', bg: '#DBEAFE', border: '#93C5FD' },
  moderate: { main: '#EA580C', bg: '#FFEDD5', border: '#FDBA74' },
  low: { main: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
  paused: { main: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
  offline: { main: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
};

export function avatarInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}
