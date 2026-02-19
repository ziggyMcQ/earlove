export function spotifyUri(type: 'track' | 'album' | 'artist', id: string): string {
  return `spotify:${type}:${id}`;
}

export function spotifyWebUrl(type: 'track' | 'album' | 'artist', id: string): string {
  return `https://open.spotify.com/${type}/${id}`;
}
