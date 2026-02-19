import { NextRequest, NextResponse } from 'next/server';
import { getSpotifyTokens } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Token exchange — the ONLY network call during login.
    // We deliberately skip getMe() here to avoid rate-limit issues.
    // User profile info will be fetched lazily on the dashboard.
    const tokens = await getSpotifyTokens(code);

    const session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      user: {
        id: '',
        name: '',
        image: '',
      },
    };

    const sessionJson = JSON.stringify(session).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html>
<head><title>Logging in...</title></head>
<body style="background:#18181b;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Logging in...</p>
<script>
  try {
    localStorage.setItem('earlove_session', '${sessionJson}');
    window.location.replace('/dashboard');
  } catch(e) {
    document.body.innerText = 'Login failed: ' + e.message;
  }
</script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('[Auth Callback] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const html = `<!DOCTYPE html>
<html>
<head><title>Login Failed</title></head>
<body style="background:#18181b;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center">
<h2 style="color:#ef4444">Login Failed</h2>
<p style="color:#a1a1aa;max-width:600px;word-break:break-all">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
<a href="/api/auth/login" style="color:#22c55e;margin-top:20px">Try again</a>
</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
