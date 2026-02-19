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
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId parameter' }, { status: 400 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const related = await client.getRelatedArtists(artistId);
    return NextResponse.json({ artists: related });
  } catch (error) {
    console.error('[Seed] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch related artists';
    if (message.startsWith('rate_limit')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
