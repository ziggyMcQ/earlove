/**
 * The "Heard Profile" - aggregates all of a user's listening history
 * into efficient Set structures for O(1) lookups.
 * 
 * Now supports phased building:
 *   Phase 1 (basics): top tracks + recently played + followed artists (~7 calls)
 *   Phase 2 (library): saved tracks, paginated (variable calls)
 *   Phase 3 (playlists): owned playlist tracks (variable calls)
 *   Phase 4 (genres): genre probe using known artist IDs (~40 calls)
 */

import { SpotifyClient, SpotifyTrack, SpotifyArtist } from './spotify';

// Core genres to probe when artist genre data is unavailable (dev mode)
const PROBE_GENRES = [
  'rock', 'pop', 'hip-hop', 'r-n-b', 'electronic', 'indie',
  'alternative', 'jazz', 'soul', 'folk', 'country', 'metal',
  'punk', 'blues', 'funk', 'classical', 'reggae', 'latin',
  'house', 'ambient', 'disco', 'dance', 'synth-pop', 'new-wave',
  'post-punk', 'shoegaze', 'grunge', 'lo-fi', 'trip-hop', 'neo-soul',
];

export interface HeardProfile {
  trackIds: Set<string>;
  isrcs: Set<string>;
  artistIds: Set<string>;
  artistNames: Map<string, string>;
  knownGenres: Set<string>;
  genreFrequency: Map<string, number>;
  genreArtists: Map<string, Set<string>>;
  decadeDistribution: Map<string, number>;
  releaseYears: number[];
  totalTracksAnalyzed: number;
  buildTime: number;
  sources: {
    topTracksShort: number;
    topTracksMedium: number;
    topTracksLong: number;
    recentlyPlayed: number;
    savedLibrary: number;
    savedLibraryTotal: number;
    ownedPlaylists: number;
    playlistTracks: number;
    followedArtists: number;
  };
}

// ─── Serializable result types for API responses ──────────────

export interface EnrichedData {
  trackDurations: number[];
  explicitCount: number;
  totalProcessed: number;
  recentPlayedTimes: string[];
  earliestSavedAt?: string;
  latestSavedAt?: string;
}

export interface BasicsResult {
  user: { id: string; name: string; image: string };
  trackIds: string[];
  artistIds: string[];
  topArtistIds: string[];
  artistNames: Record<string, string>;
  decadeDistribution: Record<string, number>;
  releaseYears: number[];
  trackPopularities: number[];
  popularityTracks: PopularityTrack[];
  topArtistsByRange: {
    short: { id: string; name: string; genres: string[] }[];
    medium: { id: string; name: string; genres: string[] }[];
    long: { id: string; name: string; genres: string[] }[];
  };
  enriched: EnrichedData;
  sources: {
    topTracksShort: number;
    topTracksMedium: number;
    topTracksLong: number;
    recentlyPlayed: number;
    followedArtists: number;
  };
  warnings: string[];
  buildTime: number;
}

export interface LibraryResult {
  trackIds: string[];
  artistIds: string[];
  artistNames: Record<string, string>;
  decadeDistribution: Record<string, number>;
  releaseYears: number[];
  trackPopularities: number[];
  popularityTracks: PopularityTrack[];
  enriched: EnrichedData;
  savedTotal: number;
  nextOffset: number | null;
  buildTime: number;
  popularityUnavailable?: boolean;
}

export interface PlaylistResult {
  trackIds: string[];
  artistIds: string[];
  artistNames: Record<string, string>;
  decadeDistribution: Record<string, number>;
  releaseYears: number[];
  trackPopularities: number[];
  popularityTracks: PopularityTrack[];
  enriched: EnrichedData;
  ownedPlaylists: number;
  playlistTracks: number;
  buildTime: number;
}

export interface GenreResult {
  knownGenres: string[];
  genreFrequency: Record<string, number>;
  genreArtists: Record<string, string[]>;
  buildTime: number;
}

// ─── Helpers ──────────────────────────────────────────────────

export interface PopularityTrack {
  name: string;
  artist: string;
  popularity: number;
}

// Accumulators for enriched data extracted from existing API responses (zero extra API cost)
export interface EnrichedAccumulators {
  durations: number[];
  explicitCount: number;
  totalProcessed: number;
}

