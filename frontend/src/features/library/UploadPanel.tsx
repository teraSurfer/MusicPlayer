import { AlertCircle, CheckCircle2, CopyCheck, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ALLOWED_AUDIO_EXTENSIONS, MAX_UPLOAD_BYTES } from '@/shared/api/config'
import type { UploadResult } from '@/shared/api/schemas'
import { useUploadSongs } from './queries'

interface Row {
  filename: string
  status: UploadResult['status']
  message?: string | null
}

export function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported file type (.${ext || '?'})`
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`
  }
  return null
}

const STATUS_TEXT: Record<UploadResult['status'], string> = {
  created: 'Added',
  existing: 'Already in the pool; added to your collection',
  rejected: 'Rejected',
}

export function UploadPanel() {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const upload = useUploadSongs(setProgress)

  const handleFiles = (list: FileList | File[]) => {
    const files = Array.from(list)
    if (files.length === 0) return

    const invalid: Row[] = []
    const valid: File[] = []
    for (const file of files) {
      const problem = validateFile(file)
      if (problem) invalid.push({ filename: file.name, status: 'rejected', message: problem })
      else valid.push(file)
    }
    setRows(invalid)
    if (valid.length === 0) return

    setProgress(0)
    upload.mutate(valid, {
      onSuccess: ({ results }) => {
        setRows([...invalid, ...results])
        const created = results.filter((r) => r.status === 'created').length
        const existing = results.filter((r) => r.status === 'existing').length
        if (created > 0) {
          toast.success(
            `Uploaded ${created} song${created === 1 ? '' : 's'}` +
              (existing ? ` (${existing} already existed)` : ''),
          )
        } else if (existing > 0) {
          toast.info(
            existing === 1
              ? 'That song already exists; it is in your collection'
              : `${existing} songs already exist; they are in your collection`,
          )
        }
        if (results.some((r) => r.status === 'rejected')) toast.error('Some files were rejected')
      },
      onError: (error) => {
        setRows([
          ...invalid,
          ...valid.map((f) => ({ filename: f.name, status: 'rejected' as const, message: error.message })),
        ])
        toast.error(`Upload failed: ${error.message}`)
      },
      onSettled: () => setProgress(null),
    })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <section aria-label="Upload songs" className="grid gap-3">
      <div
        data-testid="dropzone"
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-primary bg-muted' : 'border-border'
        }`}
      >
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Drag and drop audio files here ({ALLOWED_AUDIO_EXTENSIONS.join(', ')})
        </p>
        <Button
          variant="outline"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Upload songs"
          data-testid="file-input"
          onChange={(e) => {
            handleFiles(e.target.files ?? [])
            e.target.value = ''
          }}
        />
      </div>

      {progress !== null && (
        <Progress value={Math.round(progress * 100)} aria-label="Upload progress">
          <span className="text-sm">Uploading…</span>
        </Progress>
      )}

      {rows.length > 0 && (
        <ul className="grid gap-1 text-sm" aria-label="Upload results">
          {rows.map((row, i) => (
            <li key={`${row.filename}-${i}`} className="flex items-center gap-2">
              {row.status === 'created' && <CheckCircle2 className="size-4 text-green-600" aria-hidden />}
              {row.status === 'existing' && <CopyCheck className="size-4 text-blue-600" aria-hidden />}
              {row.status === 'rejected' && <AlertCircle className="size-4 text-destructive" aria-hidden />}
              <span className="font-medium">{row.filename}</span>
              <span className="text-muted-foreground">
                {row.message ? `${STATUS_TEXT[row.status]}: ${row.message}` : STATUS_TEXT[row.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
