import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildMainstreamAnalysis } from '@/lib/heard-profile';

export const maxDuration = 60;

/**
 * POST /api/profile/mainstream
 * Analyze how mainstream the user's taste is by searching for popular tracks
 * in each genre and comparing against their heard profile.
 *
 * Body: { genres: string[], heardTrackIds: string[], heardArtistIds: string[] }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { genres, heardTrackIds, heardArtistIds } = body;

    if (!genres?.length || !heardTrackIds?.length) {
      return NextResponse.json(
        { error: 'Missing genres or heardTrackIds' },
        { status: 400 }
      );
    }

    const client = new SpotifyClient(accessToken);
    const result = await buildMainstreamAnalysis(
      client,
      genres,
      heardTrackIds,
      heardArtistIds ?? [],
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Profile/Mainstream] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
