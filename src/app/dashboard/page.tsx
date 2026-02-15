import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DiscoveryCards } from './discovery-cards';

export default async function Dashboard() {
  const session = await getSession();
  
  if (!session) {
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-2xl font-bold">
            ear<span className="text-green-500">love</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">
              {session.user.name}
            </span>
            {session.user.image && (
              <img 
                src={session.user.image} 
                alt={session.user.name}
                className="w-8 h-8 rounded-full"
              />
            )}
            <Link 
              href="/api/auth/logout"
              className="text-zinc-500 hover:text-white text-sm transition-colors"
            >
              Logout
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">What haven&apos;t you heard?</h1>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Choose a discovery mode. We&apos;ll analyze your listening history 
            and surface music you&apos;ve statistically never played.
          </p>
        </div>

        <DiscoveryCards />
      </div>
    </main>
  );
}
