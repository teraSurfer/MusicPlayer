import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { FakeEngine, MemoryStorage, makeTrack, makeTracks } from '@/test/fakeEngine'
import { createPlayerStore, type PlayerStore } from './store'

let engine: FakeEngine
let storage: MemoryStorage
let notify: Mock<(message: string) => void>
let store: PlayerStore

function build(random: () => number = () => 0.5) {
  engine = new FakeEngine()
  storage = new MemoryStorage()
  notify = vi.fn<(message: string) => void>()
  store = createPlayerStore({ engine, storage, notify, random })
}

const state = () => store.getState()

beforeEach(() => build())

describe('starting playback', () => {
  it('F-PL-01 playQueue starts the chosen track', () => {
    state().playQueue(makeTracks(3), 1)

    expect(state().current?.id).toBe('t2')
    expect(state().isPlaying).toBe(true)
    expect(engine.loaded).toBe('/api/v1/songs/t2/stream')
    expect(engine.play).toHaveBeenCalled()
  })

  it('clamps an out-of-range start index', () => {
    state().playQueue(makeTracks(3), 99)
    expect(state().current?.id).toBe('t3')
  })

  it('an empty queue clears the player', () => {
    state().playQueue(makeTracks(2))
    state().playQueue([])
    expect(state().current).toBeNull()
    expect(state().isPlaying).toBe(false)
  })

  it('starts the duration from track metadata, then the real duration', () => {
    state().playQueue(makeTracks(1))
    expect(state().duration).toBe(180)
    engine.emit('durationchange', { duration: 201.5 })
    expect(state().duration).toBe(201.5)
  })

  it('ignores a non-finite engine duration', () => {
    state().playQueue(makeTracks(1))
    engine.emit('durationchange', { duration: Number.NaN })
    expect(state().duration).toBe(180)
  })
})

