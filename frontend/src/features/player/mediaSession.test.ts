import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeEngine, makeTracks } from '@/test/fakeEngine'
import { bindMediaSession } from './mediaSession'
import { createPlayerStore } from './store'

type Handler = (d: { seekTime?: number }) => void

function setup() {
  const handlers = new Map<string, Handler | null>()
  const session = {
    metadata: null as unknown,
    playbackState: 'none' as 'none' | 'paused' | 'playing',
    setActionHandler: vi.fn((action: string, handler: Handler | null) => {
      handlers.set(action, handler)
    }),
  }
  const engine = new FakeEngine()
  const store = createPlayerStore({ engine })
  const unbind = bindMediaSession(store, session, (init) => ({ ...init }))
  return { session, handlers, engine, store, unbind }
}

describe('bindMediaSession', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('UC2-9 publishes now-playing metadata and playback state', () => {
    ctx.store.getState().playQueue(makeTracks(2))

    expect(ctx.session.metadata).toMatchObject({ title: 'Track 1', artist: 'Artist 1' })
    expect(ctx.session.playbackState).toBe('playing')

    ctx.store.getState().pause()
    expect(ctx.session.playbackState).toBe('paused')
  })

  it('UC2-9 media keys control the player', () => {
    ctx.store.getState().playQueue(makeTracks(3))

    ctx.handlers.get('nexttrack')?.({})
    expect(ctx.store.getState().current?.id).toBe('t2')

    ctx.handlers.get('pause')?.({})
    expect(ctx.store.getState().isPlaying).toBe(false)

    ctx.handlers.get('play')?.({})
    expect(ctx.store.getState().isPlaying).toBe(true)

    ctx.handlers.get('seekto')?.({ seekTime: 12 })
    expect(ctx.engine.seek).toHaveBeenLastCalledWith(12)
  })

  it('clears metadata when the queue is cleared and unbinds cleanly', () => {
    ctx.store.getState().playQueue(makeTracks(1))
    ctx.store.getState().playQueue([])
    expect(ctx.session.metadata).toBeNull()
    expect(ctx.session.playbackState).toBe('none')

    ctx.unbind()
    expect(ctx.handlers.get('play')).toBeNull()
  })

  it('does nothing when the browser has no Media Session', () => {
    const store = createPlayerStore({ engine: new FakeEngine() })
    expect(() => bindMediaSession(store, undefined)()).not.toThrow()
  })
})
