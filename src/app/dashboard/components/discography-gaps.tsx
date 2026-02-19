'use client';

import SpotifyLink from './SpotifyLink';

interface DiscographyAlbum {
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  albumImage?: string;
  releaseDate?: string;
  totalTracks: number;
  unheardCount: number;
  spotifyUrl?: string;
}

interface DiscographyGapsProps {
  albums: DiscographyAlbum[];
  artistsScanned: number;
}

export default function DiscographyGaps({ albums, artistsScanned }: DiscographyGapsProps) {
  if (albums.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-4">
        <p>No unheard albums found across {artistsScanned} artist{artistsScanned !== 1 ? 's' : ''}.</p>
        <p className="text-xs mt-1">You know your favorites well!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-500 text-xs text-center">
        {albums.length} album{albums.length !== 1 ? 's' : ''} with unheard tracks across {artistsScanned} artist{artistsScanned !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {albums.slice(0, 12).map((album) => (
          <SpotifyLink
            key={album.albumId}
            type="album"
            id={album.albumId}
            className="flex items-center gap-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl p-3 transition-colors group"
          >
            {album.albumImage ? (
              <img
                src={album.albumImage}
                alt={album.album}
                className="w-14 h-14 rounded-lg shadow-lg group-hover:shadow-green-500/10 transition-shadow flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-green-400 transition-colors">
                {album.album}
              </p>
              <p className="text-zinc-500 text-xs truncate">{album.artist}</p>
              <p className="text-xs mt-0.5">
                <span className="text-green-400">{album.unheardCount} unheard</span>
                <span className="text-zinc-600"> of {album.totalTracks} tracks</span>
                {album.releaseDate && <span className="text-zinc-600"> · {album.releaseDate.slice(0, 4)}</span>}
              </p>
            </div>
            <svg className="w-4 h-4 text-zinc-600 group-hover:text-green-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </SpotifyLink>
        ))}
      </div>
    </div>
  );
}