function createEnrichedAccumulators(): EnrichedAccumulators {
  return { durations: [], explicitCount: 0, totalProcessed: 0 };
}

// Counter used for resetting state across serverless invocations
let _processTrackCallCount = 0;

function processTrack(
  track: SpotifyTrack,
  trackIds: Set<string>,
  artistIds: Set<string>,
  artistNames: Map<string, string>,
  decadeDistribution: Map<string, number>,
  releaseYears: number[],
  trackPopularities?: number[],
  popularityTracks?: PopularityTrack[],
  enriched?: EnrichedAccumulators,
) {
  if (!track?.id) return;
  trackIds.add(track.id);
  _processTrackCallCount++;
  
  track.artists?.forEach((artist) => {
    if (artist.id) {
      artistIds.add(artist.id);
      artistNames.set(artist.id, artist.name);
    }
  });

  const releaseDate = track.album?.release_date;
  if (releaseDate) {
    const year = parseInt(releaseDate.slice(0, 4), 10);
    if (!isNaN(year) && year > 1900 && year <= new Date().getFullYear() + 1) {
      releaseYears.push(year);
      const decade = `${Math.floor(year / 10) * 10}s`;
      decadeDistribution.set(decade, (decadeDistribution.get(decade) ?? 0) + 1);
    }
  }

  // Capture popularity if present (dev mode strips this from most endpoints)
  if (trackPopularities && track.popularity != null) {
    const pop = Number(track.popularity);
    if (!isNaN(pop)) {
      trackPopularities.push(pop);
      if (popularityTracks) {
        popularityTracks.push({
          name: track.name,
          artist: track.artists?.map((a) => a.name).join(', ') ?? 'Unknown',
          popularity: pop,
        });
      }
    }
  }

  // Enriched data: duration and explicit flag (free from existing responses)
  if (enriched) {
    enriched.totalProcessed++;
    if (track.duration_ms != null && track.duration_ms > 0) {
      enriched.durations.push(track.duration_ms);
    }
    if (track.explicit === true) {
      enriched.explicitCount++;
    }
  }
}

