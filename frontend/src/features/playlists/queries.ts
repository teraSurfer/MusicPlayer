import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/shared/api/client'
import {
  addSongsResultSchema,
  playlistDetailSchema,
  playlistSummarySchema,
  type PlaylistDetail,
} from '@/shared/api/schemas'
import { z } from 'zod'

const summaries = z.array(playlistSummarySchema)

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong'
}

export function usePlaylists() {
  return useQuery({
    queryKey: ['playlists'],
    queryFn: ({ signal }) => api('/playlists', { schema: summaries, signal }),
  })
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: ['playlists', id],
    queryFn: ({ signal }) => api(`/playlists/${id}`, { schema: playlistDetailSchema, signal }),
  })
}

export interface PlaylistInput {
  name: string
  description?: string | null
}

export function useCreatePlaylist() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: PlaylistInput) =>
      api('/playlists', { method: 'POST', body: input, schema: playlistDetailSchema }),
    onSuccess: (playlist) => toast.success(`Created “${playlist.name}”`),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function useUpdatePlaylist(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<PlaylistInput>) =>
      api(`/playlists/${id}`, { method: 'PATCH', body: input, schema: playlistDetailSchema }),
    onSuccess: () => toast.success('Playlist updated'),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function useDeletePlaylist() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/playlists/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Playlist deleted'),
    onError: (error) => toast.error(`Could not delete: ${describe(error)}`),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function useAddSongsToPlaylist() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ playlistId, songIds }: { playlistId: string; songIds: string[] }) =>
      api(`/playlists/${playlistId}/songs`, {
        method: 'POST',
        body: { song_ids: songIds },
        schema: addSongsResultSchema,
      }),
    onSuccess: (result) => {
      const name = result.playlist.name
      if (result.added.length === 0) toast.info(`Already in “${name}”`)
      else if (result.skipped.length > 0)
        toast.success(
          `Added ${result.added.length} to “${name}” (${result.skipped.length} already there)`,
        )
      else toast.success(`Added to “${name}”`)
    },
    onError: (error) => toast.error(`Could not add to playlist: ${describe(error)}`),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function useRemoveSongFromPlaylist(playlistId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (songId: string) =>
      api(`/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Removed from playlist'),
    onError: (error) => toast.error(`Could not remove: ${describe(error)}`),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

export function useReorderPlaylist(playlistId: string) {
  const client = useQueryClient()
  const key = ['playlists', playlistId]
  return useMutation({
    mutationFn: (songIds: string[]) =>
      api(`/playlists/${playlistId}/songs/order`, {
        method: 'PUT',
        body: { song_ids: songIds },
        schema: playlistDetailSchema,
      }),
    onMutate: async (songIds) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<PlaylistDetail>(key)
      if (previous) {
        const byId = new Map(previous.songs.map((s) => [s.id, s]))
        client.setQueryData<PlaylistDetail>(key, {
          ...previous,
          songs: songIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
        })
      }
      return { previous }
    },
    onError: (error, _ids, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
      toast.error(`Could not reorder: ${describe(error)}`)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}
