import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * Minimal health check — makes ONE Spotify API call (/me) and reports
 * exactly what happens: success, 429 (rate limited), 401 (bad token), etc.
 * Use this to diagnose without triggering further rate limits.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.replace('Bearer ', '') || request.nextUrl.searchParams.get('token');

  if (!accessToken) {
    return NextResponse.json({
      error: 'No access token',
      hint: 'Open browser console on the dashboard and run: fetch("/api/health?token=" + JSON.parse(localStorage.getItem("earlove_session")).accessToken).then(r=>r.json()).then(console.log)',
    }, { status: 401 });
  }

  const start = Date.now();

  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const elapsed = Date.now() - start;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    if (res.ok) {
      const data = await res.json();

      // Test playlist write permission with a dry-run-style check:
      // Try to create a playlist, see if it succeeds or 403s
      let playlistTest: Record<string, unknown> = { status: 'skipped' };
      const testWrite = request.nextUrl.searchParams.get('testwrite') === '1';
      if (testWrite) {
        const body = JSON.stringify({
          name: '_earlove_test_' + Date.now(),
          public: false,
          description: 'Test — safe to delete',
        });
        const hdrs = {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        };

        const tryEndpoint = async (url: string) => {
          const r = await fetch(url, { method: 'POST', headers: hdrs, body });
          const txt = await r.text().catch(() => '');
          if (r.ok) {
            try {
              const pl = JSON.parse(txt);
              await fetch(`https://api.spotify.com/v1/playlists/${pl.id}/followers`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
              }).catch(() => {});
            } catch {}
          }
          return { code: r.status, ok: r.ok, body: txt.substring(0, 300) };
        };

        try {
          const oldEndpoint = await tryEndpoint(`https://api.spotify.com/v1/users/${data.id}/playlists`);
          const newEndpoint = await tryEndpoint(`https://api.spotify.com/v1/me/playlists`);
          playlistTest = {
            'POST /users/{id}/playlists': oldEndpoint,
            'POST /me/playlists': newEndpoint,
          };
        } catch (err) {
          playlistTest = { status: 'error', error: err instanceof Error ? err.message : String(err) };
        }
      }

      return NextResponse.json({
        status: 'ok',
        spotify_status: res.status,
        elapsed_ms: elapsed,
        user: data.display_name,
        user_id: data.id,
        product: data.product ?? 'unknown (stripped by dev mode)',
        retry_after: headers['retry-after'] ?? null,
        playlist_write_test: playlistTest,
      });
    }

    const body = await res.text().catch(() => '');
    return NextResponse.json({
      status: 'error',
      spotify_status: res.status,
      elapsed_ms: elapsed,
      body: body.substring(0, 500),
      retry_after: headers['retry-after'] ?? null,
      rate_limit_headers: {
        'retry-after': headers['retry-after'] ?? null,
        'x-ratelimit-limit': headers['x-ratelimit-limit'] ?? null,
        'x-ratelimit-remaining': headers['x-ratelimit-remaining'] ?? null,
        'x-ratelimit-reset': headers['x-ratelimit-reset'] ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({
      status: 'network_error',
      elapsed_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
