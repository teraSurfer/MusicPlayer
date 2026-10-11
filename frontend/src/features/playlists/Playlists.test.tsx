import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { FakeBackend } from '@/test/fakeBackend'
import { renderApp } from '@/test/renderApp'
import { moveItem } from './queries'

function withPlaylist(backend: FakeBackend, name = 'Road Trip', songCount = 3) {
  const songs = backend.seed(songCount)
  backend.playlists.push({
    id: 'pl-1',
    name,
    description: null,
    songIds: songs.map((s) => s.id),
    created_at: new Date().toISOString(),
  })
  return songs
}

describe('Playlists list', () => {
  it('shows an empty state', async () => {
    renderApp('/playlists')
    expect(await screen.findByText('No playlists yet')).toBeInTheDocument()
  })

  it('lists playlists with counts and duration', async () => {
    renderApp('/playlists', (b) => withPlaylist(b))

    const list = await screen.findByRole('list', { name: 'Playlists' })
    expect(within(list).getByText('Road Trip')).toBeInTheDocument()
    expect(within(list).getByText('3 songs · 9:00')).toBeInTheDocument()
  })

  it('F-PY-01 validates the name before sending anything', async () => {
    const view = renderApp('/playlists')
    const user = userEvent.setup()
    await screen.findByText('No playlists yet')

    await user.click(screen.getByRole('button', { name: 'New playlist' }))
    await user.click(await screen.findByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')

    await user.type(screen.getByLabelText('Name'), 'x'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Name must be 100 characters or fewer')).toBeInTheDocument()

    expect(view.backend.requests.some((r) => r.startsWith('POST /api/v1/playlists'))).toBe(false)
  })

  it('F-PY-02 creates a playlist, closes the dialog and shows it', async () => {
    renderApp('/playlists')
    const user = userEvent.setup()
    await screen.findByText('No playlists yet')

    await user.click(screen.getByRole('button', { name: 'New playlist' }))
    await user.type(await screen.findByLabelText('Name'), '  Workout  ')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    const list = await screen.findByRole('list', { name: 'Playlists' })
    expect(within(list).getByText('Workout')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('F-PY-03 shows a duplicate name error inline and keeps the dialog open', async () => {
    renderApp('/playlists', (b) => withPlaylist(b, 'Road Trip'))
    const user = userEvent.setup()
    await screen.findByText('Road Trip')

    await user.click(screen.getByRole('button', { name: 'New playlist' }))
    await user.type(await screen.findByLabelText('Name'), 'road trip')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('F-PY-04 deleting needs confirmation; cancelling keeps the playlist', async () => {
    const view = renderApp('/playlists', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Road Trip')

    await user.click(screen.getByRole('button', { name: 'Delete Road Trip' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(view.backend.playlists).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Delete Road Trip' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(view.backend.playlists).toHaveLength(0))
    expect(await screen.findByText('No playlists yet')).toBeInTheDocument()
    expect(view.backend.collection.size).toBe(3) // songs untouched
  })
})

describe('Adding songs from the library', () => {
  it('F-PY-05 adds a song to a playlist from the row menu, and reports repeats', async () => {
    const view = renderApp('/library', (b) => {
      const songs = b.seed(2)
      b.playlists.push({
        id: 'pl-1',
        name: 'Favourites',
        description: null,
        songIds: [],
        created_at: new Date().toISOString(),
      })
      void songs
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByText('Song 01')

    const addVia = async () => {
      await user.click(screen.getByRole('button', { name: 'Actions for Song 01' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Add to playlist' }))
      // Base UI ignores a click that arrives right after a menu opens, so activate by keyboard.
      const item = await screen.findByRole('menuitem', { name: 'Favourites' })
      item.focus()
      await user.keyboard('{Enter}')
    }

    await addVia()
    expect(await screen.findByText('Added to “Favourites”')).toBeInTheDocument()
    expect(view.backend.playlists[0]?.songIds).toEqual(['song-1'])

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await addVia()
    expect(await screen.findByText('Already in “Favourites”')).toBeInTheDocument()
    expect(view.backend.playlists[0]?.songIds).toEqual(['song-1'])
  })
})

describe('Playlist detail', () => {
  it('shows the songs in order', async () => {
    renderApp('/playlists/pl-1', (b) => withPlaylist(b))

    expect(await screen.findByRole('heading', { name: 'Road Trip' })).toBeInTheDocument()
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows.map((r) => within(r).getByText(/Song \d\d/).textContent)).toEqual([
      'Song 01',
      'Song 02',
      'Song 03',
    ])
  })

  it('shows an empty playlist with Play disabled (F-PY-08)', async () => {
    renderApp('/playlists/pl-1', (b) => {
      b.playlists.push({
        id: 'pl-1',
        name: 'Empty',
        description: null,
        songIds: [],
        created_at: new Date().toISOString(),
      })
    })

    expect(await screen.findByText('This playlist is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play playlist' })).toBeDisabled()
  })

  it('shows a clear message for an unknown playlist', async () => {
    renderApp('/playlists/nope')

    expect(await screen.findByText('This playlist does not exist')).toBeInTheDocument()
  })

  it('F-PY-06 removing a song leaves it in the collection', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 02')

    await user.click(screen.getByRole('button', { name: 'Remove Song 02 from playlist' }))

    await waitFor(() => expect(screen.queryByText('Song 02')).not.toBeInTheDocument())
    expect(view.backend.playlists[0]?.songIds).toEqual(['song-1', 'song-3'])
    expect(view.backend.collection.has('song-2')).toBe(true)
  })

  it('F-PY-07 reordering sends the new order', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Move Song 03 up' }))

    await waitFor(() =>
      expect(view.backend.playlists[0]?.songIds).toEqual(['song-1', 'song-3', 'song-2']),
    )
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(within(rows[1] as HTMLElement).getByText('Song 03')).toBeInTheDocument()
  })

  it('F-PY-07 reverts the order when saving fails', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b), [
      http.put('http://localhost:8000/api/v1/playlists/:id/songs/order', () =>
        HttpResponse.json({ error: { code: 'invalid_order', message: 'Nope' } }, { status: 422 }),
      ),
    ])
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Move Song 03 up' }))

    expect(await screen.findByText(/Could not reorder/)).toBeInTheDocument()
    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1)
      expect(within(rows[2] as HTMLElement).getByText('Song 03')).toBeInTheDocument()
    })
    expect(view.backend.playlists[0]?.songIds).toEqual(['song-1', 'song-2', 'song-3'])
  })

  it('F-PY-08 Play loads the playlist into the queue from the first song', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Play playlist' }))

    const state = view.player.getState()
    expect(state.queue.map((t) => t.title)).toEqual(['Song 01', 'Song 02', 'Song 03'])
    expect(state.current?.title).toBe('Song 01')
    expect(state.sourceId).toBe('playlist:pl-1')
  })

  it('F-PY-09 clicking a song starts there with the rest queued', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 02')

    await user.click(screen.getByRole('button', { name: 'Play Song 02' }))

    expect(view.player.getState().current?.title).toBe('Song 02')
    view.player.getState().next()
    expect(view.player.getState().current?.title).toBe('Song 03')
  })

  it('F-PY-10 highlights the song that is playing', async () => {
    renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    const title = await screen.findByText('Song 02')

    await user.click(screen.getByRole('button', { name: 'Play Song 02' }))

    expect(title.closest('tr')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Song 01').closest('tr')).not.toHaveAttribute('aria-current')
  })

  it('UC5-6 editing the playing playlist updates the queue without interrupting playback', async () => {
    const view = renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 01')
    await user.click(screen.getByRole('button', { name: 'Play Song 02' }))
    const loads = view.engine.load.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Remove Song 03 from playlist' }))

    await waitFor(() =>
      expect(view.player.getState().queue.map((t) => t.title)).toEqual(['Song 01', 'Song 02']),
    )
    expect(view.player.getState().current?.title).toBe('Song 02')
    expect(view.player.getState().isPlaying).toBe(true)
    expect(view.engine.load.mock.calls.length).toBe(loads)
  })

  it('renames the playlist and reports a name clash', async () => {
    const view = renderApp('/playlists/pl-1', (b) => {
      withPlaylist(b, 'Road Trip')
      b.playlists.push({
        id: 'pl-2',
        name: 'Taken',
        description: null,
        songIds: [],
        created_at: new Date().toISOString(),
      })
    })
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Road Trip' })

    await user.click(screen.getByRole('button', { name: 'Edit playlist' }))
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'taken')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/)

    await user.clear(name)
    await user.type(name, 'Summer')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'Summer' })).toBeInTheDocument()
    expect(view.backend.playlists[0]?.name).toBe('Summer')
  })

  it('deleting from the detail page returns to the list', async () => {
    renderApp('/playlists/pl-1', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Road Trip' })

    await user.click(screen.getByRole('button', { name: 'Delete playlist' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('No playlists yet')).toBeInTheDocument()
  })
})

describe('Library removal cascades', () => {
  it('a song removed from the collection disappears from playlists', async () => {
    const view = renderApp('/library', (b) => withPlaylist(b))
    const user = userEvent.setup()
    await screen.findByText('Song 02')

    await user.click(screen.getByRole('button', { name: 'Actions for Song 02' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from collection' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(view.backend.playlists[0]?.songIds).toEqual(['song-1', 'song-3']))
  })
})

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('ignores out of range moves', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 0, 5)).toBe(items)
    expect(moveItem(items, -1, 0)).toBe(items)
  })
})
