import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { AddToPlaylistMenu } from '@/features/playlists/AddToPlaylistMenu'
import type { Song } from '@/shared/api/schemas'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { EditSongDialog } from './EditSongDialog'
import { useRemoveFromCollection, useSongList } from './queries'
import { SongTable } from './SongTable'
import { toTrack } from './toTrack'
import { UploadPanel } from './UploadPanel'

export function LibraryPage() {
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search)
  const list = useSongList('collection', q)
  const remove = useRemoveFromCollection()
  const playQueue = usePlayer((s) => s.playQueue)
  const currentId = usePlayer((s) => s.current?.id ?? null)
  const isPlaying = usePlayer((s) => s.isPlaying)

  const [editing, setEditing] = useState<Song | null>(null)
  const [removing, setRemoving] = useState<Song | null>(null)

  const searching = q.trim() !== ''

  return (
    <div className="grid gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">
            {list.isSuccess ? `${list.total} song${list.total === 1 ? '' : 's'}` : ' '}
          </p>
        </div>
        <Input
          type="search"
          aria-label="Search library"
          placeholder="Search title, artist or album"
          className="w-72"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <UploadPanel />

      {list.isPending && (
        <div className="grid gap-2" aria-label="Loading songs" role="status">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {list.isError && (
        <div role="alert" className="grid justify-items-start gap-2 rounded-lg border p-4">
          <p className="font-medium">Could not load your library</p>
          <p className="text-sm text-muted-foreground">{list.error.message}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {list.isSuccess && list.songs.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="font-medium">
            {searching ? `No songs match “${q.trim()}”` : 'Your library is empty'}
          </p>
          {!searching && (
            <p className="text-sm text-muted-foreground">
              Upload songs above, or add some from the Pool.
            </p>
          )}
        </div>
      )}

      {list.isSuccess && list.songs.length > 0 && (
        <>
          <SongTable
            songs={list.songs}
            currentId={currentId}
            isPlaying={isPlaying}
            onPlay={(index) => playQueue(list.songs.map(toTrack), index)}
            renderActions={(song) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${song.title}`} />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <AddToPlaylistMenu song={song} />
                  <DropdownMenuItem onClick={() => setEditing(song)}>Edit details</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setRemoving(song)}>
                    Remove from collection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will also be removed from your playlists. The file stays in the pool, so you can
              add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) remove.mutate(removing.id)
                setRemoving(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
