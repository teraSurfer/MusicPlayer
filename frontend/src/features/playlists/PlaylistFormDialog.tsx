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
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/shared/api/client'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer'),
})
export type PlaylistFormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  title: string
  submitLabel: string
  initial?: Partial<PlaylistFormValues>
  onSubmit: (values: { name: string; description: string | null }) => Promise<unknown>
  onClose: () => void
}

export function PlaylistFormDialog({ open, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && rest.onClose()}>
      <DialogContent>{open && <PlaylistForm {...rest} />}</DialogContent>
    </Dialog>
  )
}

function PlaylistForm({ title, submitLabel, initial, onSubmit, onClose }: Omit<Props, 'open'>) {
  const form = useForm<PlaylistFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initial?.name ?? '', description: initial?.description ?? '' },
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({ name: values.name, description: values.description || null })
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setError('name', { message: error.message })
      } else {
        form.setError('root', {
          message: error instanceof ApiError ? error.message : 'Something went wrong',
        })
      }
    }
  })

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Playlist names must be unique.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="playlist-name">Name</Label>
        <Input id="playlist-name" aria-invalid={!!errors.name} {...form.register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="playlist-description">Description (optional)</Label>
        <Textarea id="playlist-description" {...form.register('description')} />
        {errors.description && (
          <p role="alert" className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
