import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildBasics } from '@/lib/heard-profile';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const result = await buildBasics(client);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Profile/Basics] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';

    const longMatch = msg.match(/^rate_limit_long:(\d+)/);
    if (longMatch) {
      const waitSeconds = parseInt(longMatch[1], 10);
      return NextResponse.json(
        { error: 'rate_limit_long', retryAfter: waitSeconds },
        { status: 429 }
      );
    }

    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
