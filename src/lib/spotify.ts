/**
 * Spotify API utilities and types
 *
 * Dev Mode Limits (Feb 2026):
 *   - Search limit max: 10 (paginate with offset for more)
 *   - Batch /artists endpoint: REMOVED (use individual /artists/{id})
 *   - Track external_ids (ISRCs): REMOVED
 *   - Browse/new-releases: REMOVED
 *   - Artist top-tracks: REMOVED
 *   - Playlist tracks for non-owned playlists: REMOVED
 */

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Dev mode search limit
const SEARCH_LIMIT_MAX = 10;

// Scopes needed for the "Heard Profile" + playlist creation
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-follow-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  popularity?: number;
  duration_ms?: number;
  explicit?: boolean;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date?: string;
  };
  external_ids?: {
    isrc?: string;
  };
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
  external_urls: {
    spotify: string;
  };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: 'album' | 'single' | 'compilation';
  total_tracks: number;
  release_date: string;
  images: { url: string; width: number; height: number }[];
  artists: { id: string; name: string }[];
  external_urls: { spotify: string };
}

export interface SpotifySimpleTrack {
  id: string;
  name: string;
  track_number: number;
  artists: { id: string; name: string }[];
  external_urls: { spotify: string };
}

/**
 * Generate the Spotify OAuth authorization URL
 */
