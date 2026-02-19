'use client';

import { useState } from 'react';
import SpotifyLink from './components/SpotifyLink';

type DiscoveryMode = 'missing-hits' | 'fresh-drops' | 'genre-split' | 'deep-cuts';

interface SpotifyTrackResult {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  external_urls: { spotify: string };
}

interface SpotifyAlbumResult {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; width: number; height: number }[];
}

interface DiscoveryResult {
  tracks?: SpotifyTrackResult[];
  albums?: SpotifyAlbumResult[];
  genres?: {
    known: string[];
    unknown: string[];
    devModeNote?: string;
  };
  error?: string;
  profileStats?: {
    tracksAnalyzed: number;
    buildTime: number;
  };
  // Genre explore results
  genre?: string;
  totalFound?: number;
  unheardCount?: number;
  // Debug info
  debug?: {
    searchReturned?: number;
    unheardCount?: number;
    profileTracks?: number;
    profileArtists?: number;
    searchError?: string | null;
  };
}

export function DiscoveryCards({ accessToken }: { accessToken: string }) {
  const [activeMode, setActiveMode] = useState<DiscoveryMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveryResult | null>(null);
  const [genreResults, setGenreResults] = useState<DiscoveryResult | null>(null);
  const [genreLoading, setGenreLoading] = useState(false);

  const handleDiscover = async (mode: DiscoveryMode) => {
    setActiveMode(mode);
    setLoading(true);
    setResults(null);
    setGenreResults(null);

    try {
      const response = await fetch(`/api/discover/${mode}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
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

  const handleGenreExplore = async (genre: string) => {
    setGenreLoading(true);
    setGenreResults(null);

    try {
      const response = await fetch(`/api/discover/genre-explore?genre=${encodeURIComponent(genre)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Genre exploration failed');
      }

      setGenreResults(data);
    } catch (err) {
      setGenreResults({ error: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setGenreLoading(false);
    }
  };

  return (
    <div className="space-y-8">
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
          description="Recent tracks from artists outside your bubble"
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

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          <p className="text-zinc-400 mt-4">Building your Heard Profile...</p>
          <p className="text-zinc-600 text-sm mt-1">Analyzing your listening history</p>
        </div>
      )}

      {results && !loading && (
        <ResultsDisplay
          mode={activeMode!}
          results={results}
          onGenreExplore={handleGenreExplore}
          genreLoading={genreLoading}
          genreResults={genreResults}
        />
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

function ResultsDisplay({
  mode,
  results,
  onGenreExplore,
  genreLoading,
  genreResults,
}: {
  mode: DiscoveryMode;
  results: DiscoveryResult;
  onGenreExplore?: (genre: string) => void;
  genreLoading?: boolean;
  genreResults?: DiscoveryResult | null;
}) {
  if (results.error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400">{results.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.profileStats && (
        <div className="text-center text-sm text-zinc-500">
          Analyzed {results.profileStats.tracksAnalyzed.toLocaleString()} tracks
          in {results.profileStats.buildTime}ms
        </div>
      )}

      {results.debug && (
        <div className="text-center text-xs text-zinc-600 bg-zinc-800/30 rounded p-2 max-w-md mx-auto">
          Search returned: {results.debug.searchReturned} |
          Unheard: {results.debug.unheardCount} |
          Profile: {results.debug.profileTracks} tracks, {results.debug.profileArtists} artists
          {results.debug.searchError && (
            <div className="text-red-400 mt-1">Search error: {results.debug.searchError}</div>
          )}
        </div>
      )}

      {mode === 'genre-split' && results.genres && (
        <>
          {results.genres.devModeNote && (
            <div className="text-center text-xs text-zinc-500 bg-zinc-800/30 rounded-lg py-2 px-4">
              {results.genres.devModeNote}
            </div>
          )}

          <div className={results.genres.known.length > 0 ? 'grid md:grid-cols-2 gap-6' : ''}>
            {results.genres.known.length > 0 && (
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
            )}

            <div className="bg-zinc-800/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 text-purple-400">
                {results.genres.known.length > 0 ? 'Genres to Explore' : 'Explore a Genre'}
              </h3>
              <p className="text-zinc-500 text-xs mb-3">Click a genre to discover unheard tracks</p>
              <div className="flex flex-wrap gap-2">
                {results.genres.unknown.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => onGenreExplore?.(genre)}
                    disabled={genreLoading}
                    className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm cursor-pointer hover:bg-purple-500/40 transition-colors disabled:opacity-50"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {genreLoading && (
            <div className="text-center py-6">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
              <p className="text-zinc-400 mt-2 text-sm">Searching genre tracks...</p>
            </div>
          )}

          {genreResults && !genreLoading && genreResults.error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-center">
              <p className="text-red-400 text-sm">{genreResults.error}</p>
            </div>
          )}

          {genreResults && !genreLoading && genreResults.tracks && (
            <div className="bg-zinc-800/50 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-700">
                <h3 className="font-semibold">
                  <span className="text-purple-400">{genreResults.genre}</span>
                  {' — '}
                  {genreResults.tracks.length} unheard tracks
                </h3>
              </div>
              <div className="divide-y divide-zinc-700/50">
                {genreResults.tracks.slice(0, 20).map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i + 1} />
                ))}
              </div>
              {genreResults.tracks.length === 0 && (
                <div className="p-6 text-center text-zinc-500 text-sm">
                  No unheard tracks found in this genre. You might already know them all!
                </div>
              )}
            </div>
          )}
        </>
      )}

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

function TrackRow({ track, index }: { track: SpotifyTrackResult; index: number }) {
  const albumImage = track.album.images?.[2]?.url || track.album.images?.[0]?.url;

  return (
    <SpotifyLink
      type="track"
      id={track.id}
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
    </SpotifyLink>
  );
}

function AlbumCard({ album }: { album: SpotifyAlbumResult }) {
  const image = album.images?.[1]?.url || album.images?.[0]?.url;

  return (
    <SpotifyLink
      type="album"
      id={album.id}
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
    </SpotifyLink>
  );
}
