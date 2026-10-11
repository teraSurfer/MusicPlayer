import { vi } from 'vitest'
import type { EngineEvent, PlayerEngine, PlayerTrack } from '@/features/player/types'

/** In-memory `PlayerEngine` for tests; call `emit` to simulate the audio element. */
export class FakeEngine implements PlayerEngine {
  loaded: string | null = null
  playing = false
  volume = 1
  muted = false
  currentTime = 0
  duration = 0
  private listeners = new Set<(event: EngineEvent) => void>()

  load = vi.fn((url: string) => {
    this.loaded = url
    this.currentTime = 0
  })
  play = vi.fn(() => {
    this.playing = true
    return Promise.resolve()
  })
  pause = vi.fn(() => {
    this.playing = false
  })
  seek = vi.fn((seconds: number) => {
    this.currentTime = seconds
  })
  setVolume = vi.fn((volume: number) => {
    this.volume = volume
  })
  setMuted = vi.fn((muted: boolean) => {
    this.muted = muted
  })

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: EngineEvent, patch: Partial<Pick<FakeEngine, 'currentTime' | 'duration'>> = {}) {
    Object.assign(this, patch)
    this.listeners.forEach((listener) => listener(event))
  }
}

export function makeTrack(n: number, overrides: Partial<PlayerTrack> = {}): PlayerTrack {
  return {
    id: `t${n}`,
    title: `Track ${n}`,
    artist: `Artist ${n}`,
    album: null,
    streamUrl: `/api/v1/songs/t${n}/stream`,
    coverUrl: null,
    durationMs: 180_000,
    ...overrides,
  }
}

export function makeTracks(count: number): PlayerTrack[] {
  return Array.from({ length: count }, (_, i) => makeTrack(i + 1))
}

export class MemoryStorage {
  data = new Map<string, string>()
  getItem = (key: string) => this.data.get(key) ?? null
  setItem = (key: string, value: string) => void this.data.set(key, value)
}
