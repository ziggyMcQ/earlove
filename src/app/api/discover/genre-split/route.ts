import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile, getTopGenres } from '@/lib/heard-profile';
import { SPOTIFY_GENRES } from '@/lib/genres';

/**
 * Genre Split — shows genres the user knows vs genres to explore.
 *
 * Note: In Spotify dev mode, artist objects come back with empty genre
 * arrays. When that happens, we show all genres as explorable and skip
 * the "known" section. If genres ARE available, we split normally.
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

    const knownGenres = getTopGenres(profile, 15);

    let unknownGenres: string[];

    if (knownGenres.length > 0) {
      // Normal mode: show genres the user doesn't listen to
      const knownSet = new Set(knownGenres);
      const unknown = SPOTIFY_GENRES.filter((g) => !knownSet.has(g));
      unknownGenres = unknown.sort(() => Math.random() - 0.5).slice(0, 20);
    } else {
      // Dev mode fallback: genres are empty, show a curated random selection
      unknownGenres = [...SPOTIFY_GENRES].sort(() => Math.random() - 0.5).slice(0, 25);
    }

    return NextResponse.json({
      genres: {
        known: knownGenres,
        unknown: unknownGenres,
        devModeNote: knownGenres.length === 0
          ? 'Spotify dev mode strips genre data from artists. All genres shown as explorable.'
          : undefined,
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
