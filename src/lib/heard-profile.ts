/**
 * The "Heard Profile" - aggregates all of a user's listening history
 * into efficient Set structures for O(1) lookups
 */

import { SpotifyClient, SpotifyTrack, SpotifyArtist } from './spotify';

export interface HeardProfile {
  // Track IDs the user has heard
  trackIds: Set<string>;
  
  // ISRC codes for strict matching (catches alternate versions)
  isrcs: Set<string>;
  
  // Artist IDs the user knows
  artistIds: Set<string>;
  
  // Genres the user listens to (from their top artists)
  knownGenres: Set<string>;
  
  // Genre frequency map for ranking
  genreFrequency: Map<string, number>;
  
  // Metadata
  totalTracksAnalyzed: number;
  buildTime: number;
}

/**
 * Build a comprehensive "Heard Profile" from all available Spotify data
 */
export async function buildHeardProfile(client: SpotifyClient): Promise<HeardProfile> {
  const startTime = Date.now();
  
  const trackIds = new Set<string>();
  const isrcs = new Set<string>();
  const artistIds = new Set<string>();
  const knownGenres = new Set<string>();
  const genreFrequency = new Map<string, number>();

  // Helper to add a track to the profile
  const addTrack = (track: SpotifyTrack) => {
    if (!track?.id) return;
    
    trackIds.add(track.id);
    
    // Add ISRC if available (for strict matching)
    if (track.external_ids?.isrc) {
      isrcs.add(track.external_ids.isrc);
    }
    
    // Add all artists from the track
    track.artists?.forEach((artist) => {
      if (artist.id) artistIds.add(artist.id);
    });
  };

  // Helper to add an artist's genres
  const addArtistGenres = (artist: SpotifyArtist) => {
    if (!artist?.genres) return;
    
    artistIds.add(artist.id);
    
    artist.genres.forEach((genre) => {
      knownGenres.add(genre);
      genreFrequency.set(genre, (genreFrequency.get(genre) ?? 0) + 1);
    });
  };

  console.log('[HeardProfile] Building profile...');

  // 1. Top Tracks - all time ranges (Heavy Rotation layer)
  const topTrackPromises = [
    client.getTopTracks('short_term'),
    client.getTopTracks('medium_term'),
    client.getTopTracks('long_term'),
  ];

  // 2. Recently Played (Recency layer)
  const recentPromise = client.getRecentlyPlayed();

  // 3. Top Artists - for genre analysis
  const topArtistPromises = [
    client.getTopArtists('short_term'),
    client.getTopArtists('medium_term'),
    client.getTopArtists('long_term'),
  ];

  // 4. Followed Artists
  const followedPromise = client.getFollowedArtists();

  // Execute all in parallel
  const [
    shortTermTracks,
    mediumTermTracks,
    longTermTracks,
    recentTracks,
    shortTermArtists,
    mediumTermArtists,
    longTermArtists,
    followedArtists,
  ] = await Promise.all([
    ...topTrackPromises,
    recentPromise,
    ...topArtistPromises,
    followedPromise,
  ]);

  // Process tracks
  [shortTermTracks, mediumTermTracks, longTermTracks, recentTracks].forEach((tracks) => {
    tracks.forEach(addTrack);
  });

  // Process artists
  [shortTermArtists, mediumTermArtists, longTermArtists, followedArtists].forEach((artists) => {
    artists.forEach(addArtistGenres);
  });

  // 5. Saved Tracks (Library layer) - paginated, fetch first 200
  // This is the heaviest call, so we do it after the quick ones
  let offset = 0;
  const maxSavedTracks = 200; // Limit for MVP, can increase later
  
  while (offset < maxSavedTracks) {
    const { tracks, total } = await client.getSavedTracks(50, offset);
    tracks.forEach(addTrack);
    
    offset += 50;
    if (offset >= total) break;
  }

  const buildTime = Date.now() - startTime;
  
  console.log(`[HeardProfile] Built in ${buildTime}ms`);
  console.log(`[HeardProfile] ${trackIds.size} tracks, ${isrcs.size} ISRCs, ${artistIds.size} artists, ${knownGenres.size} genres`);

  return {
    trackIds,
    isrcs,
    artistIds,
    knownGenres,
    genreFrequency,
    totalTracksAnalyzed: trackIds.size,
    buildTime,
  };
}

/**
 * Check if a track has been "heard" based on the profile
 */
export function isTrackHeard(
  track: SpotifyTrack,
  profile: HeardProfile,
  strictMode = true
): boolean {
  // Always check track ID
  if (profile.trackIds.has(track.id)) {
    return true;
  }

  // In strict mode, also check ISRC (catches alternate versions)
  if (strictMode && track.external_ids?.isrc) {
    if (profile.isrcs.has(track.external_ids.isrc)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an artist is known to the user
 */
export function isArtistKnown(artistId: string, profile: HeardProfile): boolean {
  return profile.artistIds.has(artistId);
}

/**
 * Filter out tracks the user has heard
 */
export function filterUnheardTracks(
  tracks: SpotifyTrack[],
  profile: HeardProfile,
  strictMode = true
): SpotifyTrack[] {
  return tracks.filter((track) => !isTrackHeard(track, profile, strictMode));
}

/**
 * Get the user's top genres sorted by frequency
 */
export function getTopGenres(profile: HeardProfile, limit = 10): string[] {
  return [...profile.genreFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

/**
 * Get genres the user doesn't listen to
 */
export function getUnknownGenres(
  allGenres: string[],
  profile: HeardProfile,
  limit = 10
): string[] {
  const unknown = allGenres.filter((genre) => !profile.knownGenres.has(genre));
  
  // Shuffle and take a sample
  const shuffled = unknown.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}
