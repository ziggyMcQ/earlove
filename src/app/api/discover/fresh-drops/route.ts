import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, isArtistKnown } from '@/lib/heard-profile';

export async function GET() {
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    
    // Build the heard profile
    const profile = await buildHeardProfile(client);
    
    // Fetch new releases
    const newReleases = await client.getNewReleases(50);
    
    // Filter out albums from artists the user knows
    const unknownArtistReleases = newReleases.filter((album) => {
      // Check if ANY artist on the album is known
      const hasKnownArtist = album.artists.some((artist) => 
        isArtistKnown(artist.id, profile)
      );
      return !hasKnownArtist;
    });
    
    return NextResponse.json({
      albums: unknownArtistReleases,
      profileStats: {
        tracksAnalyzed: profile.totalTracksAnalyzed,
        buildTime: profile.buildTime,
      },
    });
  } catch (error) {
    console.error('[Fresh Drops] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Discovery failed' },
      { status: 500 }
    );
  }
}
