import { NextRequest, NextResponse } from 'next/server';
import { SpotifyClient } from '@/lib/spotify';
import { buildHeardProfile } from '@/lib/heard-profile';
import { analyzeProfile } from '@/lib/profile-analysis';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const client = new SpotifyClient(accessToken);

    // getMe() serves as token validation AND provides user info.
    // Retry up to 3 times on 429s — don't let rate limits look like bad tokens.
    let user: { id: string; display_name: string; images: { url: string }[] } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        user = await client.getMe();
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = msg.includes('429') || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('too many');

        if (is429 && attempt < 2) {
          console.log(`[Profile API] getMe() rate limited, retrying in ${(attempt + 1) * 3}s (attempt ${attempt + 1}/3)`);
          await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }

        // If it's a rate limit on the last attempt, return 429 (NOT 401)
        if (is429) {
          console.error('[Profile API] getMe() rate limited after all retries');
          return NextResponse.json(
            { error: 'Spotify rate limit — please wait a moment and try again' },
            { status: 429 }
          );
        }

        // Actual auth failure
        console.error('[Profile API] Token validation failed:', msg);
        return NextResponse.json(
          { error: `Token invalid or expired. Please log out and log back in. (${msg})` },
          { status: 401 }
        );
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Could not validate token — please try again' },
        { status: 500 }
      );
    }

    const profile = await buildHeardProfile(client);
    const analysis = analyzeProfile(profile);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.display_name,
        image: user.images?.[0]?.url ?? '',
      },
      ...analysis,
      heardTrackIds: [...profile.trackIds],
      heardArtistIds: [...profile.artistIds],
      sources: profile.sources,
      buildTime: profile.buildTime,
    });
  } catch (error) {
    console.error('[Profile API] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to build profile';
    const is429 = msg.includes('429') || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('too many');
    return NextResponse.json(
      { error: is429 ? 'Spotify rate limit — please wait a moment and try again' : msg },
      { status: is429 ? 429 : 500 }
    );
  }
}
