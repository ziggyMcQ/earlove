import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, filterUnheardTracks } from '@/lib/heard-profile';

// Spotify's Global Top 50 playlist ID
const GLOBAL_TOP_50_PLAYLIST = '37i9dQZEVXbMDoHDwVN2tF';

export async function GET() {
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    
    // Build the heard profile
    const profile = await buildHeardProfile(client);
    
    // Fetch Global Top 50
    const topTracks = await client.getPlaylistTracks(GLOBAL_TOP_50_PLAYLIST);
    
    // Filter out tracks the user has heard
    const unheardTracks = filterUnheardTracks(topTracks, profile, true);
    
    return NextResponse.json({
      tracks: unheardTracks,
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
