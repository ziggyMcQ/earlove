'use client';

import { useState } from 'react';

interface PopularityTrack {
  name: string;
  artist: string;
  popularity: number;
}

interface PopularitySpectrumProps {
  popularities: number[];
  tracks: PopularityTrack[];
  mainstreamScore: number;
}

const BUCKETS = [
  { label: 'Underground', range: '0–20', min: 0, max: 20 },
  { label: 'Niche', range: '21–40', min: 21, max: 40 },
  { label: 'Moderate', range: '41–60', min: 41, max: 60 },
  { label: 'Popular', range: '61–80', min: 61, max: 80 },
  { label: 'Mega-Hit', range: '81–100', min: 81, max: 100 },
];

export default function PopularitySpectrum({ popularities, tracks, mainstreamScore }: PopularitySpectrumProps) {
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);

  if (popularities.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-4">
        <p>No popularity data available yet</p>
      </div>
    );
  }

  const bucketCounts = BUCKETS.map((b) =>
    popularities.filter((p) => p >= b.min && p <= b.max).length
  );
  const maxCount = Math.max(...bucketCounts, 1);

  // Most obscure and most mainstream
  const sorted = [...tracks].sort((a, b) => a.popularity - b.popularity);
  const mostObscure = sorted.slice(0, 3).filter((t) => t.popularity <= 30);
  const mostMainstream = sorted.slice(-3).reverse().filter((t) => t.popularity >= 60);

  // Mainstream score label
  let msLabel: string;
  if (mainstreamScore >= 70) msLabel = 'Chart Chaser';
  else if (mainstreamScore >= 55) msLabel = 'Crowd Favorite';
  else if (mainstreamScore >= 40) msLabel = 'Balanced Palette';
  else if (mainstreamScore >= 25) msLabel = 'Crate Digger';
  else msLabel = 'Deep Underground';

  // Color for mainstream score
  const msColor = mainstreamScore >= 55
    ? 'text-blue-400'
    : mainstreamScore >= 35
      ? 'text-purple-400'
      : 'text-orange-400';

  return (
    <div className="space-y-6">
      {/* Mainstream Score */}
      <div className="text-center">
        <div className={`text-4xl font-bold ${msColor}`}>{mainstreamScore}</div>
        <div className="text-zinc-500 text-xs mt-1">Mainstream Score</div>
        <div className={`text-sm font-medium ${msColor} mt-0.5`}>{msLabel}</div>
      </div>

      {/* Histogram */}
      <div>
        <div className="flex items-end gap-2 h-28">
          {BUCKETS.map((bucket, i) => {
            const height = (bucketCounts[i] / maxCount) * 100;
            const isHovered = hoveredBucket === i;
            const barColor = i <= 1
              ? 'bg-orange-500/70'
              : i === 2
                ? 'bg-purple-500/70'
                : 'bg-blue-500/70';

            return (
              <div
                key={bucket.label}
                className="flex-1 flex flex-col items-center justify-end h-full cursor-default"
                onMouseEnter={() => setHoveredBucket(i)}
                onMouseLeave={() => setHoveredBucket(null)}
              >
                {isHovered && (
                  <span className="text-xs text-zinc-300 font-mono mb-1">
                    {bucketCounts[i]}
                  </span>
                )}
                <div
                  className={`w-full rounded-t transition-all duration-200 ${barColor} ${isHovered ? 'opacity-100' : 'opacity-70'}`}
                  style={{
                    height: `${Math.max(height, 3)}%`,
                    minHeight: '2px',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          {BUCKETS.map((bucket, i) => (
            <div key={bucket.label} className="flex-1 text-center">
              <span className={`text-[9px] font-medium ${
                hoveredBucket === i ? 'text-zinc-300' : 'text-zinc-500'
              }`}>
                {bucket.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Callouts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mostObscure.length > 0 && (
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold mb-2">
              Most Obscure
            </p>
            {mostObscure.map((t, i) => (
              <p key={i} className="text-xs text-zinc-400 truncate">
                <span className="text-zinc-300">{t.name}</span>
                <span className="text-zinc-600"> · {t.artist}</span>
                <span className="text-orange-400/60 ml-1">({t.popularity})</span>
              </p>
            ))}
          </div>
        )}
        {mostMainstream.length > 0 && (
          <div className="bg-zinc-800/50 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mb-2">
              Most Mainstream
            </p>
            {mostMainstream.map((t, i) => (
              <p key={i} className="text-xs text-zinc-400 truncate">
                <span className="text-zinc-300">{t.name}</span>
                <span className="text-zinc-600"> · {t.artist}</span>
                <span className="text-blue-400/60 ml-1">({t.popularity})</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