async function safe<T>(label: string, fn: () => Promise<T[]>, errors: string[]): Promise<T[]> {
  try {
    const result = await fn();
    console.log(`[HeardProfile] ${label}: ${result.length} items`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[HeardProfile] ${label} FAILED:`, msg);
    errors.push(`${label}: ${msg}`);
    return [];
  }
}

// ─── Phase 1: Basics (~9 sequential API calls) ─────────────

export async function buildBasics(client: SpotifyClient): Promise<BasicsResult> {
  _processTrackCallCount = 0; // reset for this invocation
  const startTime = Date.now();

  const trackIds = new Set<string>();
  const artistIds = new Set<string>();
  const artistNames = new Map<string, string>();
  const decadeDistribution = new Map<string, number>();
  const releaseYears: number[] = [];
  const trackPopularities: number[] = [];
  const popularityTracks: PopularityTrack[] = [];
  const enriched = createEnrichedAccumulators();
  const errors: string[] = [];

  // Dev mode rate limit is ~5-8 requests per 30s window.
  // 2s between calls = 9 calls over ~18s, fits safely within the window.
  // This was empirically tested and confirmed working with 2,431 tracks.
  const delay = () => new Promise((r) => setTimeout(r, 2000));

  let me: { id: string; display_name: string; images?: { url: string }[] };
  try {
    me = await client.getMe();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('rate_limit_long:')) throw err;
    throw new Error(`Spotify unavailable: ${msg}. Wait a moment and retry.`);
  }
  await delay();

  const shortTermTracks = await safe('Top Tracks (short)', () => client.getTopTracks('short_term'), errors);
  await delay();
  const mediumTermTracks = await safe('Top Tracks (medium)', () => client.getTopTracks('medium_term'), errors);
  await delay();
  const longTermTracks = await safe('Top Tracks (long)', () => client.getTopTracks('long_term'), errors);
  await delay();

  const recentTracks = await safe('Recently Played', () => client.getRecentlyPlayed(), errors);
  await delay();

  const shortArtists = await safe('Top Artists (short)', () => client.getTopArtists('short_term'), errors);
  await delay();
  const mediumArtists = await safe('Top Artists (medium)', () => client.getTopArtists('medium_term'), errors);
  await delay();
  const longArtists = await safe('Top Artists (long)', () => client.getTopArtists('long_term'), errors);
  await delay();

  const followedArtists = await safe('Followed Artists', () => client.getFollowedArtists(), errors);

  // Process tracks
  const allTracks = [...shortTermTracks, ...mediumTermTracks, ...longTermTracks, ...recentTracks];

  allTracks.forEach((t) => processTrack(t, trackIds, artistIds, artistNames, decadeDistribution, releaseYears, trackPopularities, popularityTracks, enriched));

  // Extract played_at timestamps from recently played (free data, no extra API call)
  const recentPlayedTimes: string[] = [];
  for (const t of recentTracks) {
    const played = (t as SpotifyTrack & { played_at?: string }).played_at;
    if (played) recentPlayedTimes.push(played);
  }

  // Preserve the user's actual top artists in priority order (deduped)
  const topArtistIdSet = new Set<string>();
  [...longArtists, ...mediumArtists, ...shortArtists].forEach((a) => {
    if (a.id) topArtistIdSet.add(a.id);
  });
  const topArtistIds = [...topArtistIdSet];

  // Process artist IDs from top artists + followed
  const allArtists = [...shortArtists, ...mediumArtists, ...longArtists, ...followedArtists];
  allArtists.forEach((a) => {
    if (a.id) {
      artistIds.add(a.id);
      artistNames.set(a.id, a.name);
    }
  });

  const buildTime = Date.now() - startTime;

  // Add a warning if all data calls returned empty (likely rate limited)
  if (trackIds.size === 0 && artistIds.size === 0 && errors.length > 0) {
    errors.unshift('All data calls returned empty — Spotify may be rate limiting you. Wait a few minutes and retry.');
  }

  const toArtistSummary = (a: SpotifyArtist) => ({ id: a.id, name: a.name, genres: a.genres ?? [] });

  console.log(`[Phase 1 Basics] ${trackIds.size} tracks, ${artistIds.size} artists, ${topArtistIds.length} top artists, ${trackPopularities.length} popularity values, ${enriched.durations.length} durations, ${enriched.explicitCount} explicit, ${recentPlayedTimes.length} play timestamps, ${errors.length} errors in ${buildTime}ms`);

  return {
    user: {
      id: me.id,
      name: me.display_name,
      image: me.images?.[0]?.url ?? '',
    },
    trackIds: [...trackIds],
    artistIds: [...artistIds],
    topArtistIds,
    artistNames: Object.fromEntries(artistNames),
    decadeDistribution: Object.fromEntries(decadeDistribution),
    releaseYears,
    trackPopularities,
    popularityTracks,
    topArtistsByRange: {
      short: shortArtists.map(toArtistSummary),
      medium: mediumArtists.map(toArtistSummary),
      long: longArtists.map(toArtistSummary),
    },
    enriched: {
      trackDurations: enriched.durations,
      explicitCount: enriched.explicitCount,
      totalProcessed: enriched.totalProcessed,
      recentPlayedTimes,
    },
    sources: {
      topTracksShort: shortTermTracks.length,
      topTracksMedium: mediumTermTracks.length,
      topTracksLong: longTermTracks.length,
      recentlyPlayed: recentTracks.length,
      followedArtists: followedArtists.length,
    },
    warnings: errors,
    buildTime,
  };
}

// ─── Phase 2: Library (chunked — max 20 pages per invocation) ─

export async function buildLibrary(
  client: SpotifyClient,
  startOffset = 0,
  maxPages = 20,
): Promise<LibraryResult> {
  _processTrackCallCount = 0;
  const startTime = Date.now();

  const trackIds = new Set<string>();
  const artistIds = new Set<string>();
  const artistNames = new Map<string, string>();
  const decadeDistribution = new Map<string, number>();
  const releaseYears: number[] = [];
  const trackPopularities: number[] = [];
  const popularityTracks: PopularityTrack[] = [];
  const enriched = createEnrichedAccumulators();
  let popularityUnavailable = false;
  const addedAtDates: string[] = [];

  let offset = startOffset;
  let savedTotal = 0;
  let pagesScanned = 0;

  try {
    const first = await client.getSavedTracks(50, offset);
    first.tracks.forEach((t) => {
      processTrack(t, trackIds, artistIds, artistNames, decadeDistribution, releaseYears, undefined, undefined, enriched);
      if (t.added_at) addedAtDates.push(t.added_at);
    });
    savedTotal = first.total;
    offset += 50;
    pagesScanned++;
    console.log(`[Phase 2 Library] chunk start=${startOffset}: page 1 got ${first.tracks.length} of ${savedTotal}`);

    while (offset < savedTotal && pagesScanned < maxPages) {
      await new Promise((r) => setTimeout(r, 1500));
      const { tracks } = await client.getSavedTracks(50, offset);
      tracks.forEach((t) => {
        processTrack(t, trackIds, artistIds, artistNames, decadeDistribution, releaseYears, undefined, undefined, enriched);
        if (t.added_at) addedAtDates.push(t.added_at);
      });
      console.log(`[Phase 2 Library] +${tracks.length} (offset ${offset}/${savedTotal})`);
      offset += 50;
      pagesScanned++;
    }

    if (startOffset === 0) {
      popularityUnavailable = true;
    }
  } catch (err) {
    console.error(`[Phase 2 Library] FAILED at offset ${offset}:`, err instanceof Error ? err.message : err);
  }

  // Derive earliest/latest save dates
  addedAtDates.sort();
  const earliestSavedAt = addedAtDates[0] ?? undefined;
  const latestSavedAt = addedAtDates.length > 0 ? addedAtDates[addedAtDates.length - 1] : undefined;

  const buildTime = Date.now() - startTime;
  const done = offset >= savedTotal;
  console.log(`[Phase 2 Library] chunk: ${trackIds.size} tracks, ${enriched.durations.length} durations, ${enriched.explicitCount} explicit, ${pagesScanned} pages in ${buildTime}ms. ${done ? 'DONE' : `next offset: ${offset}`}`);

  return {
    trackIds: [...trackIds],
    artistIds: [...artistIds],
    artistNames: Object.fromEntries(artistNames),
    decadeDistribution: Object.fromEntries(decadeDistribution),
    releaseYears,
    trackPopularities,
    popularityTracks,
    enriched: {
      trackDurations: enriched.durations,
      explicitCount: enriched.explicitCount,
      totalProcessed: enriched.totalProcessed,
      recentPlayedTimes: [],
      earliestSavedAt,
      latestSavedAt,
    },
    savedTotal,
    nextOffset: done ? null : offset,
    buildTime,
    popularityUnavailable: popularityUnavailable || undefined,
  };
}

// ─── Phase 3: Playlists (variable API calls) ─────────────────

export async function buildPlaylists(client: SpotifyClient): Promise<PlaylistResult> {
  const startTime = Date.now();

  const trackIds = new Set<string>();
  const artistIds = new Set<string>();
  const artistNames = new Map<string, string>();
  const decadeDistribution = new Map<string, number>();
  const releaseYears: number[] = [];
  const trackPopularities: number[] = [];
  const popularityTracks: PopularityTrack[] = [];
  const enriched = createEnrichedAccumulators();
  let playlistTracksTotal = 0;
  let ownedPlaylistCount = 0;

  try {
    const me = await client.getMe();
    const userId = me.id;

    let plOffset = 0;
    const allPlaylists: { id: string; name: string; owner: { id: string }; tracks: { total: number } }[] = [];

    while (true) {
      const page = await client.getMyPlaylists(50, plOffset);
      allPlaylists.push(...page.items);
      plOffset += 50;
      if (plOffset >= page.total) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    const ownedPlaylists = allPlaylists.filter((p) => p.owner.id === userId);
    ownedPlaylistCount = ownedPlaylists.length;
    console.log(`[Phase 3 Playlists] ${allPlaylists.length} total, ${ownedPlaylistCount} owned`);

    for (const playlist of ownedPlaylists) {
      try {
        let ptOffset = 0;
        let plTracksFound = 0;
        while (ptOffset < playlist.tracks.total) {
          await new Promise((r) => setTimeout(r, 1500));
          const page = await client.getPlaylistTracks(playlist.id, 50, ptOffset);
          
          // Safety: if Spotify returns 0 items, stop (dev mode may strip tracks)
          if (!page.items || page.items.length === 0) {
            console.log(`[Phase 3 Playlists] "${playlist.name}": empty page at offset ${ptOffset} — dev mode may block playlist tracks`);
            break;
          }

          for (const item of page.items) {
            if (item.track) {
              processTrack(item.track, trackIds, artistIds, artistNames, decadeDistribution, releaseYears, trackPopularities, popularityTracks, enriched);
              playlistTracksTotal++;
              plTracksFound++;
            }
          }
          ptOffset += page.items.length;
        }
        console.log(`[Phase 3 Playlists] "${playlist.name}": ${plTracksFound}/${playlist.tracks.total} tracks`);
      } catch (err) {
        console.error(`[Phase 3 Playlists] "${playlist.name}" FAILED:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[Phase 3 Playlists] FAILED:', err instanceof Error ? err.message : err);
  }

  const buildTime = Date.now() - startTime;
  console.log(`[Phase 3 Playlists] ${trackIds.size} tracks, ${enriched.durations.length} durations from ${ownedPlaylistCount} playlists in ${buildTime}ms`);

  return {
    trackIds: [...trackIds],
    artistIds: [...artistIds],
    artistNames: Object.fromEntries(artistNames),
    decadeDistribution: Object.fromEntries(decadeDistribution),
    releaseYears,
    trackPopularities,
    popularityTracks,
    enriched: {
      trackDurations: enriched.durations,
      explicitCount: enriched.explicitCount,
      totalProcessed: enriched.totalProcessed,
      recentPlayedTimes: [],
    },
    ownedPlaylists: ownedPlaylistCount,
    playlistTracks: playlistTracksTotal,
    buildTime,
  };
}

// ─── Phase 4: Genre Analysis ──────────────────────────────────

export interface PreloadedArtistGenres {
  artistName: string;
  genres: string[];
}

export async function buildGenres(
  client: SpotifyClient,
  artistIdList: string[],
  preloadedArtistGenres?: PreloadedArtistGenres[],
): Promise<GenreResult> {
  const startTime = Date.now();
  const TIME_BUDGET_MS = 50_000; // Stop making API calls after 50s to leave 10s for response
  const timeRemaining = () => TIME_BUDGET_MS - (Date.now() - startTime);

  const artistIds = new Set(artistIdList);
  const knownGenres = new Set<string>();
  const genreFrequency = new Map<string, number>();
  const genreArtists = new Map<string, Set<string>>();

  const addGenre = (genre: string, artistName: string) => {
    knownGenres.add(genre);
    genreFrequency.set(genre, (genreFrequency.get(genre) ?? 0) + 1);
    if (!genreArtists.has(genre)) genreArtists.set(genre, new Set());
    genreArtists.get(genre)!.add(artistName);
  };

  // Use preloaded genre data from basics phase if available (zero API calls)
  if (preloadedArtistGenres && preloadedArtistGenres.length > 0) {
    for (const { artistName, genres } of preloadedArtistGenres) {
      for (const genre of genres) addGenre(genre, artistName);
    }
    console.log(`[Phase 4 Genres] Preloaded: ${knownGenres.size} genres from ${preloadedArtistGenres.length} artists`);
  }

  // Only fetch individual artists if we don't have preloaded data
  if (knownGenres.size === 0 && timeRemaining() > 20_000) {
    const idsToFetch = artistIdList.slice(0, 8);
    for (let idx = 0; idx < idsToFetch.length; idx++) {
      if (timeRemaining() < 5_000) { console.log('[Phase 4 Genres] Time budget reached during artist lookups'); break; }
      if (idx > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        const artist = await client.getArtist(idsToFetch[idx]);
        if (artist.genres?.length > 0) {
          artist.genres.forEach((g) => addGenre(g, artist.name));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('rate_limit_long:')) break;
      }
    }
    console.log(`[Phase 4 Genres] After artist lookups: ${knownGenres.size} genres`);
  }

  // Genre probe: search-based genre detection for genres not yet found
  const genresToProbe = PROBE_GENRES.filter((g) => !knownGenres.has(g));
  if (genresToProbe.length > 0 && artistIds.size > 0 && timeRemaining() > 5_000) {
    const probeCount = genresToProbe.length;
    console.log(`[Phase 4 Genres] Probing up to ${probeCount} genres (${Math.round(timeRemaining() / 1000)}s remaining)...`);
    let probed = 0;

    for (const genre of genresToProbe) {
      if (timeRemaining() < 3_000) {
        console.log(`[Phase 4 Genres] Time budget reached after ${probed}/${probeCount} probes`);
        break;
      }

      try {
        const tracks = await client.search(`genre:"${genre}"`, 'track', 10, 0);

        let matchCount = 0;
        const matchedNames: string[] = [];
        for (const track of tracks) {
          for (const artist of track.artists) {
            if (artistIds.has(artist.id)) {
              matchCount++;
              matchedNames.push(artist.name);
            }
          }
        }

        if (matchCount > 0) {
          matchedNames.forEach((n) => addGenre(genre, n));
          console.log(`[Phase 4 Genres] ✓ ${genre} (${matchCount} matches)`);
        }

        probed++;
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('rate_limit_long:')) break;
      }
    }
  }

  const buildTime = Date.now() - startTime;
  console.log(`[Phase 4 Genres] ${knownGenres.size} genres in ${buildTime}ms`);

  // Serialize for JSON
  const serializedGenreArtists: Record<string, string[]> = {};
  for (const [genre, artists] of genreArtists) {
    serializedGenreArtists[genre] = [...artists];
  }

  return {
    knownGenres: [...knownGenres],
    genreFrequency: Object.fromEntries(genreFrequency),
    genreArtists: serializedGenreArtists,
    buildTime,
  };
}

