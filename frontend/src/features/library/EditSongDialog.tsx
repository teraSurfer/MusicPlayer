import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Song } from '@/shared/api/schemas'
import { useUpdateSong } from './queries'

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  artist: z.string().trim().max(200, 'Artist is too long'),
  album: z.string().trim().max(200, 'Album is too long'),
})
type FormValues = z.infer<typeof schema>

export function EditSongDialog({ song, onClose }: { song: Song | null; onClose: () => void }) {
  return (
    <Dialog open={song !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{song && <EditForm key={song.id} song={song} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function EditForm({ song, onClose }: { song: Song; onClose: () => void }) {
  const update = useUpdateSong()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: song.title, artist: song.artist ?? '', album: song.album ?? '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(
      {
        id: song.id,
        title: values.title,
        artist: values.artist || null,
        album: values.album || null,
      },
      { onSuccess: onClose },
    )
  })

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit song</DialogTitle>
        <DialogDescription>Change how this song appears in your library.</DialogDescription>
      </DialogHeader>

      {(
        [
          ['title', 'Title'],
          ['artist', 'Artist'],
          ['album', 'Album'],
        ] as const
      ).map(([field, label]) => (
        <div key={field} className="grid gap-1.5">
          <Label htmlFor={`song-${field}`}>{label}</Label>
          <Input
            id={`song-${field}`}
            aria-invalid={!!errors[field]}
            {...form.register(field)}
          />
          {errors[field] && (
            <p role="alert" className="text-sm text-destructive">
              {errors[field]?.message}
            </p>
          )}
        </div>
      ))}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
