import { z } from 'zod'
import type { RepeatMode } from './types'

export interface PlayerSettings {
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
}

export const DEFAULT_SETTINGS: PlayerSettings = {
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
}

const STORAGE_KEY = 'musicplayer.player.settings.v1'

const schema = z.object({
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  repeat: z.enum(['off', 'all', 'one']),
  shuffle: z.boolean(),
})

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadSettings(storage: SettingsStorage | undefined): PlayerSettings {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(storage: SettingsStorage | undefined, settings: PlayerSettings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable (private mode, quota); settings just don't persist.
  }
}
