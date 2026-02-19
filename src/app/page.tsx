'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'earlove';

export default function Home() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.replace('/dashboard');
    }
  }, [session, loading, router]);

  if (loading || session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin rounded-full h-6 w-6 border-b border-green-500"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-8">
      <div className="max-w-lg text-center space-y-10">
        <div>
          <h1 className="text-6xl font-bold tracking-tight mb-4">
            {APP_NAME === 'earlove' ? <>ear<span className="text-green-500">love</span></> : APP_NAME}
          </h1>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-xs mx-auto">
            we map your listening history to find the music you&apos;ve somehow never heard.
            the gaps. the blind spots. the genres you didn&apos;t know you were avoiding.
          </p>
        </div>

        <Link
          href="/api/auth/login"
          className="inline-flex items-center gap-3 bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3.5 rounded-full transition-colors"
        >
          <SpotifyIcon />
          connect with spotify
        </Link>

        <p className="text-[10px] text-zinc-700 font-mono">
          read-only &middot; we never post or modify anything &middot; 5 user limit (dev api)
        </p>
      </div>
    </main>
  );
}

function SpotifyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
