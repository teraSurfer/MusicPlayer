import type { z } from 'zod'
import { API_BASE_URL, API_PREFIX } from './config'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface RequestOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  schema?: S
  signal?: AbortSignal
}

function buildUrl(path: string, query: RequestOptions<undefined>['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${API_BASE_URL}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`
}

/** Maps the backend's `{ error: { code, message, details } }` envelope to an ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown }
    }
    if (body.error) {
      return new ApiError(
        response.status,
        body.error.code ?? 'error',
        body.error.message ?? response.statusText,
        body.error.details,
      )
    }
  } catch {
    // not JSON
  }
  return new ApiError(response.status, 'http_error', response.statusText || 'Request failed')
}

export async function api<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  type Result = S extends z.ZodType ? z.infer<S> : void
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'network_error', 'Could not reach the server')
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204 || !options.schema) return undefined as Result

  const json: unknown = await response.json()
  const parsed = options.schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiError(response.status, 'invalid_response', 'The server sent an unexpected response')
  }
  return parsed.data as Result
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function uploadFiles<S extends z.ZodType>(
  path: string,
  files: File[],
  schema: S,
  onProgress?: (fraction: number) => void,
): Promise<z.infer<S>> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const file of files) form.append('files', file, file.name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildUrl(path, undefined))
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Could not reach the server'))
    xhr.onload = () => {
      const body = xhr.response as {
        error?: { code?: string; message?: string; details?: unknown }
      } | null
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = schema.safeParse(body)
        if (parsed.success) resolve(parsed.data)
        else reject(new ApiError(xhr.status, 'invalid_response', 'Unexpected server response'))
        return
      }
      // A batch where every file was rejected still carries per-file results.
      const results = (body?.error?.details as { results?: unknown } | undefined) ?? undefined
      if (results && typeof results === 'object' && 'results' in results) {
        const parsed = schema.safeParse(results)
        if (parsed.success) {
          resolve(parsed.data)
          return
        }
      }
      reject(
        new ApiError(
          xhr.status,
          body?.error?.code ?? 'http_error',
          body?.error?.message ?? 'Upload failed',
          body?.error?.details,
        ),
      )
    }
    xhr.send(form)
  })
}
