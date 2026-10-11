import { useEffect } from 'react'
import type { PlayerStore } from './store'

const SEEK_STEP_SECONDS = 5

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName)
}

/** Space, ←/→ (seek), Shift+←/→ (previous/next), M (mute). */
export function usePlayerShortcuts(store: PlayerStore): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      const player = store.getState()
      switch (event.key) {
        case ' ':
          if (isActivatable(event.target)) return // let the focused button handle it
          event.preventDefault()
          player.togglePlay()
          break
        case 'ArrowRight':
          event.preventDefault()
          if (event.shiftKey) player.next()
          else player.seek(player.currentTime + SEEK_STEP_SECONDS)
          break
        case 'ArrowLeft':
          event.preventDefault()
          if (event.shiftKey) player.previous()
          else player.seek(player.currentTime - SEEK_STEP_SECONDS)
          break
        case 'm':
        case 'M':
          player.toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
}
