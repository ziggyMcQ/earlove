import { NextRequest, NextResponse } from 'next/server';
import { getSpotifyTokens, SpotifyClient } from '@/lib/spotify';
import { setSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Handle errors from Spotify
  if (error) {
    console.error('[Auth Callback] Spotify error:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }

  if (!code) {
    console.error('[Auth Callback] No code received');
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Exchange code for tokens
    const tokens = await getSpotifyTokens(code);
    
    // Get user profile
    const client = new SpotifyClient(tokens.access_token);
    const profile = await client.getMe();
    
    // Store session
    await setSession({
      tokens,
      user: {
        id: profile.id,
        name: profile.display_name,
        image: profile.images?.[0]?.url,
      },
    });

    console.log(`[Auth Callback] User ${profile.display_name} logged in`);
    
    // Redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (err) {
    console.error('[Auth Callback] Error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
