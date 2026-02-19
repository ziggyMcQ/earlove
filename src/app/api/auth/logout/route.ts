import { NextRequest, NextResponse } from 'next/server';

// Logout is now handled client-side via localStorage.clear()
// This route exists as a fallback
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/', request.url));
}
