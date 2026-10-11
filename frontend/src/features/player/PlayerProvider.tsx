import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useStore } from 'zustand'
import { HtmlAudioEngine } from './htmlAudioEngine'
import { bindMediaSession } from './mediaSession'
import { createPlayerStore, type PlayerState, type PlayerStore } from './store'
import { usePlayerShortcuts } from './usePlayerShortcuts'

const PlayerContext = createContext<PlayerStore | null>(null)

function createDefaultStore(): PlayerStore {
  return createPlayerStore({
    engine: new HtmlAudioEngine(),
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    notify: (message) => toast.error(message),
  })
}

/** Owns the player store for the app. Tests pass their own `store` (with a fake engine). */
export function PlayerProvider({ store, children }: { store?: PlayerStore; children: ReactNode }) {
  const [value] = useState<PlayerStore>(() => store ?? createDefaultStore())

  useEffect(() => bindMediaSession(value), [value])
  usePlayerShortcuts(value)

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayerStoreApi(): PlayerStore {
  const store = useContext(PlayerContext)
  if (!store) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return store
}

export function usePlayer<T>(selector: (state: PlayerState) => T): T {
  return useStore(usePlayerStoreApi(), selector)
}
