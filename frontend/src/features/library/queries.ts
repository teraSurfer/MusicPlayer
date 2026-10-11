import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError, uploadFiles } from '@/shared/api/client'
import {
  collectionAddSchema,
  pageSchema,
  songSchema,
  uploadResponseSchema,
  type Page,
  type Song,
} from '@/shared/api/schemas'

const PAGE_SIZE = 50
const songPage = pageSchema(songSchema)

export type SongScope = 'pool' | 'collection'
const ROOT: Record<SongScope, 'songs' | 'collection'> = { pool: 'songs', collection: 'collection' }

export function useSongList(scope: SongScope, q: string) {
  const query = useInfiniteQuery({
    queryKey: [ROOT[scope], { q }],
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      api(`/${ROOT[scope]}`, {
        query: { q: q.trim() || undefined, limit: PAGE_SIZE, offset: pageParam },
        schema: songPage,
        signal,
      }),
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.limit : undefined,
  })

  const pages = query.data?.pages ?? []
  return {
    ...query,
    songs: pages.flatMap((p) => p.items),
    total: pages.at(-1)?.total ?? 0,
  }
}

type SongCache = InfiniteData<Page<Song>>

function patchCaches(client: QueryClient, ids: Set<string>, patch: Partial<Song>) {
  for (const root of ['songs', 'collection']) {
    client.setQueriesData<SongCache>({ queryKey: [root] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((s) => (ids.has(s.id) ? { ...s, ...patch } : s)),
            })),
          }
        : data,
    )
  }
}

function invalidateLibrary(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['songs'] }),
    client.invalidateQueries({ queryKey: ['collection'] }),
    client.invalidateQueries({ queryKey: ['playlists'] }),
  ])
}

function describe(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong'
}

export function useAddToCollection() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (songIds: string[]) =>
      api('/collection', { method: 'POST', body: { song_ids: songIds }, schema: collectionAddSchema }),
    onMutate: async (songIds) => {
      await client.cancelQueries({ queryKey: ['songs'] })
      const snapshot = client.getQueriesData<SongCache>({ queryKey: ['songs'] })
      patchCaches(client, new Set(songIds), { in_collection: true })
      return { snapshot }
    },
    onError: (error, _ids, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data))
      toast.error(`Could not add to collection: ${describe(error)}`)
    },
    onSuccess: (result) => {
      const count = result.added.length
      toast.success(count === 1 ? 'Added to your collection' : `Added ${count} songs to your collection`)
    },
    onSettled: () => invalidateLibrary(client),
  })
}

export function useRemoveFromCollection() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (songId: string) => api(`/collection/${songId}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Removed from your collection'),
    onError: (error) => toast.error(`Could not remove: ${describe(error)}`),
    onSettled: () => invalidateLibrary(client),
  })
}

export interface SongEdit {
  title?: string
  artist?: string | null
  album?: string | null
}

export function useUpdateSong() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: SongEdit & { id: string }) =>
      api(`/songs/${id}`, { method: 'PATCH', body: changes, schema: songSchema }),
    onSuccess: (song) => {
      patchCaches(client, new Set([song.id]), song)
      toast.success('Song updated')
    },
    onError: (error) => toast.error(`Could not save: ${describe(error)}`),
    onSettled: () => client.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

export function useUploadSongs(onProgress?: (fraction: number) => void) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) =>
      uploadFiles('/songs/upload', files, uploadResponseSchema, onProgress),
    onSettled: () => invalidateLibrary(client),
  })
}
