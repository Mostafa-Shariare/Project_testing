import { useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

export default function AttentionTrendChart({ history = [] }) {
  const chartRef = useRef(null);

  const labels = useMemo(
    () =>
      history.map((p) =>
        new Date(p.ts * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      ),
    [history],
  );

  const datasets = useMemo(
    () => [
      {
        label: 'Class average',
        data: history.map((p) => p.classAvg),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true,
      },
    ],
    [history],
  );

  if (history.length === 0) {
    return <p className="empty-alerts">Chart will appear once students connect.</p>;
  }

  return (
    <div className="attention-trend-chart">
      <div className="chart-wrap chart-wrap-tall">
        <Line
          ref={chartRef}
          data={{ labels, datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 200 },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.parsed.y ?? '—'}%`,
                },
              },
            },
            scales: {
              x: {
                ticks: { color: '#94a3b8', maxTicksLimit: 8 },
                grid: { display: false },
              },
              y: {
                min: 0,
                max: 100,
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(15, 23, 42, 0.06)' },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
