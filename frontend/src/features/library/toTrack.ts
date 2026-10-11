import type { PlayerTrack } from '@/features/player/types'
import { resolveApiUrl } from '@/shared/api/config'
import type { Song } from '@/shared/api/schemas'

export function toTrack(song: Song): PlayerTrack {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    streamUrl: resolveApiUrl(song.stream_url),
    coverUrl: song.cover_url ? resolveApiUrl(song.cover_url) : null,
    durationMs: song.duration_ms,
  }
}
