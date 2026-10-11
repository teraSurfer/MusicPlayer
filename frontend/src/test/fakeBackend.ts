import { delay, http, HttpResponse } from 'msw'
import type { Song } from '@/shared/api/schemas'

const BASE = 'http://localhost:8000/api/v1'
const LOCAL_USER = '00000000-0000-0000-0000-000000000001'

function envelope(status: number, code: string, message: string, details: unknown = {}) {
  return HttpResponse.json({ error: { code, message, details } }, { status })
}

export interface FakePlaylist {
  id: string
  name: string
  description: string | null
  songIds: string[]
  created_at: string
}

/** A small in-memory stand-in for the real API, shared by component tests. */
export class FakeBackend {
  pool: Song[] = []
  collection = new Set<string>()
  playlists: FakePlaylist[] = []
  requests: string[] = []
  uploadDelayMs = 0
  failNextCollectionAdd = false
  private counter = 0

  song(partial: Partial<Song> & { title: string }): Song {
    this.counter += 1
    const id = partial.id ?? `song-${this.counter}`
    const song: Song = {
      id,
      artist: null,
      album: null,
      duration_ms: 180_000,
      format: 'mp3',
      mime_type: 'audio/mpeg',
      size_bytes: 1000,
      uploaded_by: LOCAL_USER,
      created_at: new Date(2026, 0, this.counter).toISOString(),
      stream_url: `/api/v1/songs/${id}/stream`,
      cover_url: null,
      in_collection: false,
      added_at: null,
      ...partial,
    }
    this.pool.push(song)
    return song
  }

  seed(count: number, inCollection = true): Song[] {
    const created = Array.from({ length: count }, (_, i) =>
      this.song({ title: `Song ${String(i + 1).padStart(2, '0')}`, artist: `Artist ${i + 1}` }),
    )
    if (inCollection) created.forEach((s) => this.collection.add(s.id))
    return created
  }

  view(song: Song): Song {
    const inCollection = this.collection.has(song.id)
    return { ...song, in_collection: inCollection, added_at: inCollection ? song.created_at : null }
  }

  private matches(song: Song, q: string | null): boolean {
    if (!q) return true
    const needle = q.toLowerCase()
    return [song.title, song.artist ?? '', song.album ?? ''].some((v) =>
      v.toLowerCase().includes(needle),
    )
  }

  private page(songs: Song[], url: URL) {
    const limit = Number(url.searchParams.get('limit') ?? 50)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return {
      items: songs.slice(offset, offset + limit).map((s) => this.view(s)),
      total: songs.length,
      limit,
      offset,
    }
  }

