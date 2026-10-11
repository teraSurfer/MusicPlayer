import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  buildOrder,
  clamp,
  cycleRepeat,
  nextPosition,
  previousAction,
} from './queue'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type PlayerSettings,
} from './settings'
import type { PlayerEngine, PlayerTrack, RepeatMode } from './types'

export interface PlayerState extends PlayerSettings {
  queue: PlayerTrack[]
  /** Play order as indices into `queue`. */
  order: number[]
  /** Index into `order`. -1 means "before the first", e.g. the playing track left the queue. */
  position: number
  current: PlayerTrack | null
  /** What the queue was built from, e.g. `playlist:<id>`; lets a page keep it in sync. */
  sourceId: string | null
  isPlaying: boolean
  currentTime: number
  duration: number

  playQueue: (tracks: PlayerTrack[], startIndex?: number, sourceId?: string | null) => void
  updateQueue: (tracks: PlayerTrack[]) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleRepeat: () => void
  toggleShuffle: () => void
}

export interface PlayerStoreDeps {
  engine: PlayerEngine
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  notify?: (message: string) => void
  random?: () => number
}

export type PlayerStore = StoreApi<PlayerState>

export function createPlayerStore(deps: PlayerStoreDeps): PlayerStore {
  const { engine, storage, notify = () => {}, random = Math.random } = deps
  const initial = loadSettings(storage)
  let errorStreak = 0

  engine.setVolume(initial.volume)
  engine.setMuted(initial.muted)

  const store = createStore<PlayerState>()((set, get) => {
    const persist = () => {
      const { volume, muted, repeat, shuffle } = get()
      saveSettings(storage, { volume, muted, repeat, shuffle })
    }

    const trackAt = (state: PlayerState, position: number): PlayerTrack | null => {
      const index = state.order[position]
      return index === undefined ? null : (state.queue[index] ?? null)
    }

    const startPosition = (position: number) => {
      const track = trackAt(get(), position)
      if (!track) return
      set({
        position,
        current: track,
        currentTime: 0,
        duration: track.durationMs / 1000,
        isPlaying: true,
      })
      engine.load(track.streamUrl)
      void engine.play().catch(() => set({ isPlaying: false }))
    }

    const stopAtEnd = () => {
      engine.pause()
      set({ isPlaying: false })
    }

    const advance = (trigger: 'auto' | 'manual') => {
      const { position, order, repeat } = get()
      const target = nextPosition(position, order.length, repeat, trigger)
      if (target === null) {
        stopAtEnd()
      } else if (target === position && trigger === 'auto') {
        engine.seek(0)
        void engine.play().catch(() => set({ isPlaying: false }))
        set({ currentTime: 0, isPlaying: true })
      } else {
        startPosition(target)
      }
    }

    engine.subscribe((event) => {
      switch (event) {
        case 'timeupdate':
          errorStreak = 0
          set({ currentTime: engine.currentTime })
          break
        case 'durationchange':
          if (Number.isFinite(engine.duration) && engine.duration > 0) {
            set({ duration: engine.duration })
          }
          break
        case 'play':
          set({ isPlaying: true })
          break
        case 'pause':
          set({ isPlaying: false })
          break
        case 'ended':
          advance('auto')
          break
        case 'error': {
          const { current, queue } = get()
          notify(`Could not play “${current?.title ?? 'this track'}”`)
          errorStreak += 1
          if (errorStreak >= queue.length) {
            errorStreak = 0
            stopAtEnd()
          } else {
            advance('manual')
          }
          break
        }
      }
    })

    return {
      ...initial,
      queue: [],
      order: [],
      position: -1,
      current: null,
      sourceId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,

      playQueue: (tracks, startIndex = 0, sourceId = null) => {
        if (tracks.length === 0) {
          engine.pause()
          set({ queue: [], order: [], position: -1, current: null, sourceId: null, isPlaying: false })
          return
        }
        const index = clamp(startIndex, 0, tracks.length - 1)
        const { shuffle } = get()
        const order = buildOrder(tracks.length, index, shuffle, random)
        errorStreak = 0
        set({ queue: tracks, order, sourceId })
        startPosition(shuffle ? 0 : index)
      },

      updateQueue: (tracks) => {
        const state = get()
        const previousIds = state.order.map((i) => state.queue[i]?.id)
        const currentId = state.current?.id
        const known = new Set(tracks.map((t) => t.id))

        let order: number[]
        if (state.shuffle) {
          // Keep the shuffled order of what is still there; append newcomers.
          const indexById = new Map(tracks.map((t, i) => [t.id, i]))
          const kept = previousIds.filter((id): id is string => !!id && known.has(id))
          const keptSet = new Set(kept)
          order = [
            ...kept.map((id) => indexById.get(id) as number),
            ...tracks.flatMap((t, i) => (keptSet.has(t.id) ? [] : [i])),
          ]
        } else {
          order = tracks.map((_, i) => i)
        }

        let position = -1
        if (currentId !== undefined) {
          const orderedIds = order.map((i) => tracks[i]?.id)
          const found = orderedIds.indexOf(currentId)
          if (found >= 0) {
            position = found
          } else {
            // The playing track was removed: let it finish, then continue where it was.
            const before = previousIds
              .slice(0, Math.max(state.position, 0))
              .filter((id) => id !== undefined && known.has(id)).length
            position = state.position < 0 ? -1 : before - 1
          }
        }
        set({ queue: tracks, order, position })
      },

      play: () => {
        if (!get().current) return
        void engine.play().catch(() => set({ isPlaying: false }))
        set({ isPlaying: true })
      },

      pause: () => {
        engine.pause()
        set({ isPlaying: false })
      },

      togglePlay: () => {
        if (get().isPlaying) get().pause()
        else get().play()
      },

      next: () => {
        if (!get().current) return
        errorStreak = 0
        advance('manual')
      },

      previous: () => {
        const { current, position, currentTime } = get()
        if (!current) return
        const action = previousAction(position, currentTime)
        if (action.type === 'restart') {
          engine.seek(0)
          set({ currentTime: 0 })
        } else {
          startPosition(action.position)
        }
      },

      seek: (seconds) => {
        const { duration, current } = get()
        if (!current) return
        const limit = duration > 0 ? duration : seconds
        const target = clamp(seconds, 0, limit)
        engine.seek(target)
        set({ currentTime: target })
      },

      setVolume: (volume) => {
        const value = clamp(volume, 0, 1)
        engine.setVolume(value)
        set({ volume: value })
        persist()
      },

      toggleMute: () => {
        const muted = !get().muted
        engine.setMuted(muted)
        set({ muted })
        persist()
      },

      cycleRepeat: () => {
        set({ repeat: cycleRepeat(get().repeat) as RepeatMode })
        persist()
      },

      toggleShuffle: () => {
        const state = get()
        const shuffle = !state.shuffle
        const currentIndex = state.order[state.position] ?? -1
        const order = buildOrder(state.queue.length, currentIndex, shuffle, random)
        const position = shuffle ? (currentIndex >= 0 ? 0 : -1) : currentIndex
        set({ shuffle, order, position })
        persist()
      },
    }
  })

  return store
}

export { DEFAULT_SETTINGS }
