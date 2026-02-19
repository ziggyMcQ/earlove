import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient, SpotifyArtist } from '@/lib/spotify';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const artistId = request.nextUrl.searchParams.get('artistId');
  const artistName = request.nextUrl.searchParams.get('name');

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId parameter' }, { status: 400 });
  }

  const client = new SpotifyClient(accessToken);

  // Strategy 1: Related artists endpoint (blocked in dev mode, but worth trying)
  try {
    const related = await client.getRelatedArtists(artistId);
    if (related.length > 0) {
      return NextResponse.json({ artists: related, source: 'related' });
    }
  } catch (err) {
    console.log('[Seed] Related artists blocked:', (err as Error)?.message);
  }

  // Strategy 2: Get seed artist's genres via direct lookup, then search by genre
  try {
    const artist = await client.getArtist(artistId);
    const genres = artist.genres ?? [];
    if (genres.length > 0) {
      const allResults = new Map<string, SpotifyArtist>();
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
    }
  } catch (err) {
    console.log('[Seed] Genre lookup/search failed:', (err as Error)?.message);
  }

  // Strategy 3: Search for tracks by the artist name, extract OTHER artists
  // from those results. Spotify's track search returns contextually related music.
  if (artistName) {
    try {
      const tracks = await client.searchPaginated(artistName, 'track', 30);
      const artistMap = new Map<string, { id: string; name: string; trackCount: number }>();

      for (const track of tracks) {
        for (const a of track.artists) {
          if (a.id !== artistId && !artistMap.has(a.id)) {
            artistMap.set(a.id, { id: a.id, name: a.name, trackCount: 1 });
          } else if (a.id !== artistId && artistMap.has(a.id)) {
            artistMap.get(a.id)!.trackCount++;
          }
        }
      }

      const candidateIds = Array.from(artistMap.values())
        .sort((a, b) => b.trackCount - a.trackCount)
        .slice(0, 8)
        .map((a) => a.id);

      const fullArtists: SpotifyArtist[] = [];
      for (const id of candidateIds) {
        try {
          const full = await client.getArtist(id);
          fullArtists.push(full);
        } catch {
          // Skip failed lookups, keep going
        }
      }

      return NextResponse.json({ artists: fullArtists, source: 'track-artist-extraction' });
    } catch (error) {
      console.error('[Seed] Track extraction failed:', error);
      const message = error instanceof Error ? error.message : 'Search failed';
      if (message.startsWith('rate_limit')) {
        return NextResponse.json({ error: message }, { status: 429 });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ artists: [], source: 'none' });
}