// ─── Phase 5: Discography Gaps ────────────────────────────────

export interface DiscographyAlbum {
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

export interface DiscographyResult {
  albums: DiscographyAlbum[];
  artistsScanned: number;
  buildTime: number;
  errors: string[];
}

export async function buildDiscography(
  client: SpotifyClient,
  topArtistIds: string[],
  heardTrackIds: Set<string>,
  artistNames: Record<string, string>,
): Promise<DiscographyResult> {
  const startTime = Date.now();
  const results: DiscographyAlbum[] = [];
  const errors: string[] = [];

  // Scan top 5 artists to stay under rate limits
  const artistsToScan = topArtistIds.slice(0, 5);
  let scanned = 0;

  console.log(`[Phase 5 Discography] Scanning ${artistsToScan.length} artists. IDs: ${artistsToScan.join(', ')}`);

  for (const artistId of artistsToScan) {
    const artistName = artistNames[artistId] ?? artistId;
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const albumsPage = await client.getArtistAlbums(artistId, 'album', 10, 0);

      if (!albumsPage?.items?.length) {
        console.log(`[Phase 5 Discography] ${artistName}: 0 albums returned`);
        scanned++;
        continue;
      }

      // Check up to 5 albums per artist
      const albumsToCheck = albumsPage.items.slice(0, 5);

      for (const album of albumsToCheck) {
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const tracksPage = await client.getAlbumTracks(album.id, 50, 0);

          if (!tracksPage?.items?.length) {
            console.log(`[Phase 5 Discography] ${album.name}: 0 tracks returned (dev mode block?)`);
            continue;
          }

          const unheardCount = tracksPage.items.filter((t) => !heardTrackIds.has(t.id)).length;

          if (unheardCount > 0) {
            results.push({
              artist: artistName,
              artistId,
              album: album.name,
              albumId: album.id,
              albumImage: album.images?.[1]?.url || album.images?.[0]?.url,
              releaseDate: album.release_date,
              totalTracks: album.total_tracks,
              unheardCount,
              spotifyUrl: album.external_urls?.spotify,
            });
          }
        } catch (albumErr) {
          const msg = albumErr instanceof Error ? albumErr.message : String(albumErr);
          console.log(`[Phase 5 Discography] Album "${album.name}" failed: ${msg}`);
        }
      }
      scanned++;
      console.log(`[Phase 5 Discography] ${artistName}: ${albumsToCheck.length} albums checked`);
    } catch (artistErr) {
      const msg = artistErr instanceof Error ? artistErr.message : String(artistErr);
      errors.push(`${artistName}: ${msg}`);
      console.log(`[Phase 5 Discography] Artist "${artistName}" (${artistId}) failed: ${msg}`);
    }
  }

  // Sort by unheard count descending
  results.sort((a, b) => b.unheardCount - a.unheardCount);

  const buildTime = Date.now() - startTime;
  console.log(`[Phase 5 Discography] ${results.length} albums with unheard tracks from ${scanned}/${artistsToScan.length} artists in ${buildTime}ms. Errors: ${errors.length}`);

  return {
    albums: results,
    artistsScanned: scanned,
    buildTime,
    errors,
  };
}