export function getSpotifyAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'true',
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function getSpotifyTokens(code: string): Promise<SpotifyTokens> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get tokens: ${error}`);
  }

  const data = await response.json();

  console.log('[Auth] Token granted scopes:', data.scope);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokens> {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Spotify API client class — respects Dev Mode limits
 */
export class SpotifyClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const MAX_RETRIES = 3;
    const MAX_WAIT_S = 30;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...options?.headers,
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);

        if (retryAfter > MAX_WAIT_S) {
          throw new Error(
            `rate_limit_long:${retryAfter}`
          );
        }

        if (attempt < MAX_RETRIES) {
          console.log(`[Spotify] 429 on ${endpoint}, Retry-After=${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Spotify ${response.status}: ${error}`);
      }

      return response.json();
    }

    throw new Error(`Spotify 429: rate limited on ${endpoint}`);
  }

  /**
   * Get user's top tracks for a given time range
   */
  async getTopTracks(
    timeRange: 'short_term' | 'medium_term' | 'long_term',
    limit = 50
  ): Promise<SpotifyTrack[]> {
    const data = await this.fetch<{ items: SpotifyTrack[] }>(
      `/me/top/tracks?time_range=${timeRange}&limit=${limit}`
    );
    return data.items;
  }

  /**
   * Get user's recently played tracks (preserves played_at timestamp)
   */
  async getRecentlyPlayed(limit = 50): Promise<(SpotifyTrack & { played_at?: string })[]> {
    const data = await this.fetch<{ items: { track: SpotifyTrack; played_at?: string }[] }>(
      `/me/player/recently-played?limit=${limit}`
    );
    return data.items.map((item) => ({ ...item.track, played_at: item.played_at }));
  }

  /**
   * Get user's saved tracks (paginated, preserves added_at timestamp)
   */
  async getSavedTracks(limit = 50, offset = 0): Promise<{ tracks: (SpotifyTrack & { added_at?: string })[]; total: number }> {
    const data = await this.fetch<{ items: { track: SpotifyTrack; added_at?: string }[]; total: number }>(
      `/me/tracks?limit=${limit}&offset=${offset}`
    );
    return {
      tracks: data.items.map((item) => ({ ...item.track, added_at: item.added_at })),
      total: data.total,
    };
  }

  /**
   * Get user's top artists
   */
  async getTopArtists(
    timeRange: 'short_term' | 'medium_term' | 'long_term',
    limit = 50
  ): Promise<SpotifyArtist[]> {
    const data = await this.fetch<{ items: SpotifyArtist[] }>(
      `/me/top/artists?time_range=${timeRange}&limit=${limit}`
    );
    return data.items;
  }

  /**
   * Get user's followed artists
   */
  async getFollowedArtists(limit = 50): Promise<SpotifyArtist[]> {
    const data = await this.fetch<{ artists: { items: SpotifyArtist[] } }>(
      `/me/following?type=artist&limit=${limit}`
    );
    return data.artists.items;
  }

  /**
   * Get a single artist by ID (batch endpoint is removed in dev mode)
   */
  async getArtist(id: string): Promise<SpotifyArtist> {
    return this.fetch<SpotifyArtist>(`/artists/${id}`);
  }

  /**
   * Get multiple artists by fetching individually (batch endpoint removed)
   */
  async getArtists(ids: string[]): Promise<SpotifyArtist[]> {
    const results: SpotifyArtist[] = [];
    for (const id of ids) {
      try {
        const artist = await this.getArtist(id);
        results.push(artist);
      } catch {
        // Skip artists that fail
      }
    }
    return results;
  }

  /**
   * Search for tracks (dev mode: max 10 per page, use offset to paginate)
   */
  async search(
    query: string,
    type: 'track' | 'artist' | 'album' = 'track',
    limit = SEARCH_LIMIT_MAX,
    offset = 0,
  ): Promise<SpotifyTrack[]> {
    const clampedLimit = Math.min(limit, SEARCH_LIMIT_MAX);
    const params = new URLSearchParams({
      q: query,
      type,
      limit: String(clampedLimit),
      offset: String(offset),
    });

    const data = await this.fetch<{ tracks: { items: SpotifyTrack[] } }>(
      `/search?${params.toString()}`
    );
    return data.tracks.items;
  }

  async searchArtists(
    query: string,
    limit = SEARCH_LIMIT_MAX,
    offset = 0,
  ): Promise<SpotifyArtist[]> {
    const clampedLimit = Math.min(limit, SEARCH_LIMIT_MAX);
    const params = new URLSearchParams({
      q: query,
      type: 'artist',
      limit: String(clampedLimit),
      offset: String(offset),
    });

    const data = await this.fetch<{ artists?: { items?: SpotifyArtist[] } }>(
      `/search?${params.toString()}`
    );
    return (data.artists?.items ?? []).filter(Boolean);
  }

  /**
   * Search with pagination — fetches multiple pages to get more results
   */
  async searchPaginated(
    query: string,
    type: 'track' | 'artist' | 'album' = 'track',
    totalDesired = 30,
  ): Promise<SpotifyTrack[]> {
    const allTracks: SpotifyTrack[] = [];
    let offset = 0;

    while (allTracks.length < totalDesired) {
      const tracks = await this.search(query, type, SEARCH_LIMIT_MAX, offset);
      if (tracks.length === 0) break;
      allTracks.push(...tracks);
      offset += SEARCH_LIMIT_MAX;
      await new Promise((r) => setTimeout(r, 50));
    }

    return allTracks.slice(0, totalDesired);
  }

  /**
   * Get user's playlists (paginated).
   * Handles both pre-migration (tracks.total) and post-migration (items.total) field names.
   */
  async getMyPlaylists(limit = 50, offset = 0): Promise<{
    items: { id: string; name: string; owner: { id: string }; tracks: { total: number } }[];
    total: number;
  }> {
    const raw = await this.fetch<{
      items: {
        id: string; name: string; owner: { id: string };
        tracks?: { total: number }; items?: { total: number };
      }[];
      total: number;
    }>(`/me/playlists?limit=${limit}&offset=${offset}`);

    return {
      total: raw.total,
      items: raw.items.map((p) => ({
        ...p,
        tracks: p.tracks ?? p.items ?? { total: 0 },
      })),
    };
  }

  /**
   * Get tracks from a playlist (dev mode: only works for owned playlists)
   */
  async getPlaylistTracks(
    playlistId: string,
    limit = 50,
    offset = 0
  ): Promise<{ items: { track: SpotifyTrack | null }[]; total: number }> {
    return this.fetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,artists(id,name),album(id,name,images,release_date),external_urls)),total`);
  }

  /**
   * Get an artist's albums (dev mode: works for individual artists)
   */
  async getArtistAlbums(
    artistId: string,
    includeGroups = 'album,single',
    limit = 50,
    offset = 0,
  ): Promise<{ items: SpotifyAlbum[]; total: number }> {
    return this.fetch(`/artists/${artistId}/albums?include_groups=${includeGroups}&limit=${limit}&offset=${offset}&market=US`);
  }

  /**
   * Get an album's tracks
   */
  async getAlbumTracks(albumId: string, limit = 50, offset = 0): Promise<{ items: SpotifySimpleTrack[]; total: number }> {
    return this.fetch(`/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get multiple tracks by ID (batch lookup, max 50 per call).
   */
  async getTracksById(ids: string[]): Promise<SpotifyTrack[]> {
    if (ids.length === 0) return [];
    const batch = ids.slice(0, 50);
    const data = await this.fetch<{ tracks: SpotifyTrack[] }>(
      `/tracks?ids=${batch.join(',')}`
    );
    return data.tracks.filter(Boolean);
  }

  /**
   * Get current user's profile
   */
  async getMe(): Promise<{ id: string; display_name: string; images: { url: string }[] }> {
    return this.fetch('/me');
  }

  /**
   * Create a new playlist on the user's account and add tracks to it.
   * Requires playlist-modify-public or playlist-modify-private scope.
   */
  async createPlaylist(
    name: string,
    trackUris: string[],
    isPublic = false,
  ): Promise<{ id: string; external_urls: { spotify: string } }> {
    const playlist = await this.fetch<{ id: string; external_urls: { spotify: string } }>(
      `/me/playlists`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          public: isPublic,
          description: 'Created with earlove',
        }),
      },
    );

    if (trackUris.length > 0) {
      for (let i = 0; i < trackUris.length; i += 100) {
        const batch = trackUris.slice(i, i + 100);
        await this.fetch(`/playlists/${playlist.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: batch }),
        });
        if (i + 100 < trackUris.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    return playlist;
  }
}