  playlistDetail(p: FakePlaylist) {
    const songs = p.songIds
      .map((id) => this.pool.find((s) => s.id === id))
      .filter((s): s is Song => !!s)
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      song_count: songs.length,
      total_duration_ms: songs.reduce((sum, s) => sum + s.duration_ms, 0),
      created_at: p.created_at,
      updated_at: p.created_at,
      songs: songs.map((s) => this.view(s)),
    }
  }

  handlers() {
    const log = (request: Request) => this.requests.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`)

    return [
      http.get(`${BASE}/songs`, ({ request }) => {
        log(request)
        const url = new URL(request.url)
        const q = url.searchParams.get('q')
        return HttpResponse.json(this.page(this.pool.filter((s) => this.matches(s, q)), url))
      }),

      http.get(`${BASE}/collection`, ({ request }) => {
        log(request)
        const url = new URL(request.url)
        const q = url.searchParams.get('q')
        const songs = this.pool.filter((s) => this.collection.has(s.id) && this.matches(s, q))
        return HttpResponse.json(this.page(songs, url))
      }),

      http.post(`${BASE}/collection`, async ({ request }) => {
        log(request)
        if (this.failNextCollectionAdd) {
          this.failNextCollectionAdd = false
          return envelope(500, 'internal_error', 'Internal server error')
        }
        const { song_ids } = (await request.json()) as { song_ids: string[] }
        const added: string[] = []
        const already: string[] = []
        for (const id of song_ids) {
          if (this.collection.has(id)) already.push(id)
          else {
            this.collection.add(id)
            added.push(id)
          }
        }
        return HttpResponse.json({ added, already_in_collection: already })
      }),

      http.delete(`${BASE}/collection/:id`, ({ request, params }) => {
        log(request)
        const id = String(params.id)
        if (!this.collection.delete(id)) return envelope(404, 'not_in_collection', 'Not in collection')
        this.playlists.forEach((p) => (p.songIds = p.songIds.filter((s) => s !== id)))
        return new HttpResponse(null, { status: 204 })
      }),

      http.patch(`${BASE}/songs/:id`, async ({ request, params }) => {
        log(request)
        const song = this.pool.find((s) => s.id === params.id)
        if (!song) return envelope(404, 'song_not_found', 'Song not found')
        Object.assign(song, await request.json())
        return HttpResponse.json(this.view(song))
      }),

      http.post(`${BASE}/songs/upload`, async ({ request }) => {
        log(request)
        if (this.uploadDelayMs) await delay(this.uploadDelayMs)
        const form = await request.formData()
        const files = form.getAll('files') as File[]
        const results = files.map((file) => {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
          if (!['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) {
            return {
              filename: file.name,
              status: 'rejected' as const,
              reason: 'unsupported_type' as const,
              message: `'.${ext}' is not supported`,
              song: null,
            }
          }
          const existing = this.pool.find((s) => s.title === file.name.replace(/\.[^.]+$/, ''))
          if (existing) {
            this.collection.add(existing.id)
            return { filename: file.name, status: 'existing' as const, song: this.view(existing) }
          }
          const created = this.song({ title: file.name.replace(/\.[^.]+$/, '') })
          this.collection.add(created.id)
          return { filename: file.name, status: 'created' as const, song: this.view(created) }
        })
        return HttpResponse.json({ results }, { status: 201 })
      }),

      http.get(`${BASE}/playlists`, ({ request }) => {
        log(request)
        const list = [...this.playlists]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => {
            const { songs: _songs, ...summary } = this.playlistDetail(p)
            void _songs
            return summary
          })
        return HttpResponse.json(list)
      }),

      http.post(`${BASE}/playlists`, async ({ request }) => {
        log(request)
        const body = (await request.json()) as { name: string; description?: string | null }
        const name = body.name.trim()
        if (this.playlists.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
          return envelope(409, 'playlist_name_taken', `A playlist named '${name}' already exists`)
        }
        this.counter += 1
        const playlist: FakePlaylist = {
          id: `pl-${this.counter}`,
          name,
          description: body.description ?? null,
          songIds: [],
          created_at: new Date().toISOString(),
        }
        this.playlists.push(playlist)
        return HttpResponse.json(this.playlistDetail(playlist), { status: 201 })
      }),

      http.get(`${BASE}/playlists/:id`, ({ request, params }) => {
        log(request)
        const playlist = this.playlists.find((p) => p.id === params.id)
        if (!playlist) return envelope(404, 'playlist_not_found', 'Playlist not found')
        return HttpResponse.json(this.playlistDetail(playlist))
      }),

      http.patch(`${BASE}/playlists/:id`, async ({ request, params }) => {
        log(request)
        const playlist = this.playlists.find((p) => p.id === params.id)
        if (!playlist) return envelope(404, 'playlist_not_found', 'Playlist not found')
        const body = (await request.json()) as { name?: string; description?: string | null }
        if (body.name !== undefined) {
          const name = body.name.trim()
          if (this.playlists.some((p) => p.id !== playlist.id && p.name.toLowerCase() === name.toLowerCase())) {
            return envelope(409, 'playlist_name_taken', 'A playlist with this name already exists')
          }
          playlist.name = name
        }
        if (body.description !== undefined) playlist.description = body.description
        return HttpResponse.json(this.playlistDetail(playlist))
      }),

      http.delete(`${BASE}/playlists/:id`, ({ request, params }) => {
        log(request)
        const before = this.playlists.length
        this.playlists = this.playlists.filter((p) => p.id !== params.id)
        if (this.playlists.length === before) return envelope(404, 'playlist_not_found', 'Playlist not found')
        return new HttpResponse(null, { status: 204 })
      }),

      http.post(`${BASE}/playlists/:id/songs`, async ({ request, params }) => {
        log(request)
        const playlist = this.playlists.find((p) => p.id === params.id)
        if (!playlist) return envelope(404, 'playlist_not_found', 'Playlist not found')
        const { song_ids } = (await request.json()) as { song_ids: string[] }
        const outside = song_ids.filter((id) => !this.collection.has(id))
        if (outside.length) {
          return envelope(409, 'song_not_in_collection', 'Songs must be in your collection', {
            song_ids: outside,
          })
        }
        const added: string[] = []
        const skipped: string[] = []
        for (const id of [...new Set(song_ids)]) {
          if (playlist.songIds.includes(id)) skipped.push(id)
          else {
            playlist.songIds.push(id)
            added.push(id)
          }
        }
        return HttpResponse.json({ added, skipped, playlist: this.playlistDetail(playlist) })
      }),

      http.put(`${BASE}/playlists/:id/songs/order`, async ({ request, params }) => {
        log(request)
        const playlist = this.playlists.find((p) => p.id === params.id)
        if (!playlist) return envelope(404, 'playlist_not_found', 'Playlist not found')
        const { song_ids } = (await request.json()) as { song_ids: string[] }
        playlist.songIds = song_ids
        return HttpResponse.json(this.playlistDetail(playlist))
      }),

      http.delete(`${BASE}/playlists/:id/songs/:songId`, ({ request, params }) => {
        log(request)
        const playlist = this.playlists.find((p) => p.id === params.id)
        if (!playlist) return envelope(404, 'playlist_not_found', 'Playlist not found')
        const before = playlist.songIds.length
        playlist.songIds = playlist.songIds.filter((s) => s !== params.songId)
        if (playlist.songIds.length === before) return envelope(404, 'not_in_playlist', 'Not in playlist')
        return new HttpResponse(null, { status: 204 })
      }),
    ]
  }
}
