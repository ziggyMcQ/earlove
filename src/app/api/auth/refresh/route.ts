import { NextRequest, NextResponse } from 'next/server';
import { refreshSpotifyToken } from '@/lib/spotify';

/**
 * POST /api/auth/refresh
 * Accepts { refreshToken } and returns fresh tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return NextResponse.json({ error: 'Missing refresh token' }, { status: 400 });
    }

    const tokens = await refreshSpotifyToken(refreshToken);

    return NextResponse.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
    });
  } catch (err) {
    console.error('[Auth/Refresh] Error:', err);
    const msg = err instanceof Error ? err.message : 'Token refresh failed';
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
