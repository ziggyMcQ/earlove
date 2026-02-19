'use client';

import { useState } from 'react';

interface DecadeBucket {
  decade: string;
  count: number;
  percentage: number;
}

interface TimelineProps {
  data: DecadeBucket[];
  medianYear: number | null;
  onDecadeClick?: (decade: string) => void;
}

export default function Timeline({ data, medianYear, onDecadeClick }: TimelineProps) {
  const [hoveredDecade, setHoveredDecade] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-6">
        <p>No release date data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count));
  const clickable = !!onDecadeClick;

  return (
    <div>
      <div className="flex items-end gap-2 h-36">
        {data.map((bucket) => {
          const height = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          const isHovered = hoveredDecade === bucket.decade;
          const isPeak = bucket.count === maxCount;
          
          return (
            <div
              key={bucket.decade}
              className={`flex-1 flex flex-col items-center justify-end h-full group ${
                clickable ? 'cursor-pointer' : ''
              }`}
              onMouseEnter={() => setHoveredDecade(bucket.decade)}
              onMouseLeave={() => setHoveredDecade(null)}
              onClick={() => onDecadeClick?.(bucket.decade)}
            >
              {/* Hover count */}
              {isHovered && (
                <span className="text-xs text-green-400 font-mono mb-1">
                  {bucket.count}
                </span>
              )}
              {/* Bar */}
              <div
                className={`w-full rounded-t transition-all duration-200 ${
                  isHovered
                    ? 'bg-green-400 shadow-[0_0_16px_rgba(34,197,94,0.4)]'
                    : isPeak
                      ? 'bg-green-500'
                      : 'bg-zinc-600 group-hover:bg-green-500/60'
                }`}
                style={{
                  height: `${Math.max(height, 3)}%`,
                  minHeight: '2px',
                }}
              />
              {/* Label + explore hint */}
              <div className="flex flex-col items-center mt-2">
                <span className={`text-[11px] font-mono transition-colors duration-150 ${
                  isHovered
                    ? 'text-green-400 font-medium'
                    : 'text-zinc-500 group-hover:text-zinc-300'
                }`}>
                  {bucket.decade.replace('s', '')}
                </span>
                {clickable && (
                  <span className={`text-[7px] font-mono uppercase tracking-wider mt-0.5 transition-all duration-150 ${
                    isHovered ? 'opacity-100 text-green-500' : 'opacity-0 group-hover:opacity-50 text-zinc-600'
                  }`}>
                    discover
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Median year indicator */}
      {medianYear && (
        <p className="text-center text-xs text-zinc-600 mt-4 font-mono">
          median: <span className="text-zinc-400 font-semibold">{medianYear}</span>
        </p>
      )}
    </div>
  );
}
