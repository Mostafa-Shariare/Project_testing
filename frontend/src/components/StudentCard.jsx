export default function StudentCard({ student }) {
  const isOffline = student.status === 'offline';
  const score = student.attention ?? 0;
  const stable = student.model_pred_stable;
  const alert = student.alert || '';

  let attnClass = 'attn-high';
  let circleClass = 'good';
  if (isOffline) {
    circleClass = 'offline';
    attnClass = 'offline';
  } else if (score < 40) {
    attnClass = 'attn-low';
    circleClass = 'bad';
  } else if (score < 70) {
    attnClass = 'attn-medium';
    circleClass = 'warn';
  }

  const hasAlert = alert && alert !== 'LEFT SESSION' && alert !== 'DISCONNECTED';
  const badgeClass = isOffline
    ? 'student-badge offline'
    : stable === 1
      ? 'student-badge attentive'
      : 'student-badge distracted';
  const badgeText = isOffline ? 'Offline' : stable === 1 ? 'Attentive' : 'Distracted';

  const pitch = student.pose_pitch?.toFixed(1) ?? '0.0';
  const yaw = student.pose_yaw?.toFixed(1) ?? '0.0';

  return (
    <div
      className={`student-card ${attnClass} ${isOffline ? 'offline' : ''}`}
      data-roll={student.roll_number}
    >
      <div className="card-top">
        <div className="student-identity">
          <div className="student-name" title={student.name}>
            {student.name}
          </div>
          <div className="student-class">
            Roll {student.roll_number} · {student.class_code}
          </div>
        </div>
        <div className={badgeClass}>{badgeText}</div>
      </div>

      <div className="card-metrics-block">
        <div
          className={`score-circle ${circleClass}`}
          style={{ '--pct': isOffline ? '0%' : `${score}%` }}
        >
          <span className="score-text">{isOffline ? '—' : `${score}%`}</span>
        </div>
        <div className="quick-details">
          <div className="detail-line">
            <span>Gaze:</span>
            <span className={student.gaze === 'Center' ? 'text-success' : 'text-warning'}>
              {student.gaze}
            </span>
          </div>
          <div className="detail-line">
            <span>Blink rate:</span>
            <span>{(student.blinks_per_min ?? 0).toFixed(1)}/min</span>
          </div>
          <div className="detail-line">
            <span>Phone:</span>
            <span className={student.phone_detected ? 'text-danger' : ''}>
              {student.phone_detected ? 'Detected' : 'No'}
            </span>
          </div>
          <div className="detail-line">
            <span>Hands:</span>
            <span>{student.hands_count ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="detail-line pose-line">
        <span>Head Pose:</span>
        <span>
          P: {pitch}° &nbsp; Y: {yaw}°
        </span>
      </div>

      <div className={`card-alert-banner ${hasAlert ? 'has-alert' : 'no-alert'}`}>
        {hasAlert ? `⚠ ${alert}` : '✓ Monitoring Active'}
      </div>
    </div>
  );
}
