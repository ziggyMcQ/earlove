import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildGenres } from '@/lib/heard-profile';

export const maxDuration = 60;

/**
 * Phase 4: Genre Probe (~40 API calls)
 * Infers genres from known artist IDs via search probing
 * Accepts artist IDs as POST body
 * Returns: genre data for radar chart, explorer score, blind spots
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const artistIds: string[] = body.artistIds ?? [];
    const preloadedArtistGenres = body.preloadedArtistGenres ?? undefined;

    if (artistIds.length === 0) {
      return NextResponse.json({ error: 'No artist IDs provided' }, { status: 400 });
    }

    const client = new SpotifyClient(accessToken);
    const result = await buildGenres(client, artistIds, preloadedArtistGenres);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Profile/Genres] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
