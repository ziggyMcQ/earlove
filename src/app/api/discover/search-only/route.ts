import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';

/**
 * Lightweight genre search — NO profile building.
 * Returns raw search results. Filtering happens client-side.
 * Supports type=track (default) or type=artist.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const genre = request.nextUrl.searchParams.get('genre');
  const rawQuery = request.nextUrl.searchParams.get('q');
  const type = request.nextUrl.searchParams.get('type') || 'track';

  if (!genre && !rawQuery) {
    return NextResponse.json({ error: 'Missing genre or q parameter' }, { status: 400 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const query = rawQuery || `genre:"${genre}"`;

    if (type === 'artist') {
      const artists = await client.searchArtists(query);
      return NextResponse.json({
        genre: genre || rawQuery,
        artists: artists ?? [],
        total: artists?.length ?? 0,
      });
    }

    const tracks = await client.searchPaginated(query, 'track', 30);
    return NextResponse.json({
      genre: genre || rawQuery,
      tracks,
      total: tracks.length,
    });
  } catch (error) {
    console.error('[Search Only] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
