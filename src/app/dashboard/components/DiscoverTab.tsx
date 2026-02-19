'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import GapCards from './gap-cards';
import DiscographyGaps from './discography-gaps';
import SpotifyLink from './SpotifyLink';
import InfoTooltip from './InfoTooltip';
import { GENRE_DESCRIPTIONS } from '@/lib/genre-descriptions';

type PhaseStatus = 'idle' | 'loading' | 'done' | 'error';
type DiscoverMode = 'songs' | 'albums' | 'artists' | 'genres';

interface Track {
  id: string;
  name: string;
  popularity?: number;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date?: string;
  };
  external_urls: { spotify: string };
}

interface SpotifyArtistResult {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
  followers?: { total: number };
  external_urls: { spotify: string };
}

interface BlindSpot {
  genre: string;
  reason: 'untouched' | 'adjacent';
  adjacentTo?: string;
}

interface DiscographyAlbum {
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  albumImage?: string;
  releaseDate?: string;
  totalTracks: number;
  unheardCount: number;
  spotifyUrl?: string;
}

export interface DiscoverTabProps {
  allGenres: { genre: string; count: number }[];
  blindSpots: BlindSpot[];
  genresStatus: PhaseStatus;
  exploreResult: { genre: string; tracks: Track[]; total: number; error?: string } | null;
  exploring: boolean;
  activeGenre: string | null;
  onExplore: (genre: string) => void;
  onExploreDecade: (decade: string) => void;
  onClearExplore: () => void;
  heardTracks: Set<string>;
  heardArtists: Set<string>;
  session: { accessToken: string } | null;
  onAddToPlaylist?: (track: Track) => void;
  collectedTrackIds?: Set<string>;
  discographyAlbums: DiscographyAlbum[];
  discographyArtistsScanned: number;
  discographyStatus: PhaseStatus;
  loadDiscography: () => void;
}

type FamiliarFilter = 'all' | 'familiar' | 'unknown';

const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

