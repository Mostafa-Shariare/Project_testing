export default function StudentSparkline({ data = [], width = 120, height = 32, color = '#5aa0f0' }) {
  if (!data.length) {
    return (
      <svg width={width} height={height} className="student-sparkline" aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const pts = data.slice(-15);
  const min = 0;
  const max = 100;
  const step = pts.length > 1 ? width / (pts.length - 1) : 0;

  const path = pts
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / (max - min)) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="student-sparkline" aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
