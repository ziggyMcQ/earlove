import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildLibrary } from '@/lib/heard-profile';

export const maxDuration = 60;

/**
 * Phase 2: Library (chunked — up to 20 pages per call)
 * Accepts ?offset=N to continue from a previous chunk.
 * Returns nextOffset (number if more pages, null if done).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const offsetParam = request.nextUrl.searchParams.get('offset');
  const startOffset = offsetParam ? parseInt(offsetParam, 10) : 0;

  try {
    const client = new SpotifyClient(accessToken);
    const result = await buildLibrary(client, startOffset, 20);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Profile/Library] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed';
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
