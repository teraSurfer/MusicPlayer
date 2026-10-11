import { z } from 'zod'

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  duration_ms: z.number(),
  format: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  uploaded_by: z.string().nullable(),
  created_at: z.string(),
  stream_url: z.string(),
  cover_url: z.string().nullable(),
  in_collection: z.boolean(),
  added_at: z.string().nullable().optional(),
})
export type Song = z.infer<typeof songSchema>

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
export type Page<T> = { items: T[]; total: number; limit: number; offset: number }

export const uploadResultSchema = z.object({
  filename: z.string(),
  status: z.enum(['created', 'existing', 'rejected']),
  reason: z.enum(['unsupported_type', 'invalid_audio', 'file_too_large']).nullable().optional(),
  message: z.string().nullable().optional(),
  song: songSchema.nullable().optional(),
})
export type UploadResult = z.infer<typeof uploadResultSchema>

export const uploadResponseSchema = z.object({ results: z.array(uploadResultSchema) })

export const collectionAddSchema = z.object({
  added: z.array(z.string()),
  already_in_collection: z.array(z.string()),
})

export const playlistSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  song_count: z.number(),
  total_duration_ms: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type PlaylistSummary = z.infer<typeof playlistSummarySchema>

export const playlistDetailSchema = playlistSummarySchema.extend({
  songs: z.array(songSchema),
})
export type PlaylistDetail = z.infer<typeof playlistDetailSchema>

export const addSongsResultSchema = z.object({
  added: z.array(z.string()),
  skipped: z.array(z.string()),
  playlist: playlistDetailSchema,
})
export type AddSongsResult = z.infer<typeof addSongsResultSchema>
