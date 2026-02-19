'use client';

import { spotifyUri, spotifyWebUrl } from '@/lib/spotify-link';
import { ReactNode, useCallback } from 'react';

export interface SpotifyLinkProps {
  type: 'track' | 'album' | 'artist';
  id: string;
  className?: string;
  title?: string;
  children: ReactNode;
}

export default function SpotifyLink({ type, id, className, title, children }: SpotifyLinkProps) {
  const handleClick = useCallback(() => {
    const webUrl = spotifyWebUrl(type, id);
    const timeout = setTimeout(() => {
      window.open(webUrl, '_blank');
    }, 500);
    const cancel = () => {
      clearTimeout(timeout);
      window.removeEventListener('blur', cancel);
    };
    window.addEventListener('blur', cancel);
  }, [type, id]);

  return (
    <a
      href={spotifyUri(type, id)}
      onClick={handleClick}
      className={className}
      title={title}
    >
      {children}
    </a>
  );
}
