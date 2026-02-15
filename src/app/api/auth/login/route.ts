import { NextResponse } from 'next/server';
import { getSpotifyAuthUrl } from '@/lib/spotify';

export async function GET() {
  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);
  
  const authUrl = getSpotifyAuthUrl(state);
  
  return NextResponse.redirect(authUrl);
}
