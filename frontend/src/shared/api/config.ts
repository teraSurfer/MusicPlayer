/** Where the API lives. Empty means same origin (the Vite dev proxy or a reverse proxy). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export const API_PREFIX = '/api/v1'

/** Turns an API-relative URL such as a `stream_url` into one the browser can fetch. */
export function resolveApiUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${API_BASE_URL}${url}`
}

/** Matches the backend's default MUSIC_MAX_UPLOAD_BYTES. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export const ALLOWED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a'] as const
