import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const accessToken = authHeader.slice(7);

  try {
    const { name, trackIds } = await req.json();

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json({ error: 'At least one track is required' }, { status: 400 });
    }

    const client = new SpotifyClient(accessToken);
    const uris = trackIds.map((id: string) => `spotify:track:${id}`);

    console.log('[Playlist Create] Attempting to create playlist:', { name, trackCount: trackIds.length });

    const playlist = await client.createPlaylist(name, uris);

    console.log('[Playlist Create] Success! Playlist ID:', playlist.id);

    return NextResponse.json({
      id: playlist.id,
      url: playlist.external_urls.spotify,
      trackCount: trackIds.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Playlist Create] Full error:', msg);

    if (msg.includes('403')) {
      const spotifyBody = msg.replace('Spotify API error: 403 - ', '');
      let detail = spotifyBody;
      try {
        const parsed = JSON.parse(spotifyBody);
        detail = parsed?.error?.message || spotifyBody;
      } catch { /* not json */ }

      return NextResponse.json(
        {
          error: `Spotify 403: ${detail}`,
          detail: msg,
        },
        { status: 403 },
      );
    }
    if (msg.includes('429')) {
      return NextResponse.json({ error: 'Rate limited — try again in a moment' }, { status: 429 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
