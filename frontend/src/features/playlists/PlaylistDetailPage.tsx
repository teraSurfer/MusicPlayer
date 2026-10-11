import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Music2, Pause, Pencil, Play, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toTrack } from '@/features/library/toTrack'
import { usePlayer } from '@/features/player/PlayerProvider'
import { ApiError } from '@/shared/api/client'
import { resolveApiUrl } from '@/shared/api/config'
import type { Song } from '@/shared/api/schemas'
import { formatDurationMs } from '@/shared/lib/format'
import { PlaylistFormDialog } from './PlaylistFormDialog'
import {
  moveItem,
  useDeletePlaylist,
  usePlaylist,
  useRemoveSongFromPlaylist,
  useReorderPlaylist,
  useUpdatePlaylist,
} from './queries'

interface RowProps {
  song: Song
  index: number
  count: number
  isCurrent: boolean
  isPlaying: boolean
  onPlay: () => void
  onRemove: () => void
  onMove: (to: number) => void
}

function SortableSongRow({ song, index, count, isCurrent, isPlaying, onPlay, onRemove, onMove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-current={isCurrent || undefined}
      aria-current={isCurrent ? 'true' : undefined}
      className={`${isCurrent ? 'bg-muted/60' : ''} ${isDragging ? 'relative z-10 opacity-80' : ''}`}
      onDoubleClick={onPlay}
    >
      <TableCell className="w-10">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Drag to reorder ${song.title}`}
          className="cursor-grab touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className="w-12">
        <Button variant="ghost" size="icon" aria-label={`Play ${song.title}`} onClick={onPlay}>
          {isCurrent && isPlaying ? <Pause /> : <Play />}
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {song.cover_url ? (
              <img src={resolveApiUrl(song.cover_url)} alt="" className="size-full object-cover" />
            ) : (
              <Music2 className="size-4 text-muted-foreground" aria-hidden />
            )}
          </div>
          <span className="truncate font-medium">{song.title}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{song.artist ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatDurationMs(song.duration_ms)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${song.title} up`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${song.title} down`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${song.title} from playlist`}
            onClick={onRemove}
          >
            <X />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function PlaylistDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const playlist = usePlaylist(id)
  const update = useUpdatePlaylist(id)
  const remove = useDeletePlaylist()
  const removeSong = useRemoveSongFromPlaylist(id)
  const reorder = useReorderPlaylist(id)

  const playQueue = usePlayer((s) => s.playQueue)
  const updateQueue = usePlayer((s) => s.updateQueue)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const sourceId = usePlayer((s) => s.sourceId)
  const currentId = usePlayer((s) => s.current?.id ?? null)
  const isPlaying = usePlayer((s) => s.isPlaying)

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const source = `playlist:${id}`
  const songs = useMemo(() => playlist.data?.songs ?? [], [playlist.data])
  const isActiveSource = sourceId === source

  // Keep the playing queue in step with edits to this playlist (UC5-6).
  useEffect(() => {
    if (isActiveSource && playlist.data) updateQueue(playlist.data.songs.map(toTrack))
  }, [isActiveSource, playlist.data, updateQueue])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const playFrom = (index: number) => playQueue(songs.map(toTrack), index, source)
  const ids = songs.map((s) => s.id)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    reorder.mutate(arrayMove(ids, from, to))
  }

  if (playlist.isPending) {
    return (
      <div className="grid gap-3 p-6" role="status" aria-label="Loading playlist">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (playlist.isError) {
    const notFound = playlist.error instanceof ApiError && playlist.error.status === 404
    return (
      <div className="grid justify-items-start gap-3 p-6">
        <div role="alert" className="grid gap-1">
          <p className="font-medium">
            {notFound ? 'This playlist does not exist' : 'Could not load this playlist'}
          </p>
          <p className="text-sm text-muted-foreground">{playlist.error.message}</p>
        </div>
        {notFound ? (
          <Button render={<Link to="/playlists" />} variant="outline">
            Back to playlists
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void playlist.refetch()}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  const data = playlist.data
  const playlistIsPlaying = isActiveSource && isPlaying

  return (
    <div className="grid gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <Link to="/playlists" className="text-muted-foreground hover:underline">
              Playlists
            </Link>
          </p>
          <h1 className="truncate text-2xl font-semibold">{data.name}</h1>
          {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
          <p className="text-sm text-muted-foreground">
            {data.song_count} song{data.song_count === 1 ? '' : 's'}
            {data.song_count > 0 && ` · ${formatDurationMs(data.total_duration_ms)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label={playlistIsPlaying ? 'Pause playlist' : 'Play playlist'}
            disabled={songs.length === 0}
            onClick={() => (isActiveSource && currentId ? togglePlay() : playFrom(0))}
          >
            {playlistIsPlaying ? <Pause /> : <Play />}
            {playlistIsPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button variant="outline" size="icon" aria-label="Edit playlist" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button variant="outline" size="icon" aria-label="Delete playlist" onClick={() => setDeleting(true)}>
            <Trash2 />
          </Button>
        </div>
      </header>

      {songs.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="font-medium">This playlist is empty</p>
          <p className="text-sm text-muted-foreground">
            Open the “…” menu on a song in your Library and choose Add to playlist.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-12" />
                  <TableHead>Title</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead className="w-20 text-right">Time</TableHead>
                  <TableHead className="w-44 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {songs.map((song, index) => (
                  <SortableSongRow
                    key={song.id}
                    song={song}
                    index={index}
                    count={songs.length}
                    isCurrent={isActiveSource && song.id === currentId}
                    isPlaying={isPlaying}
                    onPlay={() => playFrom(index)}
                    onRemove={() => removeSong.mutate(song.id)}
                    onMove={(to) => reorder.mutate(moveItem(ids, index, to))}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}

      <PlaylistFormDialog
        open={editing}
        title="Edit playlist"
        submitLabel="Save"
        initial={{ name: data.name, description: data.description ?? '' }}
        onSubmit={(values) => update.mutateAsync(values)}
        onClose={() => setEditing(false)}
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{data.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The songs stay in your collection. Only the playlist is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(id, { onSuccess: () => void navigate('/playlists', { replace: true }) })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
