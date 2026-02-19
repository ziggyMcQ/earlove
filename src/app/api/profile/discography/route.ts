import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildDiscography } from '@/lib/heard-profile';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const accessToken = authHeader.slice(7);
    const body = await request.json();
    const { topArtistIds, heardTrackIds, artistNames } = body;

    if (!topArtistIds?.length) {
      return NextResponse.json({ error: 'No artist IDs provided' }, { status: 400 });
    }

    const client = new SpotifyClient(accessToken);
    const result = await buildDiscography(
      client,
      topArtistIds,
      new Set(heardTrackIds ?? []),
      artistNames ?? {},
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API /profile/discography]', message);

    if (message.includes('401')) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (message.includes('429')) {
      return NextResponse.json({ error: 'Rate limited — wait a moment and try again' }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
