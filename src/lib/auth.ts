'use client';

import { useState, useEffect, useCallback } from 'react';

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: {
    id: string;
    name: string;
    image?: string;
  };
}

const STORAGE_KEY = 'earlove_session';

// 5-minute buffer before expiry to trigger refresh
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function getSession(): UserSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session: UserSession = JSON.parse(raw);

    if (!session.accessToken) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Returns true if the token needs refreshing (within REFRESH_BUFFER_MS of expiry)
 */
function needsRefresh(session: UserSession): boolean {
  if (!session.expiresAt) return false;
  return Date.now() > session.expiresAt - REFRESH_BUFFER_MS;
}

/**
 * Returns true if the token is fully expired (past expiry time)
 */
function isExpired(session: UserSession): boolean {
  if (!session.expiresAt) return false;
  return Date.now() > session.expiresAt;
}

let refreshPromise: Promise<UserSession | null> | null = null;

/**
 * Refresh the access token using the refresh token.
 * Deduplicates concurrent refresh calls.
 */
async function refreshAccessToken(session: UserSession): Promise<UserSession | null> {
  // If a refresh is already in flight, return the same promise
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      console.log('[Auth] Refreshing access token...');
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!res.ok) {
        console.error('[Auth] Refresh failed with status:', res.status);
        return null;
      }

      const data = await res.json();
      const updated: UserSession = {
        ...session,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      };

      saveSession(updated);
      console.log('[Auth] Token refreshed, new expiry:', new Date(updated.expiresAt).toLocaleTimeString());
      return updated;
    } catch (err) {
      console.error('[Auth] Refresh error:', err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Get a valid session, refreshing the token if needed.
 * Returns null if no session or refresh fails.
 */
export async function getValidSession(): Promise<UserSession | null> {
  const session = getSession();
  if (!session) return null;

  if (needsRefresh(session)) {
    const refreshed = await refreshAccessToken(session);
    if (!refreshed) {
      // Refresh failed — if token is fully expired, clear it
      if (isExpired(session)) {
        clearSession();
        return null;
      }
      // Token might still work for a bit, return it
      return session;
    }
    return refreshed;
  }

  return session;
}

/**
 * React hook for session state with automatic token refresh
 */
export function useSession() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial load + refresh if needed
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const valid = await getValidSession();
      if (!cancelled) {
        if (!valid) {
          clearSession();
        }
        setSession(valid);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Periodic refresh check (every 60s)
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(async () => {
      if (needsRefresh(session)) {
        console.log('[Auth] Periodic check: token needs refresh');
        const refreshed = await refreshAccessToken(session);
        if (refreshed) {
          setSession(refreshed);
        } else if (isExpired(session)) {
          console.log('[Auth] Token expired and refresh failed, clearing');
          clearSession();
          setSession(null);
          window.location.href = '/?error=session_expired';
        }
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [session]);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    window.location.href = '/';
  }, []);

  return { session, loading, logout };
}

/**
 * Fetch wrapper that includes the access token
 */
export async function authFetch(url: string, session: UserSession): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
}
