'use client';

import { useState } from 'react';
import { SpotifyTrack } from '@/lib/spotify';

type DiscoveryMode = 'missing-hits' | 'fresh-drops' | 'genre-split' | 'deep-cuts';

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; width: number; height: number }[];
}

interface DiscoveryResult {
  tracks?: SpotifyTrack[];
  albums?: SpotifyAlbum[];
  genres?: {
    known: string[];
    unknown: string[];
  };
  error?: string;
  profileStats?: {
    tracksAnalyzed: number;
    buildTime: number;
  };
}

export function DiscoveryCards() {
  const [activeMode, setActiveMode] = useState<DiscoveryMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveryResult | null>(null);

  const handleDiscover = async (mode: DiscoveryMode) => {
    setActiveMode(mode);
    setLoading(true);
    setResults(null);

    try {
      const response = await fetch(`/api/discover/${mode}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Discovery failed');
      }
      
      setResults(data);
    } catch (err) {
      setResults({ error: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Discovery Mode Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <DiscoveryCard
          title="Missing Hits"
          description="Global chart-toppers you've somehow never played"
          icon="🌍"
          onClick={() => handleDiscover('missing-hits')}
          active={activeMode === 'missing-hits'}
          loading={loading && activeMode === 'missing-hits'}
        />
        
        <DiscoveryCard
          title="Fresh Drops"
          description="New releases from artists you don't follow"
          icon="✨"
          onClick={() => handleDiscover('fresh-drops')}
          active={activeMode === 'fresh-drops'}
          loading={loading && activeMode === 'fresh-drops'}
        />
        
        <DiscoveryCard
          title="Genre Split"
          description="Genres you love vs. genres you've never tried"
          icon="🎭"
          onClick={() => handleDiscover('genre-split')}
          active={activeMode === 'genre-split'}
          loading={loading && activeMode === 'genre-split'}
        />
        
        <DiscoveryCard
          title="Deep Cuts"
          description="Albums from favorite artists you skipped"
          icon="💿"
          onClick={() => handleDiscover('deep-cuts')}
          active={activeMode === 'deep-cuts'}
          loading={loading && activeMode === 'deep-cuts'}
          disabled
          comingSoon
        />
      </div>

      {/* Results Section */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          <p className="text-zinc-400 mt-4">Building your Heard Profile...</p>
          <p className="text-zinc-600 text-sm mt-1">Analyzing your listening history</p>
        </div>
      )}

      {results && !loading && (
        <ResultsDisplay mode={activeMode!} results={results} />
      )}
    </div>
  );
}

function DiscoveryCard({
  title,
  description,
  icon,
  onClick,
  active,
  loading,
  disabled,
  comingSoon,
}: {
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        relative text-left p-6 rounded-xl border transition-all
        ${active 
          ? 'border-green-500 bg-green-500/10' 
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {comingSoon && (
        <span className="absolute top-3 right-3 text-xs bg-zinc-700 text-zinc-400 px-2 py-1 rounded">
          Coming soon
        </span>
      )}
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-zinc-400 text-sm">{description}</p>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 rounded-xl">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500"></div>
        </div>
      )}
    </button>
  );
}

function ResultsDisplay({ mode, results }: { mode: DiscoveryMode; results: DiscoveryResult }) {
  if (results.error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400">{results.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {results.profileStats && (
        <div className="text-center text-sm text-zinc-500">
          Analyzed {results.profileStats.tracksAnalyzed.toLocaleString()} tracks 
          in {results.profileStats.buildTime}ms
        </div>
      )}

      {/* Genre Split View */}
      {mode === 'genre-split' && results.genres && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-zinc-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-green-400">Genres You Know</h3>
            <div className="flex flex-wrap gap-2">
              {results.genres.known.map((genre) => (
                <span key={genre} className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                  {genre}
                </span>
              ))}
            </div>
          </div>
          
          <div className="bg-zinc-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Genres to Explore</h3>
            <div className="flex flex-wrap gap-2">
              {results.genres.unknown.map((genre) => (
                <span key={genre} className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm cursor-pointer hover:bg-purple-500/30 transition-colors">
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Track List View */}
      {results.tracks && results.tracks.length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-700">
            <h3 className="font-semibold">
              {results.tracks.length} tracks you&apos;ve never played
            </h3>
          </div>
          <div className="divide-y divide-zinc-700/50">
            {results.tracks.slice(0, 20).map((track, i) => (
              <TrackRow key={track.id} track={track} index={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Albums View (for fresh drops) */}
      {results.albums && results.albums.length > 0 && (
        <div className="bg-zinc-800/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-700">
            <h3 className="font-semibold">
              {results.albums.length} new releases from unknown artists
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
            {results.albums.slice(0, 20).map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!results.tracks || results.tracks.length === 0) && 
       (!results.albums || results.albums.length === 0) && 
       (!results.genres) && (
        <div className="text-center py-12 text-zinc-500">
          <p>No results found. You might have heard everything!</p>
        </div>
      )}
    </div>
  );
}

function TrackRow({ track, index }: { track: SpotifyTrack; index: number }) {
  const albumImage = track.album.images?.[2]?.url || track.album.images?.[0]?.url;
  
  return (
    <a
      href={track.external_urls.spotify}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-3 hover:bg-zinc-700/30 transition-colors"
    >
      <span className="text-zinc-500 w-6 text-right text-sm">{index}</span>
      {albumImage && (
        <img src={albumImage} alt={track.album.name} className="w-10 h-10 rounded" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{track.name}</p>
        <p className="text-zinc-400 text-sm truncate">
          {track.artists.map((a) => a.name).join(', ')}
        </p>
      </div>
      <svg className="w-5 h-5 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    </a>
  );
}

function AlbumCard({ album }: { album: SpotifyAlbum }) {
  const image = album.images?.[1]?.url || album.images?.[0]?.url;
  
  return (
    <a
      href={`https://open.spotify.com/album/${album.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group"
    >
      <div className="aspect-square bg-zinc-700 rounded-lg overflow-hidden mb-2">
        {image && (
          <img 
            src={image} 
            alt={album.name} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        )}
      </div>
      <p className="font-medium text-sm truncate">{album.name}</p>
      <p className="text-zinc-400 text-xs truncate">
        {album.artists.map((a) => a.name).join(', ')}
      </p>
    </a>
  );
}
