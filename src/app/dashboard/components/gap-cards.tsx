'use client';

import { GENRE_DESCRIPTIONS } from '@/lib/genre-descriptions';

interface BlindSpot {
  genre: string;
  reason: 'untouched' | 'adjacent';
  adjacentTo?: string;
}

interface GapCardsProps {
  blindSpots: BlindSpot[];
  onExplore: (genre: string) => void;
  exploring: boolean;
  activeGenre: string | null;
}

export default function GapCards({ blindSpots, onExplore, exploring, activeGenre }: GapCardsProps) {
  if (blindSpots.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-4">
        <p>No blind spots found — you listen to everything!</p>
      </div>
    );
  }

  const adjacent = blindSpots.filter((s) => s.reason === 'adjacent');
  const untouched = blindSpots.filter((s) => s.reason === 'untouched');

  return (
    <div className="space-y-6">
      {/* Adjacent genre suggestions */}
      {adjacent.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Just next door
          </h4>
          <div className="flex flex-wrap gap-2">
            {adjacent.map((spot) => (
              <button
                key={spot.genre}
                onClick={() => onExplore(spot.genre)}
                disabled={exploring}
                className={`
                  group relative px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                  border
                  ${activeGenre === spot.genre
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-300 hover:border-green-500/30 hover:bg-zinc-800'
                  }
                  disabled:opacity-50
                `}
              >
                <span>{spot.genre}</span>
                {spot.adjacentTo && (
                  <span className="block text-[10px] text-zinc-500 mt-0.5 group-hover:text-zinc-400 transition-colors">
                    because you like {spot.adjacentTo}
                  </span>
                )}
                {GENRE_DESCRIPTIONS[spot.genre] && (
                  <span className="block text-[10px] text-zinc-600 mt-0.5 italic leading-snug">
                    {GENRE_DESCRIPTIONS[spot.genre]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Completely untouched genres */}
      {untouched.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Uncharted territory
          </h4>
          <div className="flex flex-wrap gap-2">
            {untouched.map((spot) => (
              <button
                key={spot.genre}
                onClick={() => onExplore(spot.genre)}
                disabled={exploring}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium transition-all
                  border border-dashed
                  ${activeGenre === spot.genre
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                  }
                  disabled:opacity-50
                `}
              >
                <span>{spot.genre}</span>
                {GENRE_DESCRIPTIONS[spot.genre] && (
                  <span className="block text-[10px] text-zinc-600 mt-0.5 italic leading-snug">
                    {GENRE_DESCRIPTIONS[spot.genre]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
