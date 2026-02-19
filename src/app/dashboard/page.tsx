'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, clearSession } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import YourEarTab from './components/YourEarTab';
import DiscoverTab from './components/DiscoverTab';
import CurateTab from './components/CurateTab';
import SeedTab from './components/SeedTab';
import { loadCache, saveCache, clearCache, cacheAge, CachedProfile, PopularityTrack } from '@/lib/profile-cache';
import { SPOTIFY_GENRES } from '@/lib/genres';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'earlove';

/* eslint-disable @typescript-eslint/no-explicit-any */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 429) throw new Error('rate_limit');
    if (res.status === 401) throw new Error('session_expired');
    if (res.status === 502 || res.status === 504) throw new Error('Server timed out — Spotify may be slow, retry in a moment');
    throw new Error(`Server error (${res.status}) — try again in a few seconds`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────────

interface GenreRadarPoint { genre: string; weight: number; rawCount: number; artists: string[]; }
interface DecadeBucket { decade: string; count: number; percentage: number; }
interface BlindSpot { genre: string; reason: 'untouched' | 'adjacent'; adjacentTo?: string; }
interface Track {
  id: string; name: string; popularity?: number;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string; width: number; height: number }[]; release_date?: string; };
  external_urls: { spotify: string };
}
interface DiscographyAlbum {
  artist: string; artistId: string; album: string; albumId: string;
  albumImage?: string; releaseDate?: string; totalTracks: number; unheardCount: number; spotifyUrl?: string;
}
interface MainstreamGenreResult {
  genre: string; searchedTracks: number; heardTracks: number; knownArtistTracks: number;
  overlapPercent: number; unheardExamples: { name: string; artist: string; url: string }[];
}
interface MainstreamResult {
  overallScore: number; label: string; genres: MainstreamGenreResult[];
  totalSearched: number; totalOverlap: number; buildTime: number;
}
interface TasteDriftRange { id: string; name: string; genres: string[]; }

type PhaseStatus = 'idle' | 'loading' | 'done' | 'error';
type TabId = 'ear' | 'discover' | 'curate' | 'seed';

// ─── Component ────────────────────────────────────────────────

