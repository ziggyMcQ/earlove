/**
 * Simple session management using cookies
 * For MVP - in production, use a proper session store
 */

import { cookies } from 'next/headers';
import { SpotifyTokens, refreshSpotifyToken } from './spotify';

const SESSION_COOKIE = 'earlove_session';

interface Session {
  tokens: SpotifyTokens;
  user: {
    id: string;
    name: string;
    image?: string;
  };
}

/**
 * Get the current session from cookies
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const session: Session = JSON.parse(sessionCookie.value);

    // Check if token is expired (with 5 min buffer)
    if (session.tokens.expires_at < Date.now() + 5 * 60 * 1000) {
      // Token is expired or about to expire, refresh it
      const newTokens = await refreshSpotifyToken(session.tokens.refresh_token);
      session.tokens = newTokens;

      // Update the cookie with new tokens
      await setSession(session);
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie
 */
export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies();
  
  cookieStore.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

/**
 * Clear the session
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Get valid access token (refreshes if needed)
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.tokens.access_token ?? null;
}
