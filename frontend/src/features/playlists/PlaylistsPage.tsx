import { ListMusic, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
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
import { Skeleton } from '@/components/ui/skeleton'
import type { PlaylistSummary } from '@/shared/api/schemas'
import { formatDurationMs } from '@/shared/lib/format'
import { PlaylistFormDialog } from './PlaylistFormDialog'
import { useCreatePlaylist, useDeletePlaylist, usePlaylists } from './queries'

export function PlaylistsPage() {
  const playlists = usePlaylists()
  const create = useCreatePlaylist()
  const remove = useDeletePlaylist()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<PlaylistSummary | null>(null)

  return (
    <div className="grid gap-6 p-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Playlists</h1>
          <p className="text-sm text-muted-foreground">Group songs from your collection.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New playlist
        </Button>
      </header>

      {playlists.isPending && (
        <div className="grid gap-2" role="status" aria-label="Loading playlists">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {playlists.isError && (
        <div role="alert" className="grid justify-items-start gap-2 rounded-lg border p-4">
          <p className="font-medium">Could not load playlists</p>
          <p className="text-sm text-muted-foreground">{playlists.error.message}</p>
          <Button variant="outline" onClick={() => void playlists.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {playlists.isSuccess && playlists.data.length === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <p className="font-medium">No playlists yet</p>
          <p className="text-sm text-muted-foreground">Create one to start organising songs.</p>
        </div>
      )}

      {playlists.isSuccess && playlists.data.length > 0 && (
        <ul className="grid gap-2" aria-label="Playlists">
          {playlists.data.map((playlist) => (
            <li
              key={playlist.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <Link to={`/playlists/${playlist.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                  <ListMusic className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{playlist.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {playlist.song_count} song{playlist.song_count === 1 ? '' : 's'}
                    {playlist.song_count > 0 && ` · ${formatDurationMs(playlist.total_duration_ms)}`}
                  </p>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${playlist.name}`}
                onClick={() => setDeleting(playlist)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PlaylistFormDialog
        open={creating}
        title="New playlist"
        submitLabel="Create"
        onSubmit={(values) => create.mutateAsync(values)}
        onClose={() => setCreating(false)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The songs stay in your collection. Only the playlist is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