// ─── Legacy full build (kept for reference) ───────────────────

export async function buildHeardProfile(client: SpotifyClient): Promise<HeardProfile> {
  const basics = await buildBasics(client);
  const library = await buildLibrary(client);
  const playlists = await buildPlaylists(client);
  const genres = await buildGenres(client, basics.artistIds);

  const trackIds = new Set([...basics.trackIds, ...library.trackIds, ...playlists.trackIds]);
  const artistIds = new Set([...basics.artistIds, ...library.artistIds, ...playlists.artistIds]);
  const artistNames = new Map(Object.entries({ ...basics.artistNames, ...library.artistNames, ...playlists.artistNames }));

  const decadeDistribution = new Map<string, number>();
  for (const src of [basics.decadeDistribution, library.decadeDistribution, playlists.decadeDistribution]) {
    for (const [k, v] of Object.entries(src)) {
      decadeDistribution.set(k, (decadeDistribution.get(k) ?? 0) + v);
    }
  }

  const releaseYears = [...basics.releaseYears, ...library.releaseYears, ...playlists.releaseYears];

  return {
    trackIds,
    isrcs: new Set(),
    artistIds,
    artistNames,
    knownGenres: new Set(genres.knownGenres),
    genreFrequency: new Map(Object.entries(genres.genreFrequency)),
    genreArtists: new Map(Object.entries(genres.genreArtists).map(([k, v]) => [k, new Set(v)])),
    decadeDistribution,
    releaseYears,
    totalTracksAnalyzed: trackIds.size,
    buildTime: basics.buildTime + library.buildTime + playlists.buildTime + genres.buildTime,
    sources: {
      topTracksShort: basics.sources.topTracksShort,
      topTracksMedium: basics.sources.topTracksMedium,
      topTracksLong: basics.sources.topTracksLong,
      recentlyPlayed: basics.sources.recentlyPlayed,
      savedLibrary: library.trackIds.length,
      savedLibraryTotal: library.savedTotal,
      ownedPlaylists: playlists.ownedPlaylists,
      playlistTracks: playlists.playlistTracks,
      followedArtists: basics.sources.followedArtists,
    },
  };
}

