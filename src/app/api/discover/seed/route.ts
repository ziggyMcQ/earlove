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

  // Strategy 3: Two-pass track search
  // Pass A: artist:"name" — finds literal collaborators (high confidence)
  // Pass B: plain name search — finds broader associations (keep only 2+ appearances)
  if (artistName) {
    type ArtistEntry = {
      id: string;
      name: string;
      trackCount: number;
      isCollaborator: boolean;
      sampleTracks: { name: string; albumName: string; albumImage?: string }[];
    };

    const artistMap = new Map<string, ArtistEntry>();

    const addTrack = (a: { id: string; name: string }, track: { name: string; album?: { name?: string; images?: { url: string }[] } }, collab: boolean) => {
      if (a.id === artistId) return;
      const sample = {
        name: track.name,
        albumName: track.album?.name ?? '',
        albumImage: (track.album?.images as { url: string }[])?.[2]?.url || (track.album?.images as { url: string }[])?.[0]?.url,
      };
      const existing = artistMap.get(a.id);
      if (!existing) {
        artistMap.set(a.id, { id: a.id, name: a.name, trackCount: 1, isCollaborator: collab, sampleTracks: [sample] });
      } else {
        existing.trackCount++;
        if (collab) existing.isCollaborator = true;
        if (existing.sampleTracks.length < 2) existing.sampleTracks.push(sample);
      }
    };

    try {
      // Pass A: collaborators
      const collabTracks = await client.searchPaginated(`artist:"${artistName}"`, 'track', 20);
      for (const track of collabTracks) {
        for (const a of track.artists) addTrack(a, track, true);
      }

      // Pass B: broader search (only if we need more results)
      if (artistMap.size < 8) {
        const broadTracks = await client.searchPaginated(artistName, 'track', 30);
        for (const track of broadTracks) {
          for (const a of track.artists) addTrack(a, track, false);
        }
      }
    } catch (error) {
      console.error('[Seed] Track search failed:', error);
      const message = error instanceof Error ? error.message : 'Search failed';
      if (message.startsWith('rate_limit')) {
        return NextResponse.json({ error: message }, { status: 429 });
      }
      // Continue with whatever we have so far
    }

    // Keep collaborators (any count) + broad matches appearing 2+ times
    const candidates = Array.from(artistMap.values())
      .filter((a) => a.isCollaborator || a.trackCount >= 2)
      .sort((a, b) => {
        if (a.isCollaborator !== b.isCollaborator) return a.isCollaborator ? -1 : 1;
        return b.trackCount - a.trackCount;
      })
      .slice(0, 12);

    const fullArtists: (SpotifyArtist & { context?: { trackCount: number; sampleTracks: { name: string; albumName: string; albumImage?: string }[] } })[] = [];
    for (const c of candidates) {
      try {
        const full = await client.getArtist(c.id);
        fullArtists.push({ ...full, context: { trackCount: c.trackCount, sampleTracks: c.sampleTracks } });
      } catch {
        fullArtists.push({
          id: c.id, name: c.name, genres: [], images: [],
          external_urls: { spotify: `https://open.spotify.com/artist/${c.id}` },
          context: { trackCount: c.trackCount, sampleTracks: c.sampleTracks },
        });
      }
    }

    return NextResponse.json({ artists: fullArtists, source: 'track-artist-extraction' });
  }

  return NextResponse.json({ artists: [], source: 'none' });
}
