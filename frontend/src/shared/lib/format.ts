/** 187 → "3:07", 3723 → "1:02:03". Invalid input renders as "0:00". */
export function formatTime(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatDurationMs(ms: number): string {
  return formatTime(ms / 1000)
}
