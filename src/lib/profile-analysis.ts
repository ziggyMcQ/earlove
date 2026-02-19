/**
 * Profile Analysis Engine
 * 
 * Transforms raw HeardProfile data into meaningful insights:
 * - Genre radar (top genres with weights)
 * - Decade timeline (when was your music made?)
 * - Comfort zone score (how adventurous are you?)
 * - Blind spots (genres you've never touched)
 * - Adjacent suggestions (genres close to what you know)
 */

import { HeardProfile } from './heard-profile';
import { SPOTIFY_GENRES } from './genres';

// ─── Output types ─────────────────────────────────────────────

export interface GenreRadarPoint {
  genre: string;
  weight: number; // 0-1 normalized
  rawCount: number;
  artists: string[]; // sample artist names for this genre
}

export interface DecadeBucket {
  decade: string; // e.g. "1990s"
  count: number;
  percentage: number;
}

export interface BlindSpot {
  genre: string;
  reason: 'untouched' | 'adjacent';
  adjacentTo?: string; // the genre in your profile that's related
}

export interface ProfileAnalysis {
  // Radar chart data (top N genres, normalized)
  genreRadar: GenreRadarPoint[];
  
  // Full genre list sorted by frequency
  allGenres: { genre: string; count: number }[];
  
  // Decade distribution
  timeline: DecadeBucket[];
  
  // Single number: how concentrated is your listening? (0 = laser-focused, 100 = all over the place)
  explorerScore: number;
  
  // Descriptive label for the score
  explorerLabel: string;
  
  // Blind spots: genres you haven't explored
  blindSpots: BlindSpot[];
  
  // Summary stats
  stats: {
    totalTracks: number;
    totalArtists: number;
    totalGenres: number;
    oldestDecade: string | null;
    newestDecade: string | null;
    peakDecade: string | null;
    medianYear: number | null;
    followedArtists: number;
  };
}

// ─── Genre adjacency map ──────────────────────────────────────
// Hand-curated: if you listen to genre A, genre B is a natural next step
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

// ─── Analysis functions ───────────────────────────────────────

/**
 * Compute the full profile analysis from a HeardProfile
 */
export function analyzeProfile(profile: HeardProfile): ProfileAnalysis {
  const genreRadar = computeGenreRadar(profile, 10);
  const allGenres = computeAllGenres(profile);
  const timeline = computeTimeline(profile);
  const { score, label } = computeExplorerScore(profile);
  const blindSpots = computeBlindSpots(profile);
  const stats = computeStats(profile, timeline);

  return {
    genreRadar,
    allGenres,
    timeline,
    explorerScore: score,
    explorerLabel: label,
    blindSpots,
    stats,
  };
}

function computeGenreRadar(profile: HeardProfile, limit: number): GenreRadarPoint[] {
  const entries = [...profile.genreFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  
  if (entries.length === 0) return [];
  
  const maxCount = entries[0][1];
  
  return entries.map(([genre, count]) => ({
    genre,
    weight: count / maxCount, // normalize to 0-1
    rawCount: count,
    artists: [...(profile.genreArtists.get(genre) ?? [])].slice(0, 5),
  }));
}

function computeAllGenres(profile: HeardProfile): { genre: string; count: number }[] {
  return [...profile.genreFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([genre, count]) => ({ genre, count }));
}

function computeTimeline(profile: HeardProfile): DecadeBucket[] {
  const total = profile.releaseYears.length;
  if (total === 0) return [];

  // Sort decades chronologically
  const sorted = [...profile.decadeDistribution.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  return sorted.map(([decade, count]) => ({
    decade,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

function computeExplorerScore(profile: HeardProfile): { score: number; label: string } {
  // Shannon entropy of genre distribution, normalized to 0-100
  const total = [...profile.genreFrequency.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return { score: 0, label: 'No data yet' };

  const genreCount = profile.genreFrequency.size;
  if (genreCount <= 1) return { score: 5, label: 'Laser-Focused' };

  let entropy = 0;
  for (const count of profile.genreFrequency.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Maximum possible entropy for this number of genres
  const maxEntropy = Math.log2(genreCount);
  
  // Normalized: how evenly spread across genres (0 = all one genre, 1 = perfectly even)
  const evenness = maxEntropy > 0 ? entropy / maxEntropy : 0;
  
  // Factor in number of genres too (more genres = more exploring)
  // Cap at ~30 genres for scoring purposes
  const genreBreadth = Math.min(genreCount / 30, 1);
  
  // Weighted combo: 60% evenness, 40% breadth
  const raw = (evenness * 0.6 + genreBreadth * 0.4) * 100;
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  let label: string;
  if (score >= 80) label = 'Sonic Nomad';
  else if (score >= 65) label = 'Adventurous Ear';
  else if (score >= 45) label = 'Curious Listener';
  else if (score >= 25) label = 'Comfort Cruiser';
  else label = 'Deep Specialist';

  return { score, label };
}

function computeBlindSpots(profile: HeardProfile): BlindSpot[] {
  const known = profile.knownGenres;
  const spots: BlindSpot[] = [];

  // 1. Find adjacent genres (things close to what you listen to, but missing)
  for (const userGenre of known) {
    const adjacent = GENRE_ADJACENCY[userGenre] ?? [];
    for (const adj of adjacent) {
      if (!known.has(adj) && SPOTIFY_GENRES.includes(adj)) {
        // Check if already added
        if (!spots.find((s) => s.genre === adj)) {
          spots.push({ genre: adj, reason: 'adjacent', adjacentTo: userGenre });
        }
      }
    }
  }

  // 2. Find completely untouched genres from the main list
  const mainGenres = SPOTIFY_GENRES.filter(
    (g) => !known.has(g) && !spots.find((s) => s.genre === g)
  );
  
  // Shuffle and pick some
  const shuffled = mainGenres.sort(() => Math.random() - 0.5);
  for (const genre of shuffled.slice(0, 5)) {
    spots.push({ genre, reason: 'untouched' });
  }

  // Sort: adjacent first (more relevant), then untouched
  spots.sort((a, b) => {
    if (a.reason === 'adjacent' && b.reason !== 'adjacent') return -1;
    if (a.reason !== 'adjacent' && b.reason === 'adjacent') return 1;
    return 0;
  });

  return spots.slice(0, 12);
}

function computeStats(
  profile: HeardProfile,
  timeline: DecadeBucket[]
): ProfileAnalysis['stats'] {
  const sortedYears = [...profile.releaseYears].sort((a, b) => a - b);
  const medianYear = sortedYears.length > 0
    ? sortedYears[Math.floor(sortedYears.length / 2)]
    : null;

  const peakDecade = timeline.length > 0
    ? [...timeline].sort((a, b) => b.count - a.count)[0].decade
    : null;

  return {
    totalTracks: profile.totalTracksAnalyzed,
    totalArtists: profile.artistIds.size,
    totalGenres: profile.knownGenres.size,
    oldestDecade: timeline.length > 0 ? timeline[0].decade : null,
    newestDecade: timeline.length > 0 ? timeline[timeline.length - 1].decade : null,
    peakDecade,
    medianYear,
    followedArtists: profile.sources.followedArtists,
  };
}