export default function DiscoverTab(props: DiscoverTabProps) {
  const {
    allGenres, blindSpots, genresStatus,
    exploreResult, exploring, activeGenre,
    onExplore, onExploreDecade, onClearExplore,
    heardTracks, heardArtists,
    session,
    onAddToPlaylist, collectedTrackIds,
    discographyAlbums, discographyArtistsScanned, discographyStatus, loadDiscography,
  } = props;

  const resultsRef = useRef<HTMLDivElement>(null);
  const [familiarFilter, setFamiliarFilter] = useState<FamiliarFilter>('all');
  const [mode, setMode] = useState<DiscoverMode>('songs');

  // ─── Genre Gravity state ────────────────────────────────────
  const [genreA, setGenreA] = useState('');
  const [genreB, setGenreB] = useState('');
  const [gravityBias, setGravityBias] = useState(50);
  const [gravityResult, setGravityResult] = useState<Track[] | null>(null);
  const [gravityLoading, setGravityLoading] = useState(false);
  const gravityTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Artist search state ────────────────────────────────────
  const [artistResults, setArtistResults] = useState<SpotifyArtistResult[] | null>(null);
  const [artistSearching, setArtistSearching] = useState(false);
  const [artistGenre, setArtistGenre] = useState<string | null>(null);
  const [artistError, setArtistError] = useState<string | null>(null);

  // ─── Albums shuffle state ───────────────────────────────────
  const [albumSeed, setAlbumSeed] = useState(0);

  const filteredTracks = useMemo(() => {
    const unheard = exploreResult?.tracks.filter((t) => !heardTracks.has(t.id)) ?? [];
    if (familiarFilter === 'all') return unheard;
    if (familiarFilter === 'familiar') return unheard.filter((t) => t.artists.some((a) => heardArtists.has(a.id)));
    return unheard.filter((t) => !t.artists.some((a) => heardArtists.has(a.id)));
  }, [exploreResult, heardTracks, heardArtists, familiarFilter]);

  const shuffledAlbums = useMemo(() => {
    if (discographyAlbums.length === 0) return [];
    const arr = [...discographyAlbums];
    let seed = albumSeed;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      const j = seed % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [discographyAlbums, albumSeed]);

  // ─── Genre Gravity search ────────────────────────────────────
  const searchGravity = useCallback(async () => {
    if (!session || !genreA || !genreB) return;
    setGravityLoading(true);
    try {
      const q = gravityBias <= 33
        ? `genre:"${genreA}"`
        : gravityBias >= 67
          ? `genre:"${genreB}"`
          : `genre:"${genreA}" genre:"${genreB}"`;
      const res = await fetch(`/api/discover/search-only?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGravityResult(data.tracks ?? []);
      }
    } catch { /* swallow */ } finally {
      setGravityLoading(false);
    }
  }, [session, genreA, genreB, gravityBias]);

  const handleGravitySlider = useCallback((val: number) => {
    setGravityBias(val);
    if (gravityTimeout.current) clearTimeout(gravityTimeout.current);
    if (genreA && genreB) {
      gravityTimeout.current = setTimeout(() => searchGravity(), 400);
    }
  }, [genreA, genreB, searchGravity]);

  // ─── Artist search ──────────────────────────────────────────
  const searchArtists = useCallback(async (genre: string) => {
    if (!session) return;
    setArtistSearching(true);
    setArtistGenre(genre);
    setArtistError(null);
    setArtistResults(null);
    try {
      const res = await fetch(`/api/discover/search-only?genre=${encodeURIComponent(genre)}&type=artist`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Search failed (${res.status})`);
      }
      const data = await res.json();
      const results = ((data.artists ?? []) as SpotifyArtistResult[])
        .filter(Boolean)
        .map((a) => ({ ...a, genres: a.genres ?? [] }));
      setArtistResults(results.filter((a) => a?.id && !heardArtists.has(a.id)));
    } catch (err) {
      console.error('[Artist Search]', err);
      setArtistError(err instanceof Error ? err.message : 'Search failed');
      setArtistResults([]);
    } finally {
      setArtistSearching(false);
    }
  }, [session, heardArtists]);

  const genreNames = useMemo(() => allGenres.map((g) => g.genre), [allGenres]);

  useEffect(() => {
    if (exploreResult && !exploring) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [exploreResult, exploring]);

  const modes: { id: DiscoverMode; label: string }[] = [
    { id: 'songs', label: 'Songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'genres', label: 'Genres' },
  ];

  return (
    <div className="space-y-8">
      {/* Mode bar */}
      <div className="flex items-center justify-center gap-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`
              px-5 py-2.5 rounded-lg text-sm font-semibold transition-all border
              ${mode === m.id
                ? 'bg-green-500/20 border-green-500/40 text-green-400 shadow-lg shadow-green-500/5'
                : 'bg-zinc-900/40 border-zinc-800/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600/50'
              }
            `}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ─────────────────────── SONGS MODE ─────────────────────── */}
      {mode === 'songs' && (
        <div className="space-y-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <h2 className="text-xl font-bold tracking-tight">Discover Songs</h2>
              <InfoTooltip
                text="Searches Spotify for tracks in a genre or decade, then filters out anything already in your profile. 'Unheard' means the track ID wasn't found in your top tracks, saved library, or playlists."
                detail="Results are limited by Spotify's dev mode search cap (10 per page, 3 pages max = 30 results)."
              />
            </div>
            <p className="text-zinc-400 text-sm">pick a genre or decade to find tracks you haven&apos;t heard</p>
          </div>

          {/* Decade pills */}
          {genresStatus === 'done' && (
            <section>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest text-center mb-3">
                By Decade
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {DECADES.map((decade) => (
                  <button
                    key={decade}
                    onClick={() => onExploreDecade(decade)}
                    disabled={exploring}
                    className={`
                      px-4 py-2 rounded-full text-xs font-semibold transition-all border
                      ${activeGenre === decade
                        ? 'bg-green-500 text-black border-green-500'
                        : 'bg-zinc-800/70 text-zinc-400 border-zinc-700/50 hover:bg-zinc-700/70 hover:text-zinc-200 hover:border-zinc-600'}
                      disabled:opacity-50
                    `}
                  >
                    {decade}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Genre picker */}
          {genresStatus === 'done' && allGenres.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest text-center mb-3">
                By Genre
              </h3>
              <div className="flex flex-wrap justify-center gap-1.5">
                {allGenres.slice(0, 24).map(({ genre, count }) => (
                  <button
                    key={genre}
                    onClick={() => onExplore(genre)}
                    disabled={exploring}
                    title={GENRE_DESCRIPTIONS[genre] || undefined}
                    className={`
                      px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border
                      ${activeGenre === genre
                        ? 'bg-green-500 text-black border-green-500'
                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40 hover:bg-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600'}
                      disabled:opacity-50
                    `}
                  >
                    {genre} <span className="opacity-50">({count})</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Familiar/Unknown Filter */}
          {exploreResult && !exploring && filteredTracks.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <InfoTooltip
                text="'Familiar Artists' shows unheard tracks by artists already in your profile. 'New Artists' shows tracks by artists you've never listened to. Useful for deciding how far outside your comfort zone to explore."
                className="mr-1"
              />
              {(['all', 'familiar', 'unknown'] as FamiliarFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFamiliarFilter(f)}
                  className={`
                    px-4 py-1.5 rounded-full text-xs font-semibold transition-all border
                    ${familiarFilter === f
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'bg-zinc-900/40 border-zinc-800/40 text-zinc-500 hover:text-zinc-300'}
                  `}
                >
                  {f === 'all' ? 'All' : f === 'familiar' ? 'Familiar Artists' : 'New Artists'}
                </button>
              ))}
            </div>
          )}

          {/* Explore results */}
          <div ref={resultsRef}>
            {exploring && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-500" />
                <p className="text-zinc-400 text-sm mt-3">
                  searching <span className="text-green-400 font-medium">{activeGenre}</span>...
                </p>
              </div>
            )}

            {exploreResult && !exploring && (
              <section className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800/40 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-200">
                      <span className="text-green-400">{exploreResult.genre}</span>
                      <span className="text-zinc-500 text-sm font-normal ml-2">
                        {filteredTracks.length} unheard / {exploreResult.total} found
                      </span>
                    </h3>
                    {GENRE_DESCRIPTIONS[exploreResult.genre] && (
                      <p className="text-zinc-400 text-xs mt-0.5 italic">{GENRE_DESCRIPTIONS[exploreResult.genre]}</p>
                    )}
                    {exploreResult.error && (
                      <p className="text-red-400 text-xs mt-0.5">{exploreResult.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionButton onClick={() => onExplore(exploreResult.genre)} disabled={exploring} icon="shuffle">
                      Shuffle
                    </ActionButton>
                    <ActionButton onClick={onClearExplore} icon="clear" variant="muted">
                      Clear
                    </ActionButton>
                  </div>
                </div>

                {filteredTracks.length > 0 && (
                  <div className="divide-y divide-zinc-800/30">
                    {filteredTracks.slice(0, 20).map((track, i) => {
                      const img = track.album.images?.[2]?.url || track.album.images?.[0]?.url;
                      const isCollected = collectedTrackIds?.has(track.id);
                      return (
                        <div key={track.id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/30 transition-colors group">
                          <SpotifyLink
                            type="track"
                            id={track.id}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <span className="text-zinc-600 w-5 text-right text-xs font-mono">{i + 1}</span>
                            {img && (
                              <img src={img} alt={track.album.name} className="w-10 h-10 rounded shadow-lg group-hover:shadow-green-500/10 transition-shadow" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-green-400 transition-colors">{track.name}</p>
                              <p className="text-zinc-500 text-xs truncate">
                                {track.artists.map((a) => a.name).join(', ')}
                                {track.album.release_date && <span className="text-zinc-600"> &middot; {track.album.release_date.slice(0, 4)}</span>}
                              </p>
                            </div>
                          </SpotifyLink>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {onAddToPlaylist && (
                              <button
                                onClick={() => onAddToPlaylist(track)}
                                disabled={isCollected}
                                className={`
                                  px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border
                                  ${isCollected
                                    ? 'bg-green-500/10 border-green-500/20 text-green-500/60 cursor-default'
                                    : 'bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20 hover:border-green-500/40'}
                                `}
                                title={isCollected ? 'Added to playlist' : 'Add to playlist'}
                              >
                                {isCollected ? '\u2713 Added' : '+ Add'}
                              </button>
                            )}
                            <SpotifyLink
                              type="track"
                              id={track.id}
                              className="p-1.5 rounded-md text-zinc-600 hover:text-green-400 hover:bg-green-500/10 transition-all"
                              title="Open in Spotify"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </SpotifyLink>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredTracks.length === 0 && !exploreResult.error && (
                  <div className="text-center py-8">
                    <p className="text-zinc-400 text-sm">no unheard tracks found for <span className="text-green-400">{exploreResult.genre}</span></p>
                    <p className="text-zinc-500 text-xs mt-1">
                      {familiarFilter !== 'all'
                        ? 'try changing the filter above'
                        : 'you might already own this genre.'}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Genre Gravity */}
          {genresStatus === 'done' && allGenres.length >= 2 && (
            <section className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl p-6">
              <div className="flex items-center justify-center gap-1 mb-1">
                <h3 className="text-base font-bold text-zinc-200 tracking-tight">
                  Genre Gravity
                </h3>
                <InfoTooltip
                  text="Blends two genres using Spotify's search. Sliding toward one genre weights the search query to favor that style. The middle position searches for tracks tagged with both genres."
                  detail="At ≤33%: searches Genre A only. At ≥67%: Genre B only. Between: searches both."
                />
              </div>
              <p className="text-zinc-400 text-sm text-center mb-5">
                pick two genres and slide between them to discover tracks at the intersection
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                <select
                  value={genreA}
                  onChange={(e) => setGenreA(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 flex-1 w-full sm:w-auto"
                >
                  <option value="">Genre A</option>
                  {genreNames.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={gravityBias}
                  onChange={(e) => handleGravitySlider(Number(e.target.value))}
                  className="w-full sm:flex-1 accent-green-500"
                  disabled={!genreA || !genreB}
                />

                <select
                  value={genreB}
                  onChange={(e) => setGenreB(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 flex-1 w-full sm:w-auto"
                >
                  <option value="">Genre B</option>
                  {genreNames.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {genreA && genreB && (
                <div className="text-center mb-4">
                  <ActionButton onClick={searchGravity} disabled={gravityLoading}>
                    {gravityLoading ? 'Searching...' : 'Search'}
                  </ActionButton>
                </div>
              )}

              {gravityResult && gravityResult.length > 0 && (
                <div className="divide-y divide-zinc-800/30 rounded-lg overflow-hidden border border-zinc-800/30">
                  {gravityResult.filter((t) => !heardTracks.has(t.id)).slice(0, 10).map((track, i) => {
                    const img = track.album.images?.[2]?.url || track.album.images?.[0]?.url;
                    const isCollected = collectedTrackIds?.has(track.id);
                    return (
                      <div key={track.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors group">
                        <SpotifyLink
                          type="track"
                          id={track.id}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          <span className="text-zinc-600 w-4 text-right text-xs font-mono">{i + 1}</span>
                          {img && (
                            <img src={img} alt={track.album.name} className="w-9 h-9 rounded shadow" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-green-400 transition-colors">{track.name}</p>
                            <p className="text-zinc-500 text-xs truncate">{track.artists.map((a) => a.name).join(', ')}</p>
                          </div>
                        </SpotifyLink>
                        {onAddToPlaylist && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAddToPlaylist(track); }}
                            disabled={isCollected}
                            className={`
                              flex-shrink-0 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border
                              ${isCollected
                                ? 'bg-green-500/10 border-green-500/20 text-green-500/60 cursor-default'
                                : 'bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20 hover:border-green-500/40'}
                            `}
                          >
                            {isCollected ? '\u2713 Added' : '+ Add'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {gravityResult && gravityResult.filter((t) => !heardTracks.has(t.id)).length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-3">no unheard results found — try a different combo</p>
              )}
            </section>
          )}

          {genresStatus !== 'done' && (
            <div className="text-center py-12 space-y-3">
              <p className="text-zinc-400 text-sm">Analyze your genres to unlock song discovery.</p>
              <p className="text-zinc-500 text-xs">Head to <span className="text-green-400 font-medium">Your Ear</span> and run the profile steps.</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────── ALBUMS MODE ─────────────────────── */}
      {mode === 'albums' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <h2 className="text-xl font-bold tracking-tight">Discover Albums</h2>
              <InfoTooltip
                text="Scans the discographies of your top 5 artists and compares album tracks against your profile. Albums with tracks you haven't heard show up as 'gaps'."
                detail="Only full albums are checked (not singles/compilations). Up to 5 albums per artist, limited to 10 albums per artist from Spotify's API."
              />
            </div>
            <p className="text-zinc-400 text-sm">albums you missed from your top artists</p>
          </div>

          {discographyStatus === 'done' ? (
            discographyAlbums.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <ActionButton onClick={() => setAlbumSeed((s) => s + 1)} icon="shuffle">
                    Shuffle Order
                  </ActionButton>
                  <ActionButton onClick={loadDiscography} variant="muted">
                    Re-scan
                  </ActionButton>
                </div>
                <p className="text-center text-zinc-500 text-xs">
                  {discographyAlbums.length} albums from {discographyArtistsScanned} artists
                </p>
                <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-xl p-5">
                  <DiscographyGaps albums={shuffledAlbums} artistsScanned={discographyArtistsScanned} />
                </div>
              </section>
            ) : (
              <div className="text-center py-10">
                <p className="text-zinc-400 text-sm font-medium mb-1">no gaps found.</p>
                <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                  we scanned {discographyArtistsScanned} of your top artists and couldn&apos;t find albums
                  you haven&apos;t already heard. completionist status: earned.
                </p>
                <div className="mt-4">
                  <ActionButton onClick={loadDiscography}>
                    Re-scan
                  </ActionButton>
                </div>
              </div>
            )
          ) : discographyStatus === 'loading' ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-500" />
              <p className="text-zinc-400 text-sm mt-3">scanning discographies...</p>
            </div>
          ) : genresStatus === 'done' ? (
            <div className="text-center py-12 space-y-4">
              <p className="text-zinc-400 text-sm">Ready to scan your top artists&apos; discographies.</p>
              <ActionButton onClick={loadDiscography}>
                Scan Discographies
              </ActionButton>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-zinc-400 text-sm">Analyze your genres to unlock album discovery.</p>
              <p className="text-zinc-500 text-xs">Head to <span className="text-green-400 font-medium">Your Ear</span> and run the profile steps.</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────── ARTISTS MODE ─────────────────────── */}
      {mode === 'artists' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <h2 className="text-xl font-bold tracking-tight">Discover Artists</h2>
              <InfoTooltip
                text="Searches Spotify for artists in a genre, then filters out any artist already in your profile (top artists, followed, or appearing in your tracks)."
                detail="Spotify's dev mode limits search to 10 results per query. Artist genres may be empty in dev mode."
              />
            </div>
            <p className="text-zinc-400 text-sm">find new artists in your genres that you haven&apos;t listened to</p>
          </div>

          {genresStatus === 'done' && allGenres.length > 0 ? (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {allGenres.slice(0, 20).map(({ genre }) => (
                  <button
                    key={genre}
                    onClick={() => searchArtists(genre)}
                    disabled={artistSearching}
                    className={`
                      px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border
                      ${artistGenre === genre
                        ? 'bg-green-500 text-black border-green-500'
                        : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40 hover:bg-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600'}
                      disabled:opacity-50
                    `}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              {artistSearching && (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-500" />
                  <p className="text-zinc-400 text-sm mt-3">
                    finding artists in <span className="text-green-400 font-medium">{artistGenre}</span>...
                  </p>
                </div>
              )}

              {artistError && !artistSearching && (
                <div className="text-center py-4">
                  <p className="text-red-400 text-sm">{artistError}</p>
                </div>
              )}

              {artistResults && !artistSearching && !artistError && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-zinc-400 text-sm">
                      <span className="text-green-400 font-medium">{artistGenre}</span>
                      <span className="text-zinc-500 ml-2">{artistResults.length} artists you haven&apos;t heard</span>
                    </p>
                    <ActionButton onClick={() => artistGenre && searchArtists(artistGenre)} disabled={artistSearching} icon="shuffle" variant="muted">
                      Refresh
                    </ActionButton>
                  </div>

                  {artistResults.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {artistResults.slice(0, 16).map((artist) => {
                        const img = artist.images?.[1]?.url || artist.images?.[0]?.url;
                        const followers = artist.followers?.total;
                        return (
                          <SpotifyLink
                            key={artist.id}
                            type="artist"
                            id={artist.id}
                            className="group flex items-center gap-4 bg-zinc-900/50 border border-zinc-800/40 rounded-xl p-3 hover:border-green-500/30 hover:bg-zinc-800/40 transition-all"
                          >
                            {img ? (
                              <img src={img} alt={artist.name} className="w-16 h-16 rounded-full shadow-lg group-hover:shadow-green-500/10 object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 text-xl flex-shrink-0">
                                &#x266B;
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-zinc-200 truncate group-hover:text-green-400 transition-colors">{artist.name}</p>
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
                          </SpotifyLink>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-zinc-400 text-sm">no new artists found for <span className="text-green-400">{artistGenre}</span></p>
                      <p className="text-zinc-500 text-xs mt-1">try a different genre — you might know everyone here already</p>
                    </div>
                  )}
                </section>
              )}

              {!artistResults && !artistSearching && !artistError && (
                <div className="text-center py-8">
                  <p className="text-zinc-500 text-sm">pick a genre above to discover new artists</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-zinc-400 text-sm">Analyze your genres to unlock artist discovery.</p>
              <p className="text-zinc-500 text-xs">Head to <span className="text-green-400 font-medium">Your Ear</span> and run the profile steps.</p>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────── GENRES MODE ─────────────────────── */}
      {mode === 'genres' && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <h2 className="text-xl font-bold tracking-tight">Discover Genres</h2>
              <InfoTooltip
                text="Identifies genres you haven't explored yet. 'Just next door' genres are adjacent to ones you already listen to (e.g., if you like rock, grunge is next door). 'Uncharted territory' are randomly selected genres with no connection to your profile."
                detail="Adjacency is based on a hand-curated map of ~30 genre relationships."
              />
            </div>
            <p className="text-zinc-400 text-sm">genres hiding just outside your comfort zone</p>
          </div>

          {genresStatus === 'done' && blindSpots.length > 0 ? (
            <GapCards
              blindSpots={blindSpots}
              onExplore={(genre) => { setMode('songs'); onExplore(genre); }}
              exploring={exploring}
              activeGenre={activeGenre}
            />
          ) : genresStatus === 'done' ? (
            <div className="text-center py-10">
              <p className="text-zinc-400 text-sm font-medium mb-1">no blind spots detected.</p>
              <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                you&apos;ve got great coverage across your genre map. keep exploring to stay ahead.
              </p>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-zinc-400 text-sm">Analyze your genres to unlock genre discovery.</p>
              <p className="text-zinc-500 text-xs">Head to <span className="text-green-400 font-medium">Your Ear</span> and run the profile steps.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

// ─── Reusable action button ───────────────────────────────────

function ActionButton({
  onClick, disabled, children, icon, variant = 'primary',
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  icon?: 'shuffle' | 'clear';
  variant?: 'primary' | 'muted';
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border
        ${variant === 'primary'
          ? 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25 hover:border-green-500/50'
          : 'bg-zinc-800/50 border-zinc-700/40 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {icon === 'shuffle' && (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
      {icon === 'clear' && (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {children}
    </button>
  );
}
