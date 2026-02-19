import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, getTopGenres, filterUnheardTracks } from '@/lib/heard-profile';

const SPOTIFY_API = 'https://api.spotify.com/v1';

interface EndpointTest {
  name: string;
  endpoint: string;
  status: 'ok' | 'failed';
  code: number;
  detail?: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token provided' }, { status: 401 });
  }

  const deep = request.nextUrl.searchParams.get('deep') === '1';

  // --- Standard endpoint tests ---
  const endpoints = [
    { name: 'Profile', path: '/me' },
    { name: 'Top Tracks (short)', path: '/me/top/tracks?time_range=short_term&limit=1' },
    { name: 'Top Tracks (medium)', path: '/me/top/tracks?time_range=medium_term&limit=1' },
    { name: 'Top Tracks (long)', path: '/me/top/tracks?time_range=long_term&limit=1' },
    { name: 'Recently Played', path: '/me/player/recently-played?limit=1' },
    { name: 'Saved Tracks (Library)', path: '/me/tracks?limit=1' },
    { name: 'Top Artists (short)', path: '/me/top/artists?time_range=short_term&limit=1' },
    { name: 'Followed Artists', path: '/me/following?type=artist&limit=1' },
    { name: 'Global Top 50 Playlist', path: '/playlists/37i9dQZEVXbMDoHDwVN2tF/tracks?limit=1' },
    { name: 'New Releases', path: '/browse/new-releases?limit=1' },
    { name: 'Genre Seeds (deprecated)', path: '/recommendations/available-genre-seeds' },
    { name: 'Search', path: '/search?q=genre:rock&type=track&limit=1' },
  ];

  const results: EndpointTest[] = [];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${SPOTIFY_API}${ep.path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let detail: string | undefined;
      if (!res.ok) {
        try {
          const body = await res.text();
          detail = body.substring(0, 200);
        } catch {
          detail = undefined;
        }
      }

      results.push({
        name: ep.name,
        endpoint: ep.path,
        status: res.ok ? 'ok' : 'failed',
        code: res.status,
        detail,
      });
    } catch (err) {
      results.push({
        name: ep.name,
        endpoint: ep.path,
        status: 'failed',
        code: 0,
        detail: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.filter((r) => r.status === 'failed').length;

  // --- Deep diagnostics (only if ?deep=1) ---
  let deepDiag = null;
  if (deep) {
    try {
      const client = new SpotifyClient(accessToken);

      // Check what top artists actually look like
      const topArtistsRaw = await fetch(`${SPOTIFY_API}/me/top/artists?time_range=medium_term&limit=5`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json()).catch(() => null);

      const topArtistsSample = topArtistsRaw?.items?.map((a: { name: string; genres: string[]; id: string }) => ({
        name: a.name,
        genres: a.genres,
        id: a.id,
      })) ?? [];

      // Build heard profile
      const profile = await buildHeardProfile(client);
      const topGenres = getTopGenres(profile, 20);

      // Try a sample search and check overlap (limit=10 is dev mode max)
      const sampleSearch = await client.search('genre:"pop"', 'track', 10).catch(() => []);
      const sampleUnheard = filterUnheardTracks(sampleSearch, profile, false);

      // Try a paginated search (3 pages of 10 = 30 results)
      const broadSearch = await client.searchPaginated('genre:"rock"', 'track', 30).catch(() => []);
      const broadUnheard = filterUnheardTracks(broadSearch, profile, false);

      // Check artist overlap for broad search
      const broadArtistAnalysis = broadSearch.map(t => ({
        track: t.name,
        artist: t.artists[0]?.name,
        artistId: t.artists[0]?.id,
        artistKnown: profile.artistIds.has(t.artists[0]?.id),
        trackHeard: profile.trackIds.has(t.id),
        isrcMatch: t.external_ids?.isrc ? profile.isrcs.has(t.external_ids.isrc) : false,
      }));

      deepDiag = {
        heardProfile: {
          trackCount: profile.trackIds.size,
          isrcCount: profile.isrcs.size,
          artistCount: profile.artistIds.size,
          genreCount: profile.knownGenres.size,
          topGenres,
          sampleArtistIds: [...profile.artistIds].slice(0, 10),
        },
        topArtistsSample,
        sampleSearch: {
          query: 'genre:"pop"',
          totalReturned: sampleSearch.length,
          unheardCount: sampleUnheard.length,
          tracks: sampleSearch.map(t => ({
            name: t.name,
            artist: t.artists[0]?.name,
            id: t.id,
            inProfile: profile.trackIds.has(t.id),
          })),
        },
        broadSearch: {
          query: 'genre:"rock" (paginated)',
          totalReturned: broadSearch.length,
          unheardCount: broadUnheard.length,
          analysis: broadArtistAnalysis,
        },
      };
    } catch (err) {
      deepDiag = { error: err instanceof Error ? err.message : 'Deep diagnostics failed' };
    }
  }

  return NextResponse.json({
    summary: { ok: okCount, failed: failCount, total: results.length },
    results,
    ...(deep ? { deep: deepDiag } : {}),
  });
}
