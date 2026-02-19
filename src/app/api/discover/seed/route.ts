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
  const artistName = request.nextUrl.searchParams.get('name');
  const genresParam = request.nextUrl.searchParams.get('genres');

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId parameter' }, { status: 400 });
  }

  const client = new SpotifyClient(accessToken);

  // Strategy 1: Related artists endpoint (blocked in dev mode, but try anyway)
  try {
    const related = await client.getRelatedArtists(artistId);
    if (related.length > 0) {
      return NextResponse.json({ artists: related, source: 'related' });
    }
  } catch (err) {
    console.log('[Seed] Related artists blocked:', (err as Error)?.message);
  }

  // Strategy 2: Genre-based search (genres may come from client or artist lookup)
  let genres = genresParam ? genresParam.split(',').map((g) => g.trim()).filter(Boolean) : [];

  if (genres.length === 0) {
    try {
      const artist = await client.getArtist(artistId);
      genres = artist.genres ?? [];
    } catch {
      // Artist lookup may also strip genres
    }
  }

  if (genres.length > 0) {
    try {
      const allResults = new Map<string, Awaited<ReturnType<typeof client.searchArtists>>[0]>();

      for (const genre of genres.slice(0, 3)) {
        const results = await client.searchArtists(`genre:"${genre}"`);
        for (const a of results) {
          if (a.id !== artistId && !allResults.has(a.id)) {
            allResults.set(a.id, a);
          }
        }
      }

      if (allResults.size > 0) {
        return NextResponse.json({ artists: Array.from(allResults.values()), source: 'genre-search' });
      }
    } catch (err) {
      console.log('[Seed] Genre search failed:', (err as Error)?.message);
    }
  }

  // Strategy 3: Name-based search (always works -- Spotify returns contextually similar results)
  if (artistName) {
    try {
      const results = await client.searchArtists(artistName);
      const filtered = results.filter((a) => a.id !== artistId);
      return NextResponse.json({ artists: filtered, source: 'name-search' });
    } catch (error) {
      console.error('[Seed] Name search failed:', error);
      const message = error instanceof Error ? error.message : 'Search failed';
      if (message.startsWith('rate_limit')) {
        return NextResponse.json({ error: message }, { status: 429 });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ artists: [], source: 'none' });
}