export default function Dashboard() {
  const { session, loading: authLoading, logout } = useSession();
  const router = useRouter();

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('ear');

  // User info
  const [user, setUser] = useState<{ id: string; name: string; image: string } | null>(null);

  // Heard data
  const [heardTracks, setHeardTracks] = useState<Set<string>>(new Set());
  const [heardArtists, setHeardArtists] = useState<Set<string>>(new Set());
  const [artistNames, setArtistNames] = useState<Record<string, string>>({});
  const [topArtistIds, setTopArtistIds] = useState<string[]>([]);

  // Timeline
  const [decadeDistribution, setDecadeDistribution] = useState<Map<string, number>>(new Map());
  const [releaseYears, setReleaseYears] = useState<number[]>([]);

  // Banner
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('earlove_banner_dismissed') === '1';
    return false;
  });

  // Cache state
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);

  // Phase statuses
  const [basicsStatus, setBasicsStatus] = useState<PhaseStatus>('idle');
  const [libraryStatus, setLibraryStatus] = useState<PhaseStatus>('idle');
  const [playlistsStatus, setPlaylistsStatus] = useState<PhaseStatus>('idle');
  const [genresStatus, setGenresStatus] = useState<PhaseStatus>('idle');
  const [discographyStatus, setDiscographyStatus] = useState<PhaseStatus>('idle');
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  // Source counts
  const [sources, setSources] = useState({
    topTracksShort: 0, topTracksMedium: 0, topTracksLong: 0,
    recentlyPlayed: 0, followedArtists: 0,
    savedTotal: 0, ownedPlaylists: 0, playlistTracks: 0,
  });

  // Genre data
  const [genreRadar, setGenreRadar] = useState<GenreRadarPoint[]>([]);
  const [allGenres, setAllGenres] = useState<{ genre: string; count: number }[]>([]);
  const [explorerScore, setExplorerScore] = useState(0);
  const [explorerLabel, setExplorerLabel] = useState('');
  const [blindSpots, setBlindSpots] = useState<BlindSpot[]>([]);

  // Popularity (legacy)
  const [trackPopularities, setTrackPopularities] = useState<number[]>([]);
  const [popularityTracks, setPopularityTracks] = useState<PopularityTrack[]>([]);
  const [popularityUnavailable, setPopularityUnavailable] = useState(false);

  // Mainstream analysis
  const [mainstreamResult, setMainstreamResult] = useState<MainstreamResult | null>(null);
  const [mainstreamStatus, setMainstreamStatus] = useState<PhaseStatus>('idle');

  // Discography
  const [discographyAlbums, setDiscographyAlbums] = useState<DiscographyAlbum[]>([]);
  const [discographyArtistsScanned, setDiscographyArtistsScanned] = useState(0);

  // Explore state
  const [exploreResult, setExploreResult] = useState<{ genre: string; tracks: Track[]; total: number; error?: string } | null>(null);
  const [exploring, setExploring] = useState(false);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  // Taste Drift
  const [tasteDriftRanges, setTasteDriftRanges] = useState<TasteDriftRange[] | null>(null);

  // Preloaded artist genres from basics (passed to genre phase to avoid re-fetching)
  const [preloadedArtistGenres, setPreloadedArtistGenres] = useState<{ artistName: string; genres: string[] }[]>([]);

  // Enriched data (accumulated across phases — zero extra API cost)
  const [trackDurations, setTrackDurations] = useState<number[]>([]);
  const [explicitCount, setExplicitCount] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [recentPlayedTimes, setRecentPlayedTimes] = useState<string[]>([]);
  const [earliestSavedAt, setEarliestSavedAt] = useState<string | null>(null);
  const [latestSavedAt, setLatestSavedAt] = useState<string | null>(null);

  // Playlist collector (Curate tab) — persisted in localStorage
  const [collectedTracks, setCollectedTracks] = useState<Track[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('earlove_playlist_tracks');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [playlistCreating, setPlaylistCreating] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistSuccess, setPlaylistSuccess] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem('earlove_playlist_tracks', JSON.stringify(collectedTracks)); } catch {}
  }, [collectedTracks]);

  // Rate limit countdown timer
  useEffect(() => {
    if (!rateLimitUntil) { setRateLimitCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
      setRateLimitCountdown(remaining);
      if (remaining <= 0) setRateLimitUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rateLimitUntil]);

  const collectedTrackIds = new Set(collectedTracks.map((t) => t.id));

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !session) router.replace('/');
  }, [session, authLoading, router]);

  // ─── Cache: save ────────────────────────────────────────────
  const saveCacheSnapshot = useCallback(() => {
    if (basicsStatus !== 'done') return;
    const snapshot: CachedProfile = {
      timestamp: Date.now(),
      heardTrackIds: [...heardTracks],
      heardArtistIds: [...heardArtists],
      user,
      decadeDistribution: Object.fromEntries(decadeDistribution),
      releaseYears,
      sources,
      genreRadar,
      allGenres,
      explorerScore,
      explorerLabel,
      blindSpots,
      phasesDone: {
        basics: basicsStatus === 'done',
        library: libraryStatus === 'done',
        playlists: playlistsStatus === 'done',
        genres: genresStatus === 'done',
      },
      trackPopularities,
      popularityTracks,
      popularityUnavailable: popularityUnavailable || undefined,
      mainstreamResult: mainstreamResult ?? undefined,
      discographyResults: discographyAlbums.length > 0 ? discographyAlbums : undefined,
      trackDurations: trackDurations.length > 0 ? trackDurations : undefined,
      explicitCount: explicitCount > 0 ? explicitCount : undefined,
      totalProcessed: totalProcessed > 0 ? totalProcessed : undefined,
      recentPlayedTimes: recentPlayedTimes.length > 0 ? recentPlayedTimes : undefined,
      earliestSavedAt: earliestSavedAt ?? undefined,
      latestSavedAt: latestSavedAt ?? undefined,
    };
    saveCache(snapshot);
    setCachedAt(snapshot.timestamp);
  }, [basicsStatus, heardTracks, heardArtists, user, decadeDistribution, releaseYears, sources,
      genreRadar, allGenres, explorerScore, explorerLabel, blindSpots,
      libraryStatus, playlistsStatus, genresStatus,
      trackPopularities, popularityTracks, popularityUnavailable,
      mainstreamResult, discographyAlbums,
      trackDurations, explicitCount, totalProcessed, recentPlayedTimes, earliestSavedAt, latestSavedAt]);

  // ─── Cache: restore ─────────────────────────────────────────
  useEffect(() => {
    if (!session || basicsStatus !== 'idle') return;
    const cached = loadCache();
    if (cached && cached.phasesDone.basics) {
      setUser(cached.user);
      setHeardTracks(new Set(cached.heardTrackIds));
      setHeardArtists(new Set(cached.heardArtistIds));
      setDecadeDistribution(new Map(Object.entries(cached.decadeDistribution)));
      setReleaseYears(cached.releaseYears);
      setSources(cached.sources);
      setTrackPopularities(cached.trackPopularities ?? []);
      setPopularityTracks(cached.popularityTracks ?? []);
      if (cached.popularityUnavailable) setPopularityUnavailable(true);

      if (cached.trackDurations) setTrackDurations(cached.trackDurations);
      if (cached.explicitCount) setExplicitCount(cached.explicitCount);
      if (cached.totalProcessed) setTotalProcessed(cached.totalProcessed);
      if (cached.recentPlayedTimes) setRecentPlayedTimes(cached.recentPlayedTimes);
      if (cached.earliestSavedAt) setEarliestSavedAt(cached.earliestSavedAt);
      if (cached.latestSavedAt) setLatestSavedAt(cached.latestSavedAt);

      if (cached.phasesDone.genres) {
        setGenreRadar(cached.genreRadar);
        setAllGenres(cached.allGenres);
        setExplorerScore(cached.explorerScore);
        setExplorerLabel(cached.explorerLabel);
        setBlindSpots(cached.blindSpots);
        setGenresStatus('done');
      }

      if (cached.mainstreamResult) {
        setMainstreamResult(cached.mainstreamResult);
        setMainstreamStatus('done');
      }

      if (cached.discographyResults?.length) {
        setDiscographyAlbums(cached.discographyResults);
        setDiscographyArtistsScanned(cached.discographyResults.length > 0 ? 8 : 0);
        setDiscographyStatus('done');
      }

      setBasicsStatus('done');
      setLibraryStatus(cached.phasesDone.library ? 'done' : 'idle');
      setPlaylistsStatus(cached.phasesDone.playlists ? 'done' : 'idle');
      setCachedAt(cached.timestamp);
      setRestoredFromCache(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Auto-load basics if no cache (skip during rate limit cooldown)
  useEffect(() => {
    if (!session || basicsStatus !== 'idle' || restoredFromCache) return;
    if (rateLimitUntil && Date.now() < rateLimitUntil) return;
    loadBasics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, basicsStatus, restoredFromCache, rateLimitUntil]);

  // ─── Phase 1: Basics ────────────────────────────────────────
  const loadBasics = useCallback(async () => {
    if (!session || basicsStatus === 'loading') return;

    // Don't retry during cooldown
    if (rateLimitUntil && Date.now() < rateLimitUntil) {
      setBasicsStatus('error');
      setPhaseError(`Rate limited — wait ${Math.ceil((rateLimitUntil - Date.now()) / 1000)}s`);
      return;
    }

    setBasicsStatus('loading');
    setWarnings([]);
    setPhaseError(null);
    try {
      const res = await fetch('/api/profile/basics', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await safeJson(res);

      if (res.status === 401 || data?.error === 'Not authenticated') {
        clearSession(); router.replace('/?error=session_expired'); return;
      }
      if (data?.error === 'rate_limit_long' && data?.retryAfter) {
        setRateLimitUntil(Date.now() + data.retryAfter * 1000);
        setPhaseError(`Spotify cooldown: ${Math.ceil(data.retryAfter / 60)} minutes remaining`);
        setBasicsStatus('error');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to load basics');

      setUser(data.user);
      setHeardTracks(new Set(data.trackIds));
      setHeardArtists(new Set(data.artistIds));
      setArtistNames(data.artistNames ?? {});
      setTopArtistIds(data.topArtistIds ?? []);
      setSources((s) => ({
        ...s,
        topTracksShort: data.sources.topTracksShort,
        topTracksMedium: data.sources.topTracksMedium,
        topTracksLong: data.sources.topTracksLong,
        recentlyPlayed: data.sources.recentlyPlayed,
        followedArtists: data.sources.followedArtists,
      }));

      const dd = new Map(Object.entries(data.decadeDistribution).map(([k, v]) => [k, v as number]));
      setDecadeDistribution(dd);
      setReleaseYears(data.releaseYears);

      if (data.trackPopularities?.length > 0) {
        setTrackPopularities(data.trackPopularities);
        setPopularityTracks(data.popularityTracks ?? []);
      }

      if (data.enriched) {
        setTrackDurations(data.enriched.trackDurations ?? []);
        setExplicitCount(data.enriched.explicitCount ?? 0);
        setTotalProcessed(data.enriched.totalProcessed ?? 0);
        setRecentPlayedTimes(data.enriched.recentPlayedTimes ?? []);
      }

      if (data.topArtistsByRange) {
        const ranges = (['short', 'medium', 'long'] as const).map((key) => {
          const artists = data.topArtistsByRange[key] ?? [];
          const genreSet = new Set<string>();
          artists.forEach((a: { genres: string[] }) => a.genres?.forEach((g: string) => genreSet.add(g)));
          return {
            id: key,
            name: key === 'short' ? 'Last 4 weeks' : key === 'medium' ? 'Last 6 months' : 'All time',
            genres: [...genreSet],
          };
        });
        if (ranges.some((r) => r.genres.length > 0)) setTasteDriftRanges(ranges);

        // Collect artist genre data to pass to genre phase (avoids 10 extra API calls)
        const seen = new Set<string>();
        const preloaded: { artistName: string; genres: string[] }[] = [];
        for (const key of ['short', 'medium', 'long'] as const) {
          for (const a of (data.topArtistsByRange[key] ?? []) as { name: string; genres: string[] }[]) {
            if (a.genres?.length > 0 && !seen.has(a.name)) {
              seen.add(a.name);
              preloaded.push({ artistName: a.name, genres: a.genres });
            }
          }
        }
        if (preloaded.length > 0) setPreloadedArtistGenres(preloaded);
      }

      if (data.warnings?.length > 0) setWarnings(data.warnings);

      setRateLimitUntil(null);
      setBasicsStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }

      const isRateLimit = msg === 'rate_limit' || msg.includes('429') || msg.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        const cooldownMs = 90_000;
        setRateLimitUntil(Date.now() + cooldownMs);
        setPhaseError('Spotify rate limit hit — cooling down for 90 seconds');
      } else {
        setPhaseError(msg);
      }
      setBasicsStatus('error');
    }
  }, [session, basicsStatus, router, rateLimitUntil]);

  // ─── Phase 2: Library (chunked) ─────────────────────────────
  const loadLibrary = useCallback(async () => {
    if (!session || libraryStatus === 'loading') return;
    setLibraryStatus('loading');
    setPhaseError('');
    let nextOffset: number | null = 0;
    let totalSaved = 0;
    try {
      while (nextOffset !== null) {
        const res = await fetch(`/api/profile/library?offset=${nextOffset}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Failed');

        setHeardTracks((prev) => { const next = new Set(prev); data.trackIds.forEach((id: string) => next.add(id)); return next; });
        setHeardArtists((prev) => { const next = new Set(prev); data.artistIds.forEach((id: string) => next.add(id)); return next; });
        setArtistNames((prev) => ({ ...prev, ...(data.artistNames ?? {}) }));
        setDecadeDistribution((prev) => {
          const next = new Map(prev);
          for (const [k, v] of Object.entries(data.decadeDistribution)) next.set(k, (next.get(k) ?? 0) + (v as number));
          return next;
        });
        setReleaseYears((prev) => [...prev, ...data.releaseYears]);

        if (data.trackPopularities?.length > 0) {
          setTrackPopularities((prev) => [...prev, ...data.trackPopularities]);
          setPopularityTracks((prev) => [...prev, ...(data.popularityTracks ?? [])]);
        }
        if (data.popularityUnavailable) setPopularityUnavailable(true);

        if (data.enriched) {
          setTrackDurations((prev) => [...prev, ...(data.enriched.trackDurations ?? [])]);
          setExplicitCount((prev) => prev + (data.enriched.explicitCount ?? 0));
          setTotalProcessed((prev) => prev + (data.enriched.totalProcessed ?? 0));
          if (data.enriched.earliestSavedAt) {
            setEarliestSavedAt((prev) => !prev || data.enriched.earliestSavedAt < prev ? data.enriched.earliestSavedAt : prev);
          }
          if (data.enriched.latestSavedAt) {
            setLatestSavedAt((prev) => !prev || data.enriched.latestSavedAt > prev ? data.enriched.latestSavedAt : prev);
          }
        }

        totalSaved = data.savedTotal;
        nextOffset = data.nextOffset;
      }
      setSources((s) => ({ ...s, savedTotal: totalSaved }));
      setLibraryStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Library scan failed';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }
      setLibraryStatus('error');
      setPhaseError(msg === 'rate_limit' ? 'Spotify rate limit — wait a minute and retry' : msg);
    }
  }, [session, libraryStatus, router]);

  // ─── Phase 3: Playlists ─────────────────────────────────────
  const loadPlaylists = useCallback(async () => {
    if (!session || playlistsStatus === 'loading') return;
    setPlaylistsStatus('loading');
    try {
      const res = await fetch('/api/profile/playlists', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');

      setHeardTracks((prev) => { const next = new Set(prev); data.trackIds.forEach((id: string) => next.add(id)); return next; });
      setHeardArtists((prev) => { const next = new Set(prev); data.artistIds.forEach((id: string) => next.add(id)); return next; });
      setArtistNames((prev) => ({ ...prev, ...(data.artistNames ?? {}) }));
      setSources((s) => ({ ...s, ownedPlaylists: data.ownedPlaylists, playlistTracks: data.playlistTracks }));

      setDecadeDistribution((prev) => {
        const next = new Map(prev);
        for (const [k, v] of Object.entries(data.decadeDistribution)) next.set(k, (next.get(k) ?? 0) + (v as number));
        return next;
      });
      setReleaseYears((prev) => [...prev, ...data.releaseYears]);

      if (data.trackPopularities) {
        setTrackPopularities((prev) => [...prev, ...data.trackPopularities]);
        setPopularityTracks((prev) => [...prev, ...(data.popularityTracks ?? [])]);
      }

      if (data.enriched) {
        setTrackDurations((prev) => [...prev, ...(data.enriched.trackDurations ?? [])]);
        setExplicitCount((prev) => prev + (data.enriched.explicitCount ?? 0));
        setTotalProcessed((prev) => prev + (data.enriched.totalProcessed ?? 0));
      }

      setPlaylistsStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Playlist scan failed';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }
      setPlaylistsStatus('error');
      setPhaseError(msg === 'rate_limit' ? 'Spotify rate limit — wait a minute and retry' : msg);
    }
  }, [session, playlistsStatus, router]);

  // ─── Phase 4: Genre Probe ───────────────────────────────────
  const loadGenres = useCallback(async () => {
    if (!session || genresStatus === 'loading') return;
    setGenresStatus('loading');
    try {
      const res = await fetch('/api/profile/genres', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistIds: [...heardArtists],
          preloadedArtistGenres: preloadedArtistGenres.length > 0 ? preloadedArtistGenres : undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');

      const { radar, genres, score, label, spots } = analyzeGenres(data);
      setGenreRadar(radar);
      setAllGenres(genres);
      setExplorerScore(score);
      setExplorerLabel(label);
      setBlindSpots(spots);
      setGenresStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Genre probe failed';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }
      setGenresStatus('error');
      setPhaseError(msg === 'rate_limit' ? 'Spotify rate limit — wait a minute and retry' : msg);
    }
  }, [session, genresStatus, heardArtists, preloadedArtistGenres, router]);

  // ─── Phase 5: Discography Gaps ──────────────────────────────
  const loadDiscography = useCallback(async () => {
    if (!session || discographyStatus === 'loading') return;
    setDiscographyStatus('loading');
    try {
      const artistIdList = topArtistIds.length > 0 ? topArtistIds.slice(0, 8) : [...heardArtists].slice(0, 8);
      const res = await fetch('/api/profile/discography', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topArtistIds: artistIdList, heardTrackIds: [...heardTracks], artistNames }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');

      setDiscographyAlbums(data.albums ?? []);
      setDiscographyArtistsScanned(data.artistsScanned ?? 0);
      setDiscographyStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Discography scan failed';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }
      setDiscographyStatus('error');
      setPhaseError(msg === 'rate_limit' ? 'Spotify rate limit — wait a minute and retry' : msg);
    }
  }, [session, discographyStatus, topArtistIds, heardArtists, heardTracks, artistNames, router]);

  // ─── Mainstream Analysis ────────────────────────────────────
  const loadMainstream = useCallback(async () => {
    if (!session || mainstreamStatus === 'loading' || allGenres.length === 0) return;
    setMainstreamStatus('loading');
    try {
      const topGenreNames = allGenres.slice(0, 8).map((g) => g.genre);
      const res = await fetch('/api/profile/mainstream', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ genres: topGenreNames, heardTrackIds: [...heardTracks], heardArtistIds: [...heardArtists] }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Analysis failed');

      setMainstreamResult(data as MainstreamResult);
      setMainstreamStatus('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mainstream analysis failed';
      if (msg === 'session_expired') { clearSession(); router.replace('/?error=session_expired'); return; }
      setMainstreamStatus('error');
      setPhaseError(msg === 'rate_limit' ? 'Spotify rate limit — wait a minute and retry' : msg);
    }
  }, [session, mainstreamStatus, allGenres, heardTracks, heardArtists, router]);

  // ─── Explore a genre ────────────────────────────────────────
  const explore = useCallback(async (genre: string) => {
    if (!session) return;
    setActiveGenre(genre);
    setExploring(true);
    setExploreResult(null);
    setActiveTab('discover');
    try {
      const res = await fetch(`/api/discover/search-only?genre=${encodeURIComponent(genre)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setExploreResult({ genre, tracks: data.tracks, total: data.total });
    } catch (err) {
      setExploreResult({ genre, tracks: [], total: 0, error: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setExploring(false);
    }
  }, [session]);

  // ─── Explore decade ─────────────────────────────────────────
  const exploreDecade = useCallback(async (decade: string) => {
    if (!session || exploring) return;
    const decadeStart = parseInt(decade.replace('s', ''), 10);
    const decadeEnd = decadeStart + 9;
    const label = `${decade} music`;
    setActiveGenre(label);
    setExploring(true);
    setExploreResult(null);
    setActiveTab('discover');
    try {
      const yearQuery = `year:${decadeStart}-${decadeEnd}`;
      const res = await fetch(`/api/discover/search-only?q=${encodeURIComponent(yearQuery)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setExploreResult({ genre: label, tracks: data.tracks as Track[], total: data.total });
    } catch (err) {
      setExploreResult({ genre: label, tracks: [], total: 0, error: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setExploring(false);
    }
  }, [session, exploring]);

  // ─── Playlist collector ─────────────────────────────────────
  const addToPlaylist = useCallback((track: Track) => {
    setCollectedTracks((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev;
      return [...prev, track];
    });
  }, []);

  const removeFromPlaylist = useCallback((id: string) => {
    setCollectedTracks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearPlaylist = useCallback(() => {
    setCollectedTracks([]);
    setPlaylistSuccess(null);
    setPlaylistError(null);
  }, []);

  const createPlaylist = useCallback(async (name: string) => {
    if (!session || collectedTracks.length === 0) return;
    setPlaylistCreating(true);
    setPlaylistError(null);
    setPlaylistSuccess(null);
    try {
      const res = await fetch('/api/playlist/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, trackIds: collectedTracks.map((t) => t.id) }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to create playlist');
      setPlaylistSuccess(`"${name}" — ${data.trackCount} tracks saved to your Spotify`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create playlist';
      setPlaylistError(msg);
    } finally {
      setPlaylistCreating(false);
    }
  }, [session, collectedTracks]);

  // Computed values
  const timeline = computeTimeline(decadeDistribution, releaseYears);
  const stats = computeStats(heardTracks.size, heardArtists.size, allGenres.length, timeline, releaseYears, sources.followedArtists);

  // Save cache on meaningful state changes
  useEffect(() => {
    if (basicsStatus === 'done') saveCacheSnapshot();
  }, [basicsStatus, libraryStatus, playlistsStatus, genresStatus, discographyStatus, saveCacheSnapshot]);

  // ─── Refresh ────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    clearCache();
    setRestoredFromCache(false);
    setCachedAt(null);
    setBasicsStatus('idle');
    setLibraryStatus('idle');
    setPlaylistsStatus('idle');
    setGenresStatus('idle');
    setDiscographyStatus('idle');
    setHeardTracks(new Set());
    setHeardArtists(new Set());
    setArtistNames({});
    setTopArtistIds([]);
    setDecadeDistribution(new Map());
    setReleaseYears([]);
    setGenreRadar([]);
    setAllGenres([]);
    setExplorerScore(0);
    setExplorerLabel('');
    setBlindSpots([]);
    setTrackPopularities([]);
    setPopularityTracks([]);
    setPopularityUnavailable(false);
    setMainstreamResult(null);
    setMainstreamStatus('idle');
    setDiscographyAlbums([]);
    setDiscographyArtistsScanned(0);
    setExploreResult(null);
    setTasteDriftRanges(null);
    setWarnings([]);
    setPhaseError(null);
    setUser(null);
    setTrackDurations([]);
    setExplicitCount(0);
    setTotalProcessed(0);
    setRecentPlayedTimes([]);
    setEarliestSavedAt(null);
    setLatestSavedAt(null);
  }, []);

  // Trigger basics load after refresh (skip during rate limit cooldown)
  useEffect(() => {
    if (session && basicsStatus === 'idle' && !restoredFromCache && user === null && cachedAt === null) {
      if (rateLimitUntil && Date.now() < rateLimitUntil) return;
      loadBasics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basicsStatus]);

  // ─── Render ─────────────────────────────────────────────────

  if (authLoading || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </main>
    );
  }

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'ear', label: 'Your Ear' },
    { id: 'discover', label: 'Discover' },
    { id: 'seed', label: 'Seed' },
    { id: 'curate', label: 'Curate', badge: collectedTracks.length || undefined },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/30 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            {APP_NAME === 'earlove' ? <>ear<span className="text-green-500">love</span></> : APP_NAME}
          </Link>
          <div className="flex items-center gap-3">
            {cachedAt && (
              <span className="text-zinc-700 text-[10px] font-mono" title={new Date(cachedAt).toLocaleString()}>
                {cacheAge(cachedAt)} ago
              </span>
            )}
            {user?.image && <img src={user.image} alt={user?.name ?? ''} className="w-7 h-7 rounded-full ring-1 ring-zinc-800" />}
            <button onClick={logout} className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors">
              logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Phase 1: Loading basics */}
        {basicsStatus === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 rounded-full border border-zinc-800" />
              <div className="absolute inset-0 rounded-full border border-green-500/60 border-t-transparent animate-spin" />
            </div>
            <p className="text-zinc-400 text-sm">reading your listening history...</p>
            <p className="text-zinc-600 text-[10px] font-mono mt-2">pacing requests to avoid spotify&apos;s wrath (~20s)</p>
          </div>
        )}

        {basicsStatus === 'error' && (
          <div className="text-center py-20 space-y-4">
            <p className="text-red-400/80 text-sm">{phaseError}</p>
            {rateLimitCountdown > 0 ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <span className="text-amber-400 text-2xl font-mono font-bold tabular-nums">{rateLimitCountdown}s</span>
                </div>
                <p className="text-zinc-500 text-xs max-w-sm mx-auto">
                  Spotify&apos;s dev mode allows ~5-8 requests per 30 seconds.
                  The cooldown prevents making things worse.
                </p>
                <button
                  onClick={() => { setRateLimitUntil(null); setBasicsStatus('idle'); setPhaseError(null); }}
                  className="text-zinc-600 hover:text-zinc-400 text-xs underline underline-offset-4"
                >
                  skip cooldown and try now
                </button>
              </div>
            ) : (
              <button onClick={() => { setBasicsStatus('idle'); setPhaseError(null); }} className="text-green-400 hover:text-green-300 text-sm underline underline-offset-4">
                try again
              </button>
            )}
          </div>
        )}

        {/* Main content (after basics loaded) */}
        {basicsStatus === 'done' && (
          <>
            {/* Tab bar */}
            <nav className="flex items-center justify-center gap-1 border-b border-zinc-800/30 pb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative px-5 py-2.5 text-sm font-medium transition-all rounded-t-lg
                    ${activeTab === tab.id
                      ? 'text-green-400 bg-zinc-900/40'
                      : 'text-zinc-600 hover:text-zinc-400'
                    }
                  `}
                >
                  {tab.label}
                  {tab.badge && tab.badge > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono bg-green-500/20 text-green-400 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-2 right-2 h-px bg-green-500/60" />
                  )}
                </button>
              ))}
            </nav>

            {/* Tab content */}
            {activeTab === 'ear' && (
              <YourEarTab
                user={user}
                heardTracks={heardTracks}
                heardArtists={heardArtists}
                allGenres={allGenres}
                sources={sources}
                basicsStatus={basicsStatus}
                libraryStatus={libraryStatus}
                playlistsStatus={playlistsStatus}
                genresStatus={genresStatus}
                discographyStatus={discographyStatus}
                phaseError={phaseError}
                warnings={warnings}
                loadLibrary={loadLibrary}
                loadGenres={loadGenres}
                loadDiscography={loadDiscography}
                loadMainstream={loadMainstream}
                handleRefresh={handleRefresh}
                loadBasics={loadBasics}
                timeline={timeline}
                stats={stats}
                genreRadar={genreRadar}
                explorerScore={explorerScore}
                explorerLabel={explorerLabel}
                trackPopularities={trackPopularities}
                mainstreamResult={mainstreamResult}
                mainstreamStatus={mainstreamStatus}
                discographyAlbums={discographyAlbums}
                discographyArtistsScanned={discographyArtistsScanned}
                onGenreClick={explore}
                onDecadeClick={exploreDecade}
                bannerDismissed={bannerDismissed}
                onDismissBanner={() => { setBannerDismissed(true); try { localStorage.setItem('earlove_banner_dismissed', '1'); } catch {} }}
                tasteDriftRanges={tasteDriftRanges}
                trackDurations={trackDurations}
                explicitCount={explicitCount}
                totalProcessed={totalProcessed}
                recentPlayedTimes={recentPlayedTimes}
                earliestSavedAt={earliestSavedAt}
                latestSavedAt={latestSavedAt}
              />
            )}

            {activeTab === 'discover' && (
              <DiscoverTab
                allGenres={allGenres}
                blindSpots={blindSpots}
                genresStatus={genresStatus}
                exploreResult={exploreResult}
                exploring={exploring}
                activeGenre={activeGenre}
                onExplore={explore}
                onExploreDecade={exploreDecade}
                onClearExplore={() => { setExploreResult(null); setActiveGenre(null); }}
                heardTracks={heardTracks}
                heardArtists={heardArtists}
                session={session}
                onAddToPlaylist={addToPlaylist}
                collectedTrackIds={collectedTrackIds}
                discographyAlbums={discographyAlbums}
                discographyArtistsScanned={discographyArtistsScanned}
                discographyStatus={discographyStatus}
                loadDiscography={loadDiscography}
              />
            )}

            {activeTab === 'curate' && (
              <CurateTab
                collectedTracks={collectedTracks}
                onRemoveTrack={removeFromPlaylist}
                onClearAll={clearPlaylist}
                onCreatePlaylist={createPlaylist}
                creating={playlistCreating}
                createError={playlistError}
                createSuccess={playlistSuccess}
              />
            )}

            {activeTab === 'seed' && (
              <SeedTab
                session={session}
                heardArtists={heardArtists}
                heardTracks={heardTracks}
                onAddToPlaylist={addToPlaylist}
                collectedTrackIds={new Set(collectedTracks.map((t) => t.id))}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ─── Client-side analysis helpers ─────────────────────────────

const GENRE_ADJACENCY: Record<string, string[]> = {
  'rock': ['alt-rock', 'indie', 'grunge', 'post-punk', 'garage'],
  'alt-rock': ['indie', 'shoegaze', 'post-punk', 'grunge'],
  'indie': ['indie-pop', 'shoegaze', 'lo-fi', 'folk'],
  'indie-pop': ['synth-pop', 'dream-pop', 'indie', 'new wave'],
  'pop': ['synth-pop', 'indie-pop', 'dance', 'disco'],
  'hip-hop': ['r-n-b', 'trip-hop', 'soul', 'afrobeat'],
  'r-n-b': ['neo-soul', 'soul', 'hip-hop', 'funk'],
  'electronic': ['house', 'ambient', 'synth-pop', 'trip-hop', 'dance'],
  'house': ['disco', 'dance', 'electronic', 'funk'],
  'jazz': ['neo-soul', 'bossa nova', 'soul', 'blues'],
  'soul': ['neo-soul', 'funk', 'r-n-b', 'blues'],
  'folk': ['indie', 'country', 'blues', 'acoustic'],
  'metal': ['punk', 'grunge', 'alt-rock', 'rock'],
  'punk': ['post-punk', 'ska', 'grunge', 'new wave'],
  'blues': ['soul', 'jazz', 'folk', 'funk'],
  'funk': ['soul', 'disco', 'afrobeat', 'r-n-b'],
  'classical': ['ambient', 'jazz'],
  'reggae': ['ska', 'afrobeat', 'funk'],
  'country': ['folk', 'blues', 'acoustic'],
  'ambient': ['electronic', 'lo-fi', 'classical', 'trip-hop'],
  'disco': ['funk', 'house', 'dance', 'pop'],
  'shoegaze': ['dream-pop', 'post-punk', 'lo-fi', 'ambient'],
  'post-punk': ['new wave', 'shoegaze', 'punk', 'synth-pop'],
  'synth-pop': ['new wave', 'electronic', 'dance', 'indie-pop'],
  'neo-soul': ['soul', 'r-n-b', 'jazz', 'funk'],
  'trip-hop': ['electronic', 'ambient', 'hip-hop'],
  'lo-fi': ['indie', 'ambient', 'shoegaze'],
  'afrobeat': ['funk', 'reggae', 'hip-hop'],
  'ska': ['punk', 'reggae'],
  'grunge': ['alt-rock', 'punk', 'rock'],
  'new wave': ['post-punk', 'synth-pop', 'indie-pop'],
  'dance': ['house', 'electronic', 'disco', 'pop'],
};

function analyzeGenres(data: {
  knownGenres: string[];
  genreFrequency: Record<string, number>;
  genreArtists: Record<string, string[]>;
}) {
  const freq = data.genreFrequency;
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  const top10 = entries.slice(0, 10);
  const maxCount = top10.length > 0 ? top10[0][1] : 1;
  const radar: GenreRadarPoint[] = top10.map(([genre, count]) => ({
    genre, weight: count / maxCount, rawCount: count,
    artists: (data.genreArtists[genre] ?? []).slice(0, 5),
  }));

  const genres = entries.map(([genre, count]) => ({ genre, count }));

  const total = entries.reduce((s, [, v]) => s + v, 0);
  let entropy = 0;
  if (total > 0) {
    for (const [, count] of entries) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
  }
  const genreCount = entries.length;
  const maxEntropy = genreCount > 1 ? Math.log2(genreCount) : 1;
  const evenness = maxEntropy > 0 ? entropy / maxEntropy : 0;
  const breadth = Math.min(genreCount / 30, 1);
  const raw = (evenness * 0.6 + breadth * 0.4) * 100;
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  let label: string;
  if (genreCount === 0) label = 'No genre data';
  else if (score >= 80) label = 'Sonic Nomad';
  else if (score >= 65) label = 'Adventurous Ear';
  else if (score >= 45) label = 'Curious Listener';
  else if (score >= 25) label = 'Comfort Cruiser';
  else label = 'Deep Specialist';

  const known = new Set(data.knownGenres);
  const spots: BlindSpot[] = [];
  for (const g of known) {
    const adjacent = GENRE_ADJACENCY[g] ?? [];
    for (const adj of adjacent) {
      if (!known.has(adj) && SPOTIFY_GENRES.includes(adj) && !spots.find((s) => s.genre === adj)) {
        spots.push({ genre: adj, reason: 'adjacent', adjacentTo: g });
      }
    }
  }
  const untouched = SPOTIFY_GENRES.filter((g) => !known.has(g) && !spots.find((s) => s.genre === g));
  const shuffled = untouched.sort(() => Math.random() - 0.5);
  for (const g of shuffled.slice(0, 5)) spots.push({ genre: g, reason: 'untouched' });
  spots.sort((a, b) => (a.reason === 'adjacent' ? -1 : 1) - (b.reason === 'adjacent' ? -1 : 1));

  return { radar, genres, score, label, spots: spots.slice(0, 12) };
}

function computeTimeline(dd: Map<string, number>, years: number[]): DecadeBucket[] {
  if (years.length === 0) return [];
  const sorted = [...dd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const total = years.length;
  return sorted.map(([decade, count]) => ({ decade, count, percentage: Math.round((count / total) * 100) }));
}

function computeStats(
  trackCount: number, artistCount: number, genreCount: number,
  timeline: DecadeBucket[], releaseYears: number[], followedArtists: number,
) {
  const sortedYears = [...releaseYears].sort((a, b) => a - b);
  const medianYear = sortedYears.length > 0 ? sortedYears[Math.floor(sortedYears.length / 2)] : null;
  const peakDecade = timeline.length > 0 ? [...timeline].sort((a, b) => b.count - a.count)[0].decade : null;
  return {
    totalTracks: trackCount, totalArtists: artistCount, totalGenres: genreCount,
    oldestDecade: timeline.length > 0 ? timeline[0].decade : null,
    newestDecade: timeline.length > 0 ? timeline[timeline.length - 1].decade : null,
    peakDecade, medianYear, followedArtists,
  };
}
