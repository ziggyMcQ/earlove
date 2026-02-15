import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, getTopGenres, getUnknownGenres } from '@/lib/heard-profile';

export async function GET() {
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    
    // Build the heard profile
    const profile = await buildHeardProfile(client);
    
    // Get available genre seeds from Spotify
    const availableGenres = await client.getAvailableGenres();
    
    // Get user's top genres
    const knownGenres = getTopGenres(profile, 10);
    
    // Get genres they haven't explored
    const unknownGenres = getUnknownGenres(availableGenres, profile, 10);
    
    return NextResponse.json({
      genres: {
        known: knownGenres,
        unknown: unknownGenres,
      },
      profileStats: {
        tracksAnalyzed: profile.totalTracksAnalyzed,
        buildTime: profile.buildTime,
      },
    });
  } catch (error) {
    console.error('[Genre Split] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
