import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient, SpotifyTrack } from '@/lib/spotify';
import { buildHeardProfile, isArtistKnown, filterUnheardTracks } from '@/lib/heard-profile';

/**
 * Fresh Drops — finds tracks from artists outside the user's bubble.
 *
 * Runs searches sequentially in small batches to avoid rate limits.
 */

const SEARCH_GENRES = [
  'indie-pop', 'synth-pop', 'shoegaze', 'post-punk',
  'neo-soul', 'trip-hop', 'lo-fi', 'afrobeat',
  'garage rock', 'psychedelic', 'new wave', 'dream pop',
];

async function batchSearch(
  client: SpotifyClient,
  queries: string[],
  batchSize = 3
): Promise<SpotifyTrack[]> {
  const allTracks: SpotifyTrack[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (q) => {
        try {
          return await client.search(q, 'track', 30);
        } catch (err) {
          console.error(`[Fresh Drops] Search "${q}" failed:`, err instanceof Error ? err.message : err);
          return [] as SpotifyTrack[];
        }
      })
    );

    for (const tracks of results) {
      for (const track of tracks) {
        if (track?.id && !seen.has(track.id)) {
          seen.add(track.id);
          allTracks.push(track);
        }
      }
    }

    if (i + batchSize < queries.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return allTracks;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);
    const profile = await buildHeardProfile(client);

    const queries = SEARCH_GENRES.map((g) => `genre:"${g}"`);
    console.log(`[Fresh Drops] Searching ${queries.length} genres in batches of 3`);

    const allTracks = await batchSearch(client, queries, 3);
    console.log(`[Fresh Drops] ${allTracks.length} unique tracks from search`);

    // Filter out heard tracks
    const unheardTracks = filterUnheardTracks(allTracks, profile, false);

    // Filter to unknown primary artists
    const freshTracks = unheardTracks.filter((track) => {
      const primaryArtist = track.artists?.[0];
      if (!primaryArtist?.id) return true;
      return !isArtistKnown(primaryArtist.id, profile);
    });

    console.log(`[Fresh Drops] ${unheardTracks.length} unheard → ${freshTracks.length} from unknown artists`);

    const shuffled = freshTracks.sort(() => Math.random() - 0.5);

    return NextResponse.json({
      tracks: shuffled.slice(0, 30),
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
