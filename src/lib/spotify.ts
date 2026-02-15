/**
 * Spotify API utilities and types
 */

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Scopes needed for the "Heard Profile"
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',  // Recently played tracks
  'user-top-read',              // Top tracks and artists
  'user-library-read',          // Saved tracks and albums
  'user-follow-read',           // Followed artists
].join(' ');

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
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

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
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
 * Spotify API client class
 */
export class SpotifyClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Spotify API error: ${response.status} - ${error}`);
    }

    return response.json();
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
   * Get user's recently played tracks
   */
  async getRecentlyPlayed(limit = 50): Promise<SpotifyTrack[]> {
    const data = await this.fetch<{ items: { track: SpotifyTrack }[] }>(
      `/me/player/recently-played?limit=${limit}`
    );
    return data.items.map((item) => item.track);
  }

  /**
   * Get user's saved tracks (paginated)
   */
  async getSavedTracks(limit = 50, offset = 0): Promise<{ tracks: SpotifyTrack[]; total: number }> {
    const data = await this.fetch<{ items: { track: SpotifyTrack }[]; total: number }>(
      `/me/tracks?limit=${limit}&offset=${offset}`
    );
    return {
      tracks: data.items.map((item) => item.track),
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
   * Get a playlist's tracks
   */
  async getPlaylistTracks(playlistId: string, limit = 100): Promise<SpotifyTrack[]> {
    const data = await this.fetch<{ items: { track: SpotifyTrack }[] }>(
      `/playlists/${playlistId}/tracks?limit=${limit}`
    );
    return data.items.map((item) => item.track).filter(Boolean);
  }

  /**
   * Get new releases
   */
  async getNewReleases(limit = 50): Promise<{ id: string; name: string; artists: { id: string; name: string }[]; images: { url: string; width: number; height: number }[] }[]> {
    const data = await this.fetch<{ albums: { items: { id: string; name: string; artists: { id: string; name: string }[]; images: { url: string; width: number; height: number }[] }[] } }>(
      `/browse/new-releases?limit=${limit}`
    );
    return data.albums.items;
  }

  /**
   * Get available genre seeds for recommendations
   */
  async getAvailableGenres(): Promise<string[]> {
    const data = await this.fetch<{ genres: string[] }>(
      '/recommendations/available-genre-seeds'
    );
    return data.genres;
  }

  /**
   * Get recommendations based on seeds
   */
  async getRecommendations(params: {
    seedGenres?: string[];
    seedArtists?: string[];
    seedTracks?: string[];
    limit?: number;
  }): Promise<SpotifyTrack[]> {
    const searchParams = new URLSearchParams();
    
    if (params.seedGenres?.length) {
      searchParams.set('seed_genres', params.seedGenres.join(','));
    }
    if (params.seedArtists?.length) {
      searchParams.set('seed_artists', params.seedArtists.join(','));
    }
    if (params.seedTracks?.length) {
      searchParams.set('seed_tracks', params.seedTracks.join(','));
    }
    searchParams.set('limit', String(params.limit ?? 20));

    const data = await this.fetch<{ tracks: SpotifyTrack[] }>(
      `/recommendations?${searchParams.toString()}`
    );
    return data.tracks;
  }

  /**
   * Get current user's profile
   */
  async getMe(): Promise<{ id: string; display_name: string; images: { url: string }[] }> {
    return this.fetch('/me');
  }
}
