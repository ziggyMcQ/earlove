'use client';

import { useState, useRef, useCallback } from 'react';
import SpotifyLink from './SpotifyLink';
import InfoTooltip from './InfoTooltip';

interface Artist {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
  followers?: { total: number };
  external_urls: { spotify: string };
}

interface Track {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string; width: number; height: number }[] };
  external_urls: { spotify: string };
}

export interface SeedTabProps {
  session: { accessToken: string } | null;
  heardArtists: Set<string>;
  heardTracks: Set<string>;
  onAddToPlaylist?: (track: Track) => void;
  collectedTrackIds?: Set<string>;
}

export default function SeedTab({
  session,
  heardArtists,
  heardTracks,
  onAddToPlaylist,
  collectedTrackIds,
}: SeedTabProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [searching, setSearching] = useState(false);

  const [seedArtist, setSeedArtist] = useState<Artist | null>(null);
  const [relatedArtists, setRelatedArtists] = useState<Artist[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedArtist, setExpandedArtist] = useState<string | null>(null);
  const [artistTracks, setArtistTracks] = useState<Record<string, Track[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);

  const [filterKnown, setFilterKnown] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchArtists = useCallback(async (q: string) => {
    if (!session || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/discover/search-only?q=${encodeURIComponent(q)}&type=artist`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults((data.artists ?? []).slice(0, 6));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [session]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => searchArtists(value), 350);
  };

  const selectSeed = async (artist: Artist) => {
    setSeedArtist(artist);
    setSearchResults([]);
    setQuery('');
    setRelatedArtists([]);
    setExpandedArtist(null);
    setArtistTracks({});
    setError(null);
    setLoadingRelated(true);

    try {
      const res = await fetch(`/api/discover/seed?artistId=${artist.id}`, {
        headers: { Authorization: `Bearer ${session!.accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      setRelatedArtists(data.artists ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load related artists');
    } finally {
      setLoadingRelated(false);
    }
  };

  const loadTopTracks = async (artistId: string) => {
    if (artistTracks[artistId]) {
      setExpandedArtist(expandedArtist === artistId ? null : artistId);
      return;
    }
    setExpandedArtist(artistId);
    setLoadingTracks(artistId);
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/top-tracks`,
        { headers: { Authorization: `Bearer ${session!.accessToken}` } }
      );
      if (!res.ok) throw new Error('Failed to load tracks');
      const data = await res.json();
      setArtistTracks((prev) => ({ ...prev, [artistId]: data.tracks ?? [] }));
    } catch {
      setArtistTracks((prev) => ({ ...prev, [artistId]: [] }));
    } finally {
      setLoadingTracks(null);
    }
  };

  const displayed = filterKnown
    ? relatedArtists.filter((a) => !heardArtists.has(a.id))
    : relatedArtists;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          <h2 className="text-xl font-bold tracking-tight">Seed</h2>
          <InfoTooltip
            text="Enter an artist you love and discover similar artists you haven't heard yet. Uses Spotify's related artists data, filtered against your listening profile."
            detail="Results come from Spotify's 'Related Artists' endpoint (up to 20 per seed). Expand any artist to preview their top tracks."
          />
        </div>
        <p className="text-zinc-400 text-sm">start with an artist, discover what&apos;s adjacent</p>
      </div>

      {/* Search input */}
      <div className="relative max-w-md mx-auto">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="search for an artist..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-green-500/50 transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b border-green-500" />
            </div>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
            {searchResults.map((artist) => {
              const img = artist.images?.[2]?.url || artist.images?.[0]?.url;
              return (
                <button
                  key={artist.id}
                  onClick={() => selectSeed(artist)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                >
                  {img ? (
                    <img src={img} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">&#x266B;</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{artist.name}</p>
                    {artist.genres?.length > 0 && (
                      <p className="text-[10px] text-zinc-500 truncate">{artist.genres.slice(0, 3).join(', ')}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Seed artist display */}
      {seedArtist && (
        <div className="flex items-center justify-center gap-3 py-2">
          {(() => { const img = seedArtist.images?.[1]?.url || seedArtist.images?.[0]?.url; return img ? (
            <img src={img} alt={seedArtist.name} className="w-12 h-12 rounded-full object-cover shadow-lg" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600">&#x266B;</div>
          ); })()}
          <div>
            <p className="text-sm font-semibold text-green-400">{seedArtist.name}</p>
            {seedArtist.genres?.length > 0 && (
              <p className="text-xs text-zinc-500">{seedArtist.genres.slice(0, 3).join(', ')}</p>
            )}
          </div>
          <button
            onClick={() => { setSeedArtist(null); setRelatedArtists([]); setExpandedArtist(null); setArtistTracks({}); }}
            className="ml-2 text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
            title="Clear seed"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading */}
      {loadingRelated && (
        <div className="flex items-center justify-center gap-2 py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-b border-green-500" />
          <span className="text-zinc-500 text-sm">finding related artists...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Filter toggle + results */}
      {relatedArtists.length > 0 && !loadingRelated && (
        <>
          <div className="flex items-center justify-between max-w-md mx-auto">
            <p className="text-zinc-500 text-xs">
              {displayed.length} artist{displayed.length !== 1 ? 's' : ''}
              {filterKnown && relatedArtists.length !== displayed.length && (
                <span className="text-zinc-600"> ({relatedArtists.length - displayed.length} you already know filtered out)</span>
              )}
            </p>
            <button
              onClick={() => setFilterKnown(!filterKnown)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterKnown
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              {filterKnown ? 'new only' : 'show all'}
            </button>
          </div>

          <div className="space-y-2">
            {displayed.map((artist) => {
              const img = artist.images?.[1]?.url || artist.images?.[0]?.url;
              const followers = artist.followers?.total;
              const isExpanded = expandedArtist === artist.id;
              const tracks = artistTracks[artist.id];
              const isLoading = loadingTracks === artist.id;
              const known = heardArtists.has(artist.id);

              return (
                <div key={artist.id} className="rounded-xl border border-zinc-800/40 overflow-hidden">
                  {/* Artist row */}
                  <div className={`flex items-center gap-4 p-3 transition-all ${known ? 'bg-zinc-900/30 opacity-60' : 'bg-zinc-900/50 hover:bg-zinc-800/40'}`}>
                    <SpotifyLink type="artist" id={artist.id} className="flex-shrink-0">
                      {img ? (
                        <img src={img} alt={artist.name} className="w-14 h-14 rounded-full shadow-lg object-cover hover:shadow-green-500/10 transition-shadow" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 text-lg">&#x266B;</div>
                      )}
                    </SpotifyLink>
                    <div className="min-w-0 flex-1">
                      <SpotifyLink type="artist" id={artist.id}>
                        <p className="text-sm font-semibold text-zinc-200 truncate hover:text-green-400 transition-colors">{artist.name}</p>
                      </SpotifyLink>
                      {followers != null && followers > 0 && (
                        <p className="text-xs text-zinc-500 mt-0.5">{formatFollowers(followers)} followers</p>
                      )}
                      {artist.genres?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {artist.genres.slice(0, 3).map((g) => (
                            <span key={g} className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/50">{g}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => loadTopTracks(artist.id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isExpanded
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-zinc-700/40 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                      }`}
                    >
                      {isLoading ? (
                        <span className="animate-spin inline-block w-3 h-3 border-b border-current rounded-full" />
                      ) : isExpanded ? 'hide tracks' : 'top tracks'}
                    </button>
                  </div>

                  {/* Expanded tracks */}
                  {isExpanded && tracks && (
                    <div className="border-t border-zinc-800/40 bg-zinc-950/50 divide-y divide-zinc-800/30">
                      {tracks.length > 0 ? tracks.slice(0, 5).map((track, i) => {
                        const albumImg = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
                        const collected = collectedTrackIds?.has(track.id);
                        const heard = heardTracks.has(track.id);
                        return (
                          <div key={track.id} className={`flex items-center gap-3 px-4 py-2 ${heard ? 'opacity-40' : ''}`}>
                            <span className="text-[10px] text-zinc-600 w-4 text-right">{i + 1}</span>
                            {albumImg && <img src={albumImg} alt="" className="w-8 h-8 rounded shadow-sm" />}
                            <div className="min-w-0 flex-1">
                              <SpotifyLink type="track" id={track.id}>
                                <p className="text-xs font-medium text-zinc-300 truncate hover:text-green-400 transition-colors">{track.name}</p>
                              </SpotifyLink>
                              <p className="text-[10px] text-zinc-600 truncate">{track.album?.name}</p>
                            </div>
                            {heard && <span className="text-[9px] text-zinc-600">heard</span>}
                            {!heard && onAddToPlaylist && (
                              <button
                                onClick={() => onAddToPlaylist(track)}
                                disabled={collected}
                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all border ${
                                  collected
                                    ? 'border-green-500/30 bg-green-500/15 text-green-400'
                                    : 'border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-green-400 hover:border-green-500/40'
                                }`}
                                title={collected ? 'Added to playlist' : 'Add to playlist'}
                              >
                                {collected ? '✓' : '+'}
                              </button>
                            )}
                          </div>
                        );
                      }) : (
                        <div className="px-4 py-3 text-center">
                          <p className="text-xs text-zinc-500">no top tracks available</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {!seedArtist && !loadingRelated && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-2xl text-zinc-700">
            &#x266B;
          </div>
          <p className="text-zinc-500 text-sm">type an artist name above to start exploring</p>
          <p className="text-zinc-600 text-xs mt-1">we&apos;ll find up to 20 related artists and let you preview their top tracks</p>
        </div>
      )}

      {/* No results */}
      {seedArtist && !loadingRelated && relatedArtists.length === 0 && !error && (
        <div className="text-center py-8">
          <p className="text-zinc-400 text-sm">no related artists found for <span className="text-green-400">{seedArtist.name}</span></p>
          <p className="text-zinc-500 text-xs mt-1">try a different artist — this one might be too niche for Spotify&apos;s data</p>
        </div>
      )}
    </div>
  );
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
