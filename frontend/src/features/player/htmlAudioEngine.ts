import type { EngineEvent, PlayerEngine } from './types'

const EVENTS: EngineEvent[] = ['timeupdate', 'durationchange', 'play', 'pause', 'ended', 'error']

/** `PlayerEngine` backed by a real `HTMLAudioElement`. */
export class HtmlAudioEngine implements PlayerEngine {
  private readonly audio: HTMLAudioElement

  constructor(audio: HTMLAudioElement = new Audio()) {
    this.audio = audio
    this.audio.preload = 'auto'
  }

  load(url: string): void {
    this.audio.src = url
    this.audio.load()
  }

  play(): Promise<void> {
    return this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  seek(seconds: number): void {
    this.audio.currentTime = seconds
  }

  setVolume(volume: number): void {
    this.audio.volume = volume
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  get duration(): number {
    return this.audio.duration
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    const handlers = EVENTS.map((event) => {
      const handler = () => listener(event)
      this.audio.addEventListener(event, handler)
      return [event, handler] as const
    })
    return () => handlers.forEach(([event, handler]) => this.audio.removeEventListener(event, handler))
  }
}
