import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildPlaylists } from '@/lib/heard-profile';

export const maxDuration = 60;

/**
 * Phase 3: Playlists (variable API calls)
 * Owned playlists + their tracks
 * Returns: additional track/artist IDs, timeline data, playlist counts
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const result = await buildPlaylists(client);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Profile/Playlists] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
