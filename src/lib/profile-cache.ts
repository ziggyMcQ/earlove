/**
 * Profile caching layer — stores the accumulated profile in localStorage
 * so returning visitors get an instant experience without re-hitting Spotify.
 *
 * 24-hour TTL. Explicit refresh clears cache and re-runs all phases.
 */

const CACHE_KEY = 'earlove_profile_v2';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PopularityTrack {
  name: string;
  artist: string;
  popularity: number;
}

export interface CachedProfile {
  timestamp: number;
  heardTrackIds: string[];
  heardArtistIds: string[];
  user: { id: string; name: string; image: string } | null;
  decadeDistribution: Record<string, number>;
  releaseYears: number[];
  sources: {
    topTracksShort: number;
    topTracksMedium: number;
    topTracksLong: number;
    recentlyPlayed: number;
    followedArtists: number;
    savedTotal: number;
    ownedPlaylists: number;
    playlistTracks: number;
  };
  // Genre analysis
  genreRadar: { genre: string; weight: number; rawCount: number; artists: string[] }[];
  allGenres: { genre: string; count: number }[];
  explorerScore: number;
  explorerLabel: string;
  blindSpots: { genre: string; reason: 'untouched' | 'adjacent'; adjacentTo?: string }[];
  // Phase completion
  phasesDone: {
    basics: boolean;
    library: boolean;
    playlists: boolean;
    genres: boolean;
  };
  // Popularity (legacy — may be empty in dev mode)
  trackPopularities: number[];
  popularityTracks: PopularityTrack[];
  popularityUnavailable?: boolean;
  // Enriched data (duration, explicit, timestamps)
  trackDurations?: number[];
  explicitCount?: number;
  totalProcessed?: number;
  recentPlayedTimes?: string[];
  earliestSavedAt?: string;
  latestSavedAt?: string;
  // Mainstream analysis (search-overlap approach)
  mainstreamResult?: {
    overallScore: number;
    label: string;
    genres: {
      genre: string;
      searchedTracks: number;
      heardTracks: number;
      knownArtistTracks: number;
      overlapPercent: number;
      unheardExamples: { name: string; artist: string; url: string }[];
    }[];
    totalSearched: number;
    totalOverlap: number;
    buildTime: number;
  };
  // Discography
  discographyResults?: {
    artist: string;
    artistId: string;
    album: string;
    albumId: string;
    albumImage?: string;
    releaseDate?: string;
    totalTracks: number;
    unheardCount: number;
  }[];
}

export function loadCache(): CachedProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedProfile = JSON.parse(raw);
    if (Date.now() - cached.timestamp > TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

export function saveCache(profile: CachedProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function clearCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}

export function cacheAge(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
