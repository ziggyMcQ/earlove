import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const artistId = request.nextUrl.searchParams.get('artistId');
  const genresParam = request.nextUrl.searchParams.get('genres');

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId parameter' }, { status: 400 });
  }

  const client = new SpotifyClient(accessToken);

  try {
    const related = await client.getRelatedArtists(artistId);
    if (related.length > 0) {
      return NextResponse.json({ artists: related, source: 'related' });
    }
  } catch (err) {
    console.log('[Seed] Related artists endpoint failed, falling back to genre search:', (err as Error)?.message);
  }

  // Fallback: search by the seed artist's genres
  const genres = genresParam ? genresParam.split(',').map((g) => g.trim()).filter(Boolean) : [];
  if (genres.length === 0) {
    return NextResponse.json({ artists: [], source: 'none' });
  }

  try {
    const allResults = new Map<string, typeof artists[0]>();
    let artists: Awaited<ReturnType<typeof client.searchArtists>> = [];

    for (const genre of genres.slice(0, 3)) {
      const results = await client.searchArtists(`genre:"${genre}"`);
      for (const a of results) {
        if (a.id !== artistId && !allResults.has(a.id)) {
          allResults.set(a.id, a);
        }
      }
    }

    artists = Array.from(allResults.values());
    return NextResponse.json({ artists, source: 'genre-search' });
  } catch (error) {
    console.error('[Seed] Genre search fallback error:', error);
    const message = error instanceof Error ? error.message : 'Search failed';
    if (message.startsWith('rate_limit')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
