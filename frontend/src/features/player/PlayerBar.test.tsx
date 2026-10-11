import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeEngine, MemoryStorage, makeTrack, makeTracks } from '@/test/fakeEngine'
import { PlayerBar } from './PlayerBar'
import { PlayerProvider } from './PlayerProvider'
import { createPlayerStore, type PlayerStore } from './store'

let engine: FakeEngine
let store: PlayerStore

function renderBar() {
  engine = new FakeEngine()
  store = createPlayerStore({ engine, storage: new MemoryStorage() })
  return render(
    <PlayerProvider store={store}>
      <input aria-label="search box" />
      <PlayerBar />
    </PlayerProvider>,
  )
}

beforeEach(() => {
  renderBar()
})

describe('PlayerBar', () => {
  it('F-PU-02 starts empty with transport controls disabled', () => {
    expect(screen.getByText('Nothing playing')).toBeInTheDocument()
    for (const name of ['Previous', 'Play', 'Next', 'Seek']) {
      expect(screen.getByRole(name === 'Seek' ? 'slider' : 'button', { name })).toBeDisabled()
    }
  })

  it('F-PU-01 shows title, artist and cover of the current track', () => {
    act(() =>
      store.getState().playQueue([makeTrack(1, { coverUrl: '/cover.png', artist: 'Ada' })]),
    )

    expect(screen.getByText('Track 1')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('src', '/cover.png')
    expect(screen.getByText('Now playing: Track 1 by Ada')).toBeInTheDocument()
  })

  it('play/pause button reflects and controls state', async () => {
    const user = userEvent.setup()
    act(() => store.getState().playQueue(makeTracks(2)))

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(store.getState().isPlaying).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(store.getState().isPlaying).toBe(true)
  })

  it('next and previous move through the queue', async () => {
    const user = userEvent.setup()
    act(() => store.getState().playQueue(makeTracks(3)))

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('player-title')).toHaveTextContent('Track 2')

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByTestId('player-title')).toHaveTextContent('Track 1')
  })

  it('F-PU-03 seek slider shows progress and seeks the engine', () => {
    act(() => store.getState().playQueue(makeTracks(1)))
    act(() => engine.emit('timeupdate', { currentTime: 65 }))

    expect(screen.getByTestId('elapsed')).toHaveTextContent('1:05')
    expect(screen.getByTestId('total')).toHaveTextContent('3:00')

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '120' } })

    expect(engine.seek).toHaveBeenLastCalledWith(120)
  })

  it('F-PU-05 repeat button cycles and exposes its state', async () => {
    const user = userEvent.setup()
    const button = () => screen.getByRole('button', { name: /^Repeat/ })
    expect(button()).toHaveAccessibleName('Repeat: off')
    expect(button()).toHaveAttribute('aria-pressed', 'false')

    await user.click(button())
    expect(button()).toHaveAccessibleName('Repeat: all')
    expect(button()).toHaveAttribute('aria-pressed', 'true')

    await user.click(button())
    expect(button()).toHaveAccessibleName('Repeat: one')
  })

  it('shuffle toggles aria-pressed', async () => {
    const user = userEvent.setup()
    const shuffle = screen.getByRole('button', { name: 'Shuffle' })
    expect(shuffle).toHaveAttribute('aria-pressed', 'false')
    await user.click(shuffle)
    expect(shuffle).toHaveAttribute('aria-pressed', 'true')
  })

  it('volume slider and mute button', async () => {
    const user = userEvent.setup()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.4' } })
    expect(store.getState().volume).toBeCloseTo(0.4)

    await user.click(screen.getByRole('button', { name: 'Mute' }))
    expect(store.getState().muted).toBe(true)
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
  })
})

describe('keyboard shortcuts', () => {
  beforeEach(() => {
    act(() => store.getState().playQueue(makeTracks(3)))
    act(() => engine.emit('timeupdate', { currentTime: 30 }))
  })

  it('F-PU-04 space toggles play/pause', async () => {
    await userEvent.keyboard(' ')
    expect(store.getState().isPlaying).toBe(false)
    await userEvent.keyboard(' ')
    expect(store.getState().isPlaying).toBe(true)
  })

  it('F-PU-04 arrows seek by 5 seconds', async () => {
    await userEvent.keyboard('{ArrowRight}')
    expect(engine.seek).toHaveBeenLastCalledWith(35)
    await userEvent.keyboard('{ArrowLeft}')
    expect(engine.seek).toHaveBeenLastCalledWith(30)
  })

  it('F-PU-04 shift+arrows change track', async () => {
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(store.getState().current?.id).toBe('t2')
    act(() => engine.emit('timeupdate', { currentTime: 1 }))
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(store.getState().current?.id).toBe('t1')
  })

  it('F-PU-04 m toggles mute', async () => {
    await userEvent.keyboard('m')
    expect(store.getState().muted).toBe(true)
  })

  it('F-PU-04 shortcuts are ignored while typing in an input', async () => {
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('search box'))

    await user.keyboard('m {ArrowRight}')

    expect(store.getState().muted).toBe(false)
    expect(store.getState().isPlaying).toBe(true)
  })

  it('space on a focused button activates only that button', async () => {
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Next' }).focus()

    await user.keyboard(' ')

    expect(store.getState().current?.id).toBe('t2')
    expect(store.getState().isPlaying).toBe(true)
  })
})
