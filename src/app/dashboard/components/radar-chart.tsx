'use client';

import { useState } from 'react';

interface RadarPoint {
  genre: string;
  weight: number; // 0-1
  rawCount: number;
  artists: string[];
}

interface RadarChartProps {
  data: RadarPoint[];
  size?: number;
  onGenreClick?: (genre: string) => void;
}

export default function RadarChart({ data, size = 500, onGenreClick }: RadarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length < 3) {
    return (
      <div className="text-center text-zinc-500 py-8">
        <p>Not enough genre data for radar chart</p>
        <p className="text-xs mt-1">Need at least 3 genres</p>
      </div>
    );
  }

  const vb = size;
  const cx = vb / 2;
  const cy = vb / 2;
  const maxRadius = size * 0.3;
  const labelRadius = size * 0.44;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const rings = [0.25, 0.5, 0.75, 1.0];

  const dataPoints = data.map((point, i) => {
    const angle = startAngle + i * angleStep;
    const r = maxRadius * Math.max(point.weight, 0.08);
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      labelX: cx + labelRadius * Math.cos(angle),
      labelY: cy + labelRadius * Math.sin(angle),
      angle,
      ...point,
    };
  });

  const polygonPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div className="relative w-full" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${vb} ${vb}`} className="w-full h-auto overflow-visible">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="labelGlow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(34, 197, 94, 0.25)" />
            <stop offset="100%" stopColor="rgba(34, 197, 94, 0.05)" />
          </radialGradient>
        </defs>

        {/* Grid rings */}
        {rings.map((ring) => (
          <circle
            key={ring}
            cx={cx}
            cy={cy}
            r={maxRadius * ring}
            fill="none"
            stroke={ring === 1 ? 'rgba(63, 63, 70, 0.6)' : 'rgba(63, 63, 70, 0.25)'}
            strokeWidth={ring === 1 ? 1 : 0.5}
            strokeDasharray={ring === 1 ? 'none' : '3 6'}
          />
        ))}

        {/* Axis lines */}
        {dataPoints.map((p, i) => (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={cx + maxRadius * Math.cos(p.angle)}
            y2={cy + maxRadius * Math.sin(p.angle)}
            stroke={hoveredIndex === i ? 'rgba(34, 197, 94, 0.3)' : 'rgba(63, 63, 70, 0.2)'}
            strokeWidth={hoveredIndex === i ? 1 : 0.5}
            className="transition-all duration-200"
          />
        ))}

        {/* Data polygon - outer glow */}
        <path
          d={polygonPath}
          fill="none"
          stroke="rgba(34, 197, 94, 0.15)"
          strokeWidth={8}
          strokeLinejoin="round"
          filter="url(#glow)"
        />

        {/* Data polygon - fill */}
        <path
          d={polygonPath}
          fill="url(#radarFill)"
          stroke="none"
        />

        {/* Data polygon - stroke */}
        <path
          d={polygonPath}
          fill="none"
          stroke="rgb(34, 197, 94)"
          strokeWidth={2}
          strokeLinejoin="round"
          filter="url(#glow)"
        />

        {/* Data points (dots) */}
        {dataPoints.map((p, i) => (
          <g key={`dot-${i}`}>
            {hoveredIndex === i && (
              <circle
                cx={p.x}
                cy={p.y}
                r={12}
                fill="rgba(34, 197, 94, 0.15)"
                className="animate-pulse"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 5 : 3.5}
              fill={hoveredIndex === i ? 'rgb(34, 197, 94)' : 'rgb(22, 163, 74)'}
              stroke="rgb(9, 9, 11)"
              strokeWidth={2}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onGenreClick?.(p.genre)}
            />
          </g>
        ))}

        {/* Labels */}
        {dataPoints.map((p, i) => {
          const isHovered = hoveredIndex === i;
          const isLeft = p.labelX < cx - 10;
          const isRight = p.labelX > cx + 10;
          const anchor = isLeft ? 'end' : isRight ? 'start' : 'middle';

          return (
            <text
              key={`label-${i}`}
              x={p.labelX}
              y={p.labelY}
              textAnchor={anchor}
              dominantBaseline="central"
              className="cursor-pointer transition-all duration-200"
              style={{
                fontSize: isHovered ? '17px' : '15px',
                fontWeight: isHovered ? 600 : 400,
                fill: isHovered ? 'rgb(34, 197, 94)' : 'rgb(161, 161, 170)',
                letterSpacing: isHovered ? '0.02em' : '0',
              }}
              filter={isHovered ? 'url(#labelGlow)' : undefined}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => onGenreClick?.(p.genre)}
            >
              {p.genre}
            </text>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredIndex !== null && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm shadow-2xl z-10 whitespace-nowrap">
          <p className="text-green-400 font-semibold">{dataPoints[hoveredIndex].genre}</p>
          <p className="text-zinc-400 text-xs">
            {dataPoints[hoveredIndex].rawCount} artist{dataPoints[hoveredIndex].rawCount !== 1 ? 's' : ''} &middot; click to explore
          </p>
          {dataPoints[hoveredIndex].artists.length > 0 && (
            <p className="text-zinc-500 text-xs mt-0.5">
              {dataPoints[hoveredIndex].artists.slice(0, 3).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