describe('transport', () => {
  it('F-PL-02 toggles play and pause', () => {
    state().playQueue(makeTracks(2))

    state().togglePlay()
    expect(state().isPlaying).toBe(false)
    expect(engine.pause).toHaveBeenCalled()

    state().togglePlay()
    expect(state().isPlaying).toBe(true)
  })

  it('play does nothing with an empty queue', () => {
    state().play()
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('F-PL-03 next advances', () => {
    state().playQueue(makeTracks(3))
    state().next()
    expect(state().current?.id).toBe('t2')
  })

  it('F-PL-04 next at the end with repeat off stops on the last track', () => {
    state().playQueue(makeTracks(2), 1)
    state().next()
    expect(state().current?.id).toBe('t2')
    expect(state().isPlaying).toBe(false)
  })

  it('F-PL-05 repeat all wraps to the first track', () => {
    state().playQueue(makeTracks(2), 1)
    state().cycleRepeat() // all
    state().next()
    expect(state().current?.id).toBe('t1')
    expect(state().isPlaying).toBe(true)
  })

  it('F-PL-05 a track ending moves to the next', () => {
    state().playQueue(makeTracks(3))
    engine.emit('ended')
    expect(state().current?.id).toBe('t2')
  })

  it('F-PL-04 the last track ending stops playback', () => {
    state().playQueue(makeTracks(1))
    engine.emit('ended')
    expect(state().isPlaying).toBe(false)
  })

  it('F-PL-06 repeat one restarts the same track when it ends', () => {
    state().playQueue(makeTracks(3), 1)
    state().cycleRepeat() // all
    state().cycleRepeat() // one

    engine.emit('ended')

    expect(state().current?.id).toBe('t2')
    expect(engine.seek).toHaveBeenLastCalledWith(0)
    expect(state().isPlaying).toBe(true)
  })

  it('F-PL-07 previous restarts after more than 3 seconds', () => {
    state().playQueue(makeTracks(3), 1)
    engine.emit('timeupdate', { currentTime: 10 })

    state().previous()

    expect(state().current?.id).toBe('t2')
    expect(engine.seek).toHaveBeenLastCalledWith(0)
  })

  it('F-PL-08 previous goes back within 3 seconds', () => {
    state().playQueue(makeTracks(3), 1)
    engine.emit('timeupdate', { currentTime: 1 })

    state().previous()

    expect(state().current?.id).toBe('t1')
  })

  it('F-PL-08 previous on the first track restarts it', () => {
    state().playQueue(makeTracks(3), 0)
    state().previous()
    expect(state().current?.id).toBe('t1')
    expect(engine.seek).toHaveBeenLastCalledWith(0)
  })

  it('F-PL-12 seek is clamped to the track length', () => {
    state().playQueue(makeTracks(1))
    state().seek(9999)
    expect(engine.seek).toHaveBeenLastCalledWith(180)
    state().seek(-5)
    expect(engine.seek).toHaveBeenLastCalledWith(0)
  })

  it('timeupdate mirrors the engine position', () => {
    state().playQueue(makeTracks(1))
    engine.emit('timeupdate', { currentTime: 42 })
    expect(state().currentTime).toBe(42)
  })

  it('engine play/pause events keep isPlaying in sync (e.g. OS media keys)', () => {
    state().playQueue(makeTracks(1))
    engine.emit('pause')
    expect(state().isPlaying).toBe(false)
    engine.emit('play')
    expect(state().isPlaying).toBe(true)
  })
})

describe('volume, repeat and shuffle', () => {
  it('F-PL-12 volume is clamped and unmuting restores it', () => {
    state().setVolume(1.7)
    expect(state().volume).toBe(1)
    state().setVolume(0.3)
    state().toggleMute()
    expect(engine.muted).toBe(true)
    expect(state().volume).toBe(0.3)
    state().toggleMute()
    expect(engine.muted).toBe(false)
    expect(engine.volume).toBe(0.3)
  })

  it('F-PL-09 repeat cycles', () => {
    state().cycleRepeat()
    expect(state().repeat).toBe('all')
    state().cycleRepeat()
    expect(state().repeat).toBe('one')
    state().cycleRepeat()
    expect(state().repeat).toBe('off')
  })

  it('F-PL-10 shuffle keeps the current track and plays every track once', () => {
    let n = 0
    build(() => [0.9, 0.2, 0.7, 0.4][n++ % 4] as number)
    state().playQueue(makeTracks(5), 2)
    state().toggleShuffle()
    expect(state().current?.id).toBe('t3')

    const played = [state().current?.id]
    for (let i = 0; i < 4; i++) {
      state().next()
      played.push(state().current?.id)
    }

    expect([...played].sort()).toEqual(['t1', 't2', 't3', 't4', 't5'])
  })

  it('F-PL-10 shuffle on at start plays the chosen track first', () => {
    state().toggleShuffle()
    state().playQueue(makeTracks(5), 3)
    expect(state().current?.id).toBe('t4')
    expect(state().position).toBe(0)
  })

  it('F-PL-11 turning shuffle off restores list order around the current track', () => {
    state().playQueue(makeTracks(5), 2)
    state().toggleShuffle()
    state().next()
    const current = state().current?.id

    state().toggleShuffle()

    expect(state().current?.id).toBe(current)
    expect(state().order).toEqual([0, 1, 2, 3, 4])
    const index = Number(current?.slice(1)) - 1
    expect(state().position).toBe(index)
  })
})

describe('persistence', () => {
  it('F-PL-13 saves and restores volume, mute, repeat and shuffle', () => {
    state().setVolume(0.25)
    state().toggleMute()
    state().cycleRepeat()
    state().toggleShuffle()

    const second = createPlayerStore({ engine: new FakeEngine(), storage })

    expect(second.getState()).toMatchObject({
      volume: 0.25,
      muted: true,
      repeat: 'all',
      shuffle: true,
    })
  })

  it('F-PL-13 falls back to defaults for corrupt stored data', () => {
    storage.setItem('musicplayer.player.settings.v1', '{not json')
    const fresh = createPlayerStore({ engine: new FakeEngine(), storage })
    expect(fresh.getState()).toMatchObject({ volume: 0.8, repeat: 'off', shuffle: false })

    storage.setItem(
      'musicplayer.player.settings.v1',
      JSON.stringify({ volume: 5, muted: 'yes', repeat: 'sometimes', shuffle: 1 }),
    )
    const invalid = createPlayerStore({ engine: new FakeEngine(), storage })
    expect(invalid.getState().volume).toBe(0.8)
  })

  it('works when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    const s = createPlayerStore({ engine: new FakeEngine(), storage: broken })
    expect(() => s.getState().setVolume(0.5)).not.toThrow()
  })

  it('applies stored settings to the engine on creation', () => {
    state().setVolume(0.4)
    const e = new FakeEngine()
    createPlayerStore({ engine: e, storage })
    expect(e.volume).toBe(0.4)
  })
})

describe('errors', () => {
  it('F-PL-14 an engine error shows a message and skips to the next track', () => {
    state().playQueue(makeTracks(3))

    engine.emit('error')

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Track 1'))
    expect(state().current?.id).toBe('t2')
  })

  it('does not loop forever when every track fails', () => {
    state().playQueue(makeTracks(3))
    state().cycleRepeat() // all: would otherwise wrap endlessly

    engine.emit('error')
    engine.emit('error')
    engine.emit('error')

    expect(notify).toHaveBeenCalledTimes(3)
    expect(state().isPlaying).toBe(false)
  })

  it('a successful timeupdate resets the failure streak', () => {
    state().playQueue(makeTracks(3))
    engine.emit('error') // t1 fails, t2 starts
    engine.emit('timeupdate', { currentTime: 1 }) // t2 plays fine
    engine.emit('error') // t2 fails, t3 starts

    expect(state().current?.id).toBe('t3')
    expect(state().isPlaying).toBe(true)
  })
})

describe('queue updates while playing', () => {
  it('F-PL-15 adding a track does not interrupt the current one', () => {
    state().playQueue(makeTracks(3), 1)
    const loads = engine.load.mock.calls.length

    state().updateQueue([...makeTracks(3), makeTrack(4)])

    expect(state().current?.id).toBe('t2')
    expect(state().queue).toHaveLength(4)
    expect(engine.load.mock.calls.length).toBe(loads)
    state().next()
    state().next()
    expect(state().current?.id).toBe('t4')
  })

  it('F-PL-15 reordering keeps the current track current', () => {
    state().playQueue(makeTracks(3), 0)

    state().updateQueue([makeTrack(3), makeTrack(1), makeTrack(2)])

    expect(state().current?.id).toBe('t1')
    state().next()
    expect(state().current?.id).toBe('t2')
  })

  it('F-PL-15 removing the playing track lets it finish, then continues in place', () => {
    state().playQueue(makeTracks(4), 1) // playing t2
    const loads = engine.load.mock.calls.length

    state().updateQueue([makeTrack(1), makeTrack(3), makeTrack(4)])

    expect(state().current?.id).toBe('t2')
    expect(state().isPlaying).toBe(true)
    expect(engine.load.mock.calls.length).toBe(loads)

    engine.emit('ended')
    expect(state().current?.id).toBe('t3')
  })

  it('removing the playing track from the front continues with the new first', () => {
    state().playQueue(makeTracks(3), 0)
    state().updateQueue([makeTrack(2), makeTrack(3)])
    engine.emit('ended')
    expect(state().current?.id).toBe('t2')
  })

  it('shuffle keeps the existing shuffled order of surviving tracks', () => {
    let n = 0
    build(() => [0.9, 0.1, 0.6, 0.3][n++ % 4] as number)
    state().toggleShuffle()
    state().playQueue(makeTracks(4), 0)
    const before = state().order.map((i) => state().queue[i]?.id)

    state().updateQueue(makeTracks(4).filter((t) => t.id !== 't3'))

    const after = state().order.map((i) => state().queue[i]?.id)
    expect(after).toEqual(before.filter((id) => id !== 't3'))
  })
})
