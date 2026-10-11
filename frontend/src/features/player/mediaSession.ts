import type { PlayerStore } from './store'

interface MediaSessionLike {
  metadata: unknown
  playbackState: 'none' | 'paused' | 'playing'
  setActionHandler: (action: string, handler: ((details: { seekTime?: number }) => void) | null) => void
}

const ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const

/**
 * Mirrors the player into the browser's Media Session so OS media keys and
 * now-playing widgets work. Returns an unsubscribe function.
 */
export function bindMediaSession(
  store: PlayerStore,
  session: MediaSessionLike | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as unknown as { mediaSession?: MediaSessionLike }).mediaSession,
  createMetadata: (init: object) => unknown = (init) =>
    new (globalThis as unknown as { MediaMetadata: new (i: object) => unknown }).MediaMetadata(init),
): () => void {
  if (!session) return () => {}

  const state = () => store.getState()
  const handlers: Record<(typeof ACTIONS)[number], (d: { seekTime?: number }) => void> = {
    play: () => state().play(),
    pause: () => state().pause(),
    previoustrack: () => state().previous(),
    nexttrack: () => state().next(),
    seekto: (d) => {
      if (d.seekTime !== undefined) state().seek(d.seekTime)
    },
  }
  for (const action of ACTIONS) {
    try {
      session.setActionHandler(action, handlers[action])
    } catch {
      // Some browsers do not support every action.
    }
  }

  let lastTrackId: string | null = null
  const sync = () => {
    const { current, isPlaying } = state()
    session.playbackState = current ? (isPlaying ? 'playing' : 'paused') : 'none'
    if (current?.id === lastTrackId) return
    lastTrackId = current?.id ?? null
    try {
      session.metadata = current
        ? createMetadata({
            title: current.title,
            artist: current.artist ?? '',
            album: current.album ?? '',
            artwork: current.coverUrl ? [{ src: current.coverUrl }] : [],
          })
        : null
    } catch {
      session.metadata = null
    }
  }
  sync()
  const unsubscribe = store.subscribe(sync)

  return () => {
    unsubscribe()
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, null)
      } catch {
        // ignore
      }
    }
  }
}
