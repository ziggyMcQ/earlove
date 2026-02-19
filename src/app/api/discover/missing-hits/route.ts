import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, filterUnheardTracks } from '@/lib/heard-profile';

/**
 * Missing Hits — simplified to a single search to debug
 * why results aren't coming through despite working in diagnostics.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const profile = await buildHeardProfile(client);

    // Single search — identical to what works in the debug endpoint
    let searchResults: Awaited<ReturnType<typeof client.search>> = [];
    let searchError: string | null = null;
    try {
      searchResults = await client.search('genre:"pop"', 'track', 50);
    } catch (err) {
      searchError = err instanceof Error ? err.message : String(err);
      searchResults = [];
    }

    const unheardTracks = filterUnheardTracks(searchResults, profile, false);

    return NextResponse.json({
      tracks: unheardTracks.slice(0, 30),
      debug: {
        searchReturned: searchResults.length,
        unheardCount: unheardTracks.length,
        profileTracks: profile.trackIds.size,
        profileArtists: profile.artistIds.size,
        searchError,
      },
      profileStats: {
        tracksAnalyzed: profile.totalTracksAnalyzed,
        buildTime: profile.buildTime,
      },
    });
  } catch (error) {
    console.error('[Missing Hits] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
