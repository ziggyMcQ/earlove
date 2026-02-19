'use client';

import { useState } from 'react';
import SpotifyLink from './SpotifyLink';

interface Track {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
    release_date?: string;
  };
  external_urls: { spotify: string };
}

export interface CurateTabProps {
  collectedTracks: Track[];
  onRemoveTrack: (id: string) => void;
  onClearAll: () => void;
  onCreatePlaylist: (name: string) => Promise<void>;
  creating: boolean;
  createError: string | null;
  createSuccess: string | null;
}

export default function CurateTab(props: CurateTabProps) {
  const {
    collectedTracks, onRemoveTrack, onClearAll,
    onCreatePlaylist, creating, createError, createSuccess,
  } = props;

  const [playlistName, setPlaylistName] = useState('');

  const handleCreate = () => {
    const name = playlistName.trim() || `earlove mix — ${new Date().toLocaleDateString()}`;
    onCreatePlaylist(name);
  };

  if (collectedTracks.length === 0 && !createSuccess) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-4xl opacity-30">&#x1F3B6;</div>
        <h2 className="text-xl font-bold text-zinc-400">Your playlist is empty</h2>
        <p className="text-zinc-600 text-sm max-w-md mx-auto">
          Head over to <span className="text-green-400">Discover</span> and tap the{' '}
          <span className="font-mono text-green-400">+</span> button on any track to start building your playlist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Playlist header */}
      <section className="text-center space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">
          Your <span className="text-green-400">Mix</span>
        </h2>
        <p className="text-zinc-600 text-xs font-mono">
          {collectedTracks.length} track{collectedTracks.length !== 1 ? 's' : ''} collected
        </p>
      </section>

      {/* Name input + create button */}
      {!createSuccess && (
        <section className="flex flex-col sm:flex-row items-center gap-3 max-w-lg mx-auto">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="playlist name (optional)"
            className="flex-1 w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-4 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-green-500/40"
          />
          <button
            onClick={handleCreate}
            disabled={creating || collectedTracks.length === 0}
            className={`
              px-5 py-2 rounded-lg text-sm font-medium transition-all border whitespace-nowrap
              ${creating
                ? 'bg-zinc-800/30 border-zinc-700/30 text-zinc-500 cursor-wait'
                : 'bg-green-500/15 border-green-500/30 text-green-400 hover:bg-green-500/25 cursor-pointer'
              }
            `}
          >
            {creating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-3 w-3 border-b border-green-500" />
                creating...
              </span>
            ) : (
              'Create on Spotify'
            )}
          </button>
        </section>
      )}

      {createError && (
        <div className="text-center space-y-3 bg-red-500/5 border border-red-500/15 rounded-xl p-5">
          <p className="text-red-400 text-sm font-medium">{createError}</p>
          {(createError.toLowerCase().includes('permission') || createError.includes('403') || createError.toLowerCase().includes('forbidden')) && (
            <div className="space-y-3">
              <p className="text-zinc-400 text-xs max-w-md mx-auto leading-relaxed">
                This can happen if authorization is stale or if Spotify requires a Premium subscription for playlist creation in dev mode. Your collected tracks are saved — they&apos;ll still be here when you get back.
              </p>
              <button
                onClick={() => {
                  try { localStorage.removeItem('earlove_session'); } catch {}
                  window.location.href = '/api/auth/login';
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-all"
              >
                Re-authorize with Spotify
              </button>
            </div>
          )}
        </div>
      )}

      {createSuccess && (
        <section className="text-center bg-green-500/10 border border-green-500/20 rounded-xl p-5 space-y-2">
          <p className="text-green-400 font-medium">{'\u2713'} Playlist created!</p>
          <p className="text-zinc-500 text-xs font-mono">{createSuccess}</p>
        </section>
      )}

      {/* Track list */}
      {collectedTracks.length > 0 && (
        <section className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800/30 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em]">Tracks</span>
            <button
              onClick={onClearAll}
              className="text-[10px] font-mono text-zinc-600 hover:text-red-400 transition-colors"
            >
              [clear all]
            </button>
          </div>
          <div className="divide-y divide-zinc-800/20">
            {collectedTracks.map((track, i) => {
              const img = track.album.images?.[2]?.url || track.album.images?.[0]?.url;
              return (
                <div key={track.id} className="flex items-center gap-3 px-5 py-2.5 group hover:bg-zinc-800/20 transition-colors">
                  <span className="text-zinc-700 w-4 text-right text-[10px] font-mono">{i + 1}</span>
                  <SpotifyLink
                    type="track"
                    id={track.id}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    {img && (
                      <img src={img} alt={track.album.name} className="w-9 h-9 rounded shadow-lg" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-green-400 transition-colors">{track.name}</p>
                      <p className="text-zinc-600 text-xs truncate">{track.artists.map((a) => a.name).join(', ')}</p>
                    </div>
                  </SpotifyLink>
                  <button
                    onClick={() => onRemoveTrack(track.id)}
                    className="flex-shrink-0 text-zinc-700 hover:text-red-400 transition-colors text-xs"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
