import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, filterUnheardTracks } from '@/lib/heard-profile';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const genre = request.nextUrl.searchParams.get('genre');
  if (!genre) {
    return NextResponse.json({ error: 'Missing genre parameter' }, { status: 400 });
  }

  try {
    const client = new SpotifyClient(accessToken);

    // Build heard profile
    const profile = await buildHeardProfile(client);

    // Search with pagination (dev mode: max 10 per page)
    const searchResults = await client.searchPaginated(`genre:"${genre}"`, 'track', 30);

    // Filter — no strict ISRC mode (external_ids removed in dev mode)
    const unheardTracks = filterUnheardTracks(searchResults, profile, false);

    return NextResponse.json({
      genre,
      tracks: unheardTracks.slice(0, 20),
      searchReturned: searchResults.length,
      unheardCount: unheardTracks.length,
      searchError: null,
      profileStats: {
        tracksAnalyzed: profile.totalTracksAnalyzed,
        artistCount: profile.artistIds.size,
        buildTime: profile.buildTime,
        sources: profile.sources,
      },
    });
  } catch (error) {
    console.error('[Genre Explore] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Genre exploration failed' },
      { status: 500 }
    );
  }
}
