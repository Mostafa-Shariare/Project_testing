import { useState } from 'react';
import { TrendingUp, Sparkles, ShieldAlert, Info, CheckCircle2 } from 'lucide-react';

const MIN_SESSIONS_REQUIRED = 3;

export default function FocusInsightsCard({ sessionCount = 4, hourlyData }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const HOURLY_DATA = hourlyData || [
    { time: '8 AM', score: 65 },
    { time: '9 AM', score: 75 },
    { time: '10 AM', score: 92 },
    { time: '11 AM', score: 95 },
    { time: '12 PM', score: 88 },
    { time: '1 PM', score: 70 },
    { time: '2 PM', score: 82 },
    { time: '3 PM', score: 85 }
  ];

  const hasEnoughData = sessionCount >= MIN_SESSIONS_REQUIRED;

  // Graph coordinate calculations
  const svgWidth = 560;
  const svgHeight = 150;
  const paddingLeft = 36;
  const paddingRight = 36;
  const paddingTop = 26;
  const paddingBottom = 34;

  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;
  const minVal = 40;
  const maxVal = 100;

  const points = HOURLY_DATA.map((d, i) => {
    const x = paddingLeft + (i / (HOURLY_DATA.length - 1)) * plotWidth;
    const y = paddingTop + (1 - (d.score - minVal) / (maxVal - minVal)) * plotHeight;
    return { ...d, x, y, index: i };
  });

  // Generate smooth cubic bezier SVG curve (Catmull-Rom spline)
  const getSplinePath = (pts) => {
    if (!pts || pts.length === 0) return '';
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = getSplinePath(points);
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)},${paddingTop + plotHeight} L ${points[0].x.toFixed(1)},${paddingTop + plotHeight} Z`
    : '';

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="calm-card calm-fade-in">
      <div className="calm-card-header">
        <div className="calm-card-title-group">
          <div className="calm-card-icon icon-mint">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="calm-card-title">Focus & Attention Insights</h3>
            <span className="calm-card-subtitle">Observed behavioral focus trends & attention stability patterns</span>
          </div>
        </div>
      </div>

      <div className="calm-insights-content">
        {/* Focus State Segmented Bar */}
        <div className="calm-insights-section">
          <div className="calm-insights-header-row">
            <span className="calm-insights-subheading">Attention Breakdown Today</span>
            <span className="calm-insights-score-badge">STABLE ATTENTION PROFILE</span>
          </div>

          <div className="calm-focus-bar-wrapper">
            <div className="calm-focus-seg-high" style={{ width: '78%' }} title="Deep Focus: 78%" />
            <div className="calm-focus-seg-mild" style={{ width: '14%' }} title="Attention Shift: 14%" />
            <div className="calm-focus-seg-low" style={{ width: '8%' }} title="Refocus Break Recommended: 8%" />
          </div>

          <div className="calm-focus-legend">
            <div className="calm-legend-item">
              <span className="calm-legend-dot dot-mint" />
              <span>Deep Focus (78%)</span>
            </div>
            <div className="calm-legend-item">
              <span className="calm-legend-dot dot-amber" />
              <span>Attention Shift (14%)</span>
            </div>
            <div className="calm-legend-item">
              <span className="calm-legend-dot dot-rose" />
              <span>Rest Needed (8%)</span>
            </div>
          </div>
        </div>

        {/* Hourly Focus Trend Graph Visualization */}
        <div className="calm-insights-section">
          <div className="calm-insights-header-row">
            <span className="calm-insights-subheading">Observed Hourly Focus Patterns</span>
            <span className="calm-insights-meta-tag">
              {hoveredPoint ? (
                <strong style={{ color: hoveredPoint.score >= 88 ? 'var(--calm-mint)' : 'var(--calm-text-primary)' }}>
                  {hoveredPoint.time}: {hoveredPoint.score}% Focus
                </strong>
              ) : (
                hasEnoughData ? `${sessionCount} SESSIONS ANALYZED` : `REQUIRES ${MIN_SESSIONS_REQUIRED} SESSIONS`
              )}
            </span>
          </div>

          <div className="calm-focus-graph-wrap">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="calm-focus-graph-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="focusAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.28" />
                  <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#1E222B" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="focusStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="35%" stopColor="#22C55E" />
                  <stop offset="65%" stopColor="#22C55E" />
                  <stop offset="100%" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>

              {/* Horizontal Reference Grid Lines */}
              {[100, 80, 60].map((level) => {
                const y = paddingTop + (1 - (level - minVal) / (maxVal - minVal)) * plotHeight;
                return (
                  <g key={level}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={svgWidth - paddingRight}
                      y2={y}
                      stroke="rgba(255, 255, 255, 0.06)"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="#6B7280"
                      fontSize="9"
                      fontFamily="var(--calm-font-mono)"
                      fontWeight="500"
                    >
                      {level}%
                    </text>
                  </g>
                );
              })}

              {/* Area Under Curve */}
              {areaPath && <path d={areaPath} fill="url(#focusAreaGradient)" />}

              {/* Trend Line Curve */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#focusStrokeGradient)"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Vertical Guide Line when Hovered */}
              {hoveredPoint && (
                <line
                  x1={hoveredPoint.x}
                  y1={paddingTop}
                  x2={hoveredPoint.x}
                  y2={paddingTop + plotHeight}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeDasharray="2 3"
                />
              )}

              {/* Data Nodes, Value Labels, and Time Labels */}
              {points.map((pt, i) => {
                const isPeak = pt.score >= 88;
                const isHovered = hoveredIdx === i;
                return (
                  <g
                    key={pt.time}
                    className="calm-graph-node"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Generous invisible hover target circle */}
                    <circle cx={pt.x} cy={pt.y} r={18} fill="transparent" />

                    {/* Numeric Score Label Above Node */}
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      textAnchor="middle"
                      fill={isHovered ? '#FFFFFF' : isPeak ? '#22C55E' : '#9AA3B2'}
                      fontSize={isHovered ? '11' : '10'}
                      fontWeight={isPeak || isHovered ? '700' : '600'}
                      fontFamily="var(--calm-font-mono)"
                    >
                      {pt.score}%
                    </text>

                    {/* Node Halo */}
                    {(isHovered || isPeak) && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 8 : 6}
                        fill={isPeak ? 'rgba(34, 197, 94, 0.25)' : 'rgba(139, 92, 246, 0.25)'}
                      />
                    )}

                    {/* Node Point */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 4.5 : 3.5}
                      fill="#171A21"
                      stroke={isPeak ? '#22C55E' : isHovered ? '#FFFFFF' : '#8B5CF6'}
                      strokeWidth={isHovered ? 2.5 : 2}
                    />

                    {/* Time Label on X-axis */}
                    <text
                      x={pt.x}
                      y={svgHeight - 10}
                      textAnchor="middle"
                      fill={isHovered ? '#F1F3F5' : '#9AA3B2'}
                      fontSize="11"
                      fontWeight={isHovered ? '600' : '500'}
                      fontFamily="var(--calm-font-mono)"
                    >
                      {pt.time}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Minimum-Data Gated Recommendation or Data Notice */}
        {hasEnoughData ? (
          <div className="calm-ai-tip-card">
            <div className="calm-ai-tip-icon">
              <Sparkles size={15} />
            </div>
            <div className="calm-ai-tip-text">
              <h5>Peak Focus Observation</h5>
              <p>
                Based on <strong>{sessionCount} sessions</strong>, your optimal sustained attention occurred between <strong>10:00 AM and 1:00 PM</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="calm-ai-notice-box">
            <Info size={16} className="calm-notice-icon" />
            <div>
              <h5>Insufficient Data for Pattern Generation</h5>
              <p>
                A minimum of <strong>{MIN_SESSIONS_REQUIRED} completed learning sessions</strong> is required to generate reliable observed focus patterns ({sessionCount} / {MIN_SESSIONS_REQUIRED} sessions recorded).
              </p>
              <div className="calm-notice-hint">
                <CheckCircle2 size={11} /> Complete {MIN_SESSIONS_REQUIRED - sessionCount} more session(s) to unlock personalized focus patterns!
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
