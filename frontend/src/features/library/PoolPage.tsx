import { Check, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlayer } from '@/features/player/PlayerProvider'
import type { Song } from '@/shared/api/schemas'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { EditSongDialog } from './EditSongDialog'
import { useAddToCollection, useSongList } from './queries'
import { SongTable } from './SongTable'
import { toTrack } from './toTrack'

export function PoolPage() {
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search)
  const list = useSongList('pool', q)
  const add = useAddToCollection()
  const playQueue = usePlayer((s) => s.playQueue)
  const currentId = usePlayer((s) => s.current?.id ?? null)
  const isPlaying = usePlayer((s) => s.isPlaying)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Song | null>(null)

  const selectable = list.songs.filter((s) => !s.in_collection)
  const selectedIds = [...selected].filter((id) => selectable.some((s) => s.id === id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) =>
      selectable.every((s) => prev.has(s.id)) ? new Set() : new Set(selectable.map((s) => s.id)),
    )

  return (
    <div className="grid gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pool</h1>
          <p className="text-sm text-muted-foreground">
            Every song that has been uploaded. Add the ones you want to your collection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={selectedIds.length === 0 || add.isPending}
            onClick={() => {
              add.mutate(selectedIds)
              setSelected(new Set())
            }}
          >
            Add selected ({selectedIds.length})
          </Button>
          <Input
            type="search"
            aria-label="Search pool"
            placeholder="Search title, artist or album"
            className="w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {list.isPending && (
        <div className="grid gap-2" aria-label="Loading songs" role="status">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {list.isError && (
        <div role="alert" className="grid justify-items-start gap-2 rounded-lg border p-4">
          <p className="font-medium">Could not load the pool</p>
          <p className="text-sm text-muted-foreground">{list.error.message}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {list.isSuccess && list.songs.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="font-medium">
            {q.trim() ? `No songs match “${q.trim()}”` : 'The pool is empty'}
          </p>
        </div>
      )}

      {list.isSuccess && list.songs.length > 0 && (
        <>
          <SongTable
            songs={list.songs}
            currentId={currentId}
            isPlaying={isPlaying}
            onPlay={(index) => playQueue(list.songs.map(toTrack), index)}
            selection={{ selected: new Set(selectedIds), toggle, toggleAll }}
            renderActions={(song) => (
              <div className="flex items-center justify-end gap-1">
                {song.in_collection ? (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Check className="size-4" aria-hidden /> In collection
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Add ${song.title} to collection`}
                    onClick={() => add.mutate([song.id])}
                  >
                    <Plus /> Add
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${song.title}`} />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(song)}>Edit details</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />
          {list.hasNextPage && (
            <Button
              variant="outline"
              className="justify-self-center"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </>
      )}

      <EditSongDialog song={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
