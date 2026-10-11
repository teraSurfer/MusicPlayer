import type { RepeatMode } from './types'

/** Seconds of playback after which "previous" restarts the song instead of going back. */
export const RESTART_THRESHOLD_SECONDS = 3

const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one']

export function cycleRepeat(mode: RepeatMode): RepeatMode {
  const index = REPEAT_CYCLE.indexOf(mode)
  return REPEAT_CYCLE[(index + 1) % REPEAT_CYCLE.length] ?? 'off'
}

/**
 * Play order as indices into the queue. Without shuffle it is 0..n-1. With
 * shuffle the current track comes first, followed by a random permutation of
 * the rest (Fisher-Yates), so every track plays once per cycle.
 */
export function buildOrder(
  length: number,
  currentIndex: number,
  shuffle: boolean,
  random: () => number = Math.random,
): number[] {
  const indices = Array.from({ length }, (_, i) => i)
  if (!shuffle) return indices

  const rest = indices.filter((i) => i !== currentIndex)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = rest[i] as number
    rest[i] = rest[j] as number
    rest[j] = a
  }
  return currentIndex >= 0 && currentIndex < length ? [currentIndex, ...rest] : rest
}

/**
 * Position to play after `position`, or null when playback should stop.
 * `auto` means the track ended by itself; repeat-one only applies then.
 */
export function nextPosition(
  position: number,
  length: number,
  repeat: RepeatMode,
  trigger: 'auto' | 'manual',
): number | null {
  if (length === 0) return null
  if (trigger === 'auto' && repeat === 'one' && position >= 0) return position
  const next = position + 1
  if (next < length) return next
  return repeat === 'off' ? null : 0
}

export type PreviousAction = { type: 'restart' } | { type: 'goto'; position: number }

export function previousAction(
  position: number,
  elapsedSeconds: number,
  threshold: number = RESTART_THRESHOLD_SECONDS,
): PreviousAction {
  if (elapsedSeconds > threshold || position <= 0) return { type: 'restart' }
  return { type: 'goto', position: position - 1 }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
