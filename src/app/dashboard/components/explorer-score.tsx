'use client';

interface ExplorerScoreProps {
  score: number; // 0-100
  label: string;
  totalGenres: number;
  totalArtists: number;
}

export default function ExplorerScore({ score, label, totalGenres, totalArtists }: ExplorerScoreProps) {
  // SVG arc gauge
  const size = 160;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arc from bottom-left to bottom-right (270 degrees, leaving a 90-degree gap at bottom)
  const arcAngle = 270;
  const startAngle = 135; // degrees from 3 o'clock position
  const endAngle = startAngle + arcAngle;
  
  // Convert to radians for SVG
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  
  const startX = cx + radius * Math.cos(toRad(startAngle));
  const startY = cy + radius * Math.sin(toRad(startAngle));
  const endX = cx + radius * Math.cos(toRad(endAngle));
  const endY = cy + radius * Math.sin(toRad(endAngle));
  
  // Progress arc
  const progressAngle = startAngle + (score / 100) * arcAngle;
  const progX = cx + radius * Math.cos(toRad(progressAngle));
  const progY = cy + radius * Math.sin(toRad(progressAngle));
  
  const largeArcBg = arcAngle > 180 ? 1 : 0;
  const progressSweep = (score / 100) * arcAngle;
  const largeArcProg = progressSweep > 180 ? 1 : 0;

  const bgPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcBg} 1 ${endX} ${endY}`;
  const progPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcProg} 1 ${progX} ${progY}`;

  // Color based on score
  const color = score >= 65
    ? 'rgb(34, 197, 94)' // green
    : score >= 35
      ? 'rgb(250, 204, 21)' // yellow
      : 'rgb(239, 68, 68)'; // red

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size - 20 }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ marginBottom: -20 }}>
          {/* Background arc */}
          <path
            d={bgPath}
            fill="none"
            stroke="rgb(63 63 70)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          {score > 0 && (
            <path
              d={progPath}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          )}
          {/* Score number */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            className="fill-white text-3xl font-bold"
            style={{ fontSize: '36px' }}
          >
            {score}
          </text>
          {/* Label */}
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            className="fill-zinc-400 text-xs"
            style={{ fontSize: '11px' }}
          >
            {label}
          </text>
        </svg>
      </div>
      
      {/* Stats below */}
      <div className="flex gap-6 mt-2 text-center">
        <div>
          <p className="text-lg font-bold text-white">{totalGenres}</p>
          <p className="text-xs text-zinc-500">genres</p>
        </div>
        <div>
          <p className="text-lg font-bold text-white">{totalArtists}</p>
          <p className="text-xs text-zinc-500">artists</p>
        </div>
      </div>
    </div>
  );
}
