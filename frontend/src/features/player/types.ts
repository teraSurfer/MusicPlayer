export interface PlayerTrack {
  id: string
  title: string
  artist: string | null
  album: string | null
  streamUrl: string
  coverUrl: string | null
  durationMs: number
}

export type RepeatMode = 'off' | 'all' | 'one'

export type EngineEvent =
  | 'timeupdate'
  | 'durationchange'
  | 'play'
  | 'pause'
  | 'ended'
  | 'error'

/** The only thing the player store knows about audio playback. */
export interface PlayerEngine {
  load(url: string): void
  play(): Promise<void>
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  readonly currentTime: number
  readonly duration: number
  subscribe(listener: (event: EngineEvent) => void): () => void
}