// ─── Mainstream Analysis (search-overlap approach) ─────────────

export interface MainstreamGenreResult {
  genre: string;
  searchedTracks: number;
  heardTracks: number;          // tracks the user has in their library
  knownArtistTracks: number;    // tracks by artists the user follows/knows
  overlapPercent: number;       // 0-100, how mainstream their taste is for this genre
  unheardExamples: { name: string; artist: string; url: string }[];  // popular tracks they're missing
}

export interface MainstreamResult {
  overallScore: number;         // 0-100 weighted average
  label: string;                // e.g. "Crate Digger"
  genres: MainstreamGenreResult[];
  totalSearched: number;
  totalOverlap: number;
  buildTime: number;
}

/**
 * Analyze how mainstream the user's taste is by comparing their library
 * against Spotify's top search results for each genre.
 *
 * Spotify's search ordering reflects popularity — the first results for
 * "genre:rock" are the most-played rock tracks. By checking overlap with
 * the user's library, we get a proxy for "mainstream vs. underground"
 * without needing the stripped `popularity` field.
 *
 * Cost: ~1 API call per genre (10 results each). For 8 genres = 8 calls.
 */
export async function buildMainstreamAnalysis(
  client: SpotifyClient,
  genres: string[],
  heardTrackIds: string[],
  heardArtistIds: string[],
): Promise<MainstreamResult> {
  const startTime = Date.now();
  const heardTracks = new Set(heardTrackIds);
  const heardArtists = new Set(heardArtistIds);

  // Use top 8 genres max to stay within rate limits
  const topGenres = genres.slice(0, 8);
  const results: MainstreamGenreResult[] = [];
  let totalSearched = 0;
  let totalOverlap = 0;

  for (let i = 0; i < topGenres.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));

    const genre = topGenres[i];
    try {
      // Search for the most relevant/popular tracks in this genre
      const tracks = await client.search(`genre:"${genre}"`, 'track', 10);
      const heardCount = tracks.filter((t) => heardTracks.has(t.id)).length;
      const knownArtistCount = tracks.filter((t) =>
        t.artists.some((a) => heardArtists.has(a.id)) && !heardTracks.has(t.id)
      ).length;

      // Unheard examples: tracks by unknown artists (true gaps)
      const unheardExamples = tracks
        .filter((t) => !heardTracks.has(t.id) && !t.artists.some((a) => heardArtists.has(a.id)))
        .slice(0, 3)
        .map((t) => ({
          name: t.name,
          artist: t.artists.map((a) => a.name).join(', '),
          url: t.external_urls.spotify,
        }));

      // Overlap = tracks heard + tracks by known artists (weighted less)
      const overlap = heardCount + (knownArtistCount * 0.5);
      const overlapPercent = tracks.length > 0 ? Math.round((overlap / tracks.length) * 100) : 0;

      results.push({
        genre,
        searchedTracks: tracks.length,
        heardTracks: heardCount,
        knownArtistTracks: knownArtistCount,
        overlapPercent,
        unheardExamples,
      });

      totalSearched += tracks.length;
      totalOverlap += heardCount;
      console.log(`[Mainstream] ${genre}: ${heardCount}/${tracks.length} heard, ${knownArtistCount} known artists → ${overlapPercent}%`);
    } catch (err) {
      console.warn(`[Mainstream] Failed for genre "${genre}":`, err instanceof Error ? err.message : err);
    }
  }

  // Overall score: weighted by how many tracks were searched per genre
  const weightedSum = results.reduce((sum, r) => sum + (r.overlapPercent * r.searchedTracks), 0);
  const weightedTotal = results.reduce((sum, r) => sum + r.searchedTracks, 0);
  const overallScore = weightedTotal > 0 ? Math.round(weightedSum / weightedTotal) : 0;

  let label = 'Unknown';
  if (overallScore >= 70) label = 'Chart Chaser';
  else if (overallScore >= 55) label = 'Crowd Favorite';
  else if (overallScore >= 40) label = 'Balanced Palette';
  else if (overallScore >= 25) label = 'Crate Digger';
  else label = 'Deep Underground';

  // Sort by overlap descending (most mainstream genres first)
  results.sort((a, b) => b.overlapPercent - a.overlapPercent);

  const buildTime = Date.now() - startTime;
  console.log(`[Mainstream] Overall: ${overallScore} (${label}), ${results.length} genres in ${buildTime}ms`);

  return {
    overallScore,
    label,
    genres: results,
    totalSearched,
    totalOverlap,
    buildTime,
  };
}

// ─── Utility functions ────────────────────────────────────────

export function isTrackHeard(
  track: SpotifyTrack,
  profile: HeardProfile,
  strictMode = true
): boolean {
  if (profile.trackIds.has(track.id)) return true;
  if (strictMode && track.external_ids?.isrc) {
    if (profile.isrcs.has(track.external_ids.isrc)) return true;
  }
  return false;
}

export function isArtistKnown(artistId: string, profile: HeardProfile): boolean {
  return profile.artistIds.has(artistId);
}

export function filterUnheardTracks(
  tracks: SpotifyTrack[],
  profile: HeardProfile,
  strictMode = true
): SpotifyTrack[] {
  return tracks.filter((track) => !isTrackHeard(track, profile, strictMode));
}

export function getTopGenres(profile: HeardProfile, limit = 10): string[] {
  return [...profile.genreFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

export function getUnknownGenres(
  allGenres: string[],
  profile: HeardProfile,
  limit = 10
): string[] {
  const unknown = allGenres.filter((genre) => !profile.knownGenres.has(genre));
  const shuffled = unknown.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}
