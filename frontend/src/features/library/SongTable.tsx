import { Music2, Pause, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { resolveApiUrl } from '@/shared/api/config'
import type { Song } from '@/shared/api/schemas'
import { formatDurationMs } from '@/shared/lib/format'

export interface SongTableProps {
  songs: Song[]
  currentId: string | null
  isPlaying: boolean
  onPlay: (index: number) => void
  renderActions: (song: Song) => ReactNode
  selection?: {
    selected: ReadonlySet<string>
    toggle: (id: string) => void
    toggleAll: () => void
  }
}

export function SongTable({
  songs,
  currentId,
  isPlaying,
  onPlay,
  renderActions,
  selection,
}: SongTableProps) {
  const allSelected = !!selection && songs.length > 0 && songs.every((s) => selection.selected.has(s.id))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection && (
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Select all songs"
                checked={allSelected}
                onChange={selection.toggleAll}
              />
            </TableHead>
          )}
          <TableHead className="w-12" />
          <TableHead>Title</TableHead>
          <TableHead>Artist</TableHead>
          <TableHead>Album</TableHead>
          <TableHead className="w-20 text-right">Time</TableHead>
          <TableHead className="w-40 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {songs.map((song, index) => {
          const isCurrent = song.id === currentId
          return (
            <TableRow
              key={song.id}
              data-current={isCurrent || undefined}
              aria-current={isCurrent ? 'true' : undefined}
              className={isCurrent ? 'bg-muted/60' : undefined}
              onDoubleClick={() => onPlay(index)}
            >
              {selection && (
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${song.title}`}
                    checked={selection.selected.has(song.id)}
                    onChange={() => selection.toggle(song.id)}
                  />
                </TableCell>
              )}
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Play ${song.title}`}
                  onClick={() => onPlay(index)}
                >
                  {isCurrent && isPlaying ? <Pause /> : <Play />}
                </Button>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {song.cover_url ? (
                      <img
                        src={resolveApiUrl(song.cover_url)}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Music2 className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <span className="truncate font-medium">{song.title}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{song.artist ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{song.album ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatDurationMs(song.duration_ms)}
              </TableCell>
              <TableCell className="text-right">{renderActions(song)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
