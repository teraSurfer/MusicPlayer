export const queryKeys = {
  songs: (q: string) => ['songs', { q }] as const,
  collection: (q: string) => ['collection', { q }] as const,
  playlists: () => ['playlists'] as const,
  playlist: (id: string) => ['playlists', id] as const,
}
