import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'

const audioFile = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'audio/mpeg' })

describe('Library', () => {
  it('F-LB-01 shows a skeleton, then the collection', async () => {
    renderApp('/library', (b) => b.seed(3))

    expect(screen.getByRole('status', { name: 'Loading songs' })).toBeInTheDocument()

    expect(await screen.findByText('Song 01')).toBeInTheDocument()
    expect(screen.getByText('Song 03')).toBeInTheDocument()
    expect(screen.getByText('3 songs')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading songs' })).not.toBeInTheDocument()
  })

  it('F-LB-02 shows an empty state', async () => {
    renderApp('/library')

    expect(await screen.findByText('Your library is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument()
  })

  it('F-LB-03 shows an error with retry', async () => {
    const view = renderApp('/library', (b) => b.seed(1), [
      http.get('http://localhost:8000/api/v1/collection', () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'Boom' } }, { status: 500 }),
      ),
    ])
    const user = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')

    server.resetHandlers(...view.backend.handlers())
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Song 01')).toBeInTheDocument()
  })

  it('F-LB-04 searches with a debounced query', async () => {
    const view = renderApp('/library', (b) => {
      b.seed(3)
    })
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.type(screen.getByRole('searchbox', { name: 'Search library' }), 'Artist 2')

    await waitFor(() => expect(screen.queryByText('Song 01')).not.toBeInTheDocument())
    expect(await screen.findByText('Song 02')).toBeInTheDocument()
    const searches = view.backend.requests.filter((r) => r.includes('q='))
    expect(searches.length).toBe(1) // debounced: one request, not one per keystroke
    expect(searches[0]).toContain('q=Artist+2')
  })

  it('search with no hits explains itself', async () => {
    renderApp('/library', (b) => b.seed(2))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.type(screen.getByRole('searchbox'), 'zzz')

    expect(await screen.findByText('No songs match “zzz”')).toBeInTheDocument()
  })

  it('loads more pages', async () => {
    renderApp('/library', (b) => b.seed(60))
    const user = userEvent.setup()
    await screen.findByText('Song 01')
    expect(screen.queryByText('Song 60')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Song 60')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})

describe('Upload', () => {
  it('F-LB-05 uploading via the picker shows progress, results and refreshes the list', async () => {
    const view = renderApp('/library')
    view.backend.uploadDelayMs = 300
    const user = userEvent.setup()
    await screen.findByText('Your library is empty')

    await user.upload(screen.getByTestId('file-input'), audioFile('Fresh Track.mp3'))

    expect(await screen.findByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument()
    const results = await screen.findByRole('list', { name: 'Upload results' })
    expect(within(results).getByText('Fresh Track.mp3')).toBeInTheDocument()
    expect(within(results).getByText('Added')).toBeInTheDocument()
    expect(await screen.findByText('Uploaded 1 song')).toBeInTheDocument() // toast
    expect(await screen.findByRole('button', { name: 'Play Fresh Track' })).toBeInTheDocument()
  })

  it('F-LB-06 drag and drop uploads like the picker', async () => {
    const view = renderApp('/library')
    await screen.findByText('Your library is empty')
    const zone = screen.getByTestId('dropzone')

    const file = audioFile('Dropped.flac')
    const dataTransfer = { files: [file], types: ['Files'] }
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.dragOver(zone, { dataTransfer })
    expect(zone).toHaveAttribute('data-dragging')
    fireEvent.drop(zone, { dataTransfer })

    expect(await screen.findByText('Dropped.flac')).toBeInTheDocument()
    await waitFor(() => expect(view.backend.collection.size).toBe(1))
  })

  it('F-LB-07 a mixed batch reports each file', async () => {
    renderApp('/library')
    const user = userEvent.setup({ applyAccept: false })
    await screen.findByText('Your library is empty')

    await user.upload(screen.getByTestId('file-input'), [
      audioFile('good.mp3'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    ])

    const results = await screen.findByRole('list', { name: 'Upload results' })
    await waitFor(() => expect(within(results).getByText('good.mp3')).toBeInTheDocument())
    expect(within(results).getByText(/notes\.txt/)).toBeInTheDocument()
    expect(within(results).getByText(/Unsupported file type/)).toBeInTheDocument()
    expect(within(results).getByText('Added')).toBeInTheDocument() // good.mp3 really uploaded
  })

  it('F-LB-08 rejects a wrong type or oversize file without sending a request', async () => {
    const view = renderApp('/library')
    const user = userEvent.setup({ applyAccept: false })
    await screen.findByText('Your library is empty')
    const huge = audioFile('huge.mp3')
    Object.defineProperty(huge, 'size', { value: 101 * 1024 * 1024 })

    await user.upload(screen.getByTestId('file-input'), [
      new File(['x'], 'virus.exe'),
      huge,
    ])

    const results = await screen.findByRole('list', { name: 'Upload results' })
    expect(within(results).getByText(/Unsupported file type \(\.exe\)/)).toBeInTheDocument()
    expect(within(results).getByText(/larger than 100 MB/)).toBeInTheDocument()
    expect(view.backend.requests.some((r) => r.includes('upload'))).toBe(false)
  })
})

describe('Song actions', () => {
  it('F-LB-10 edits a song with validation', async () => {
    renderApp('/library', (b) => b.seed(1))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Actions for Song 01' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Edit details' }))

    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required')

    await user.type(title, 'Renamed Song')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Renamed Song')).toBeInTheDocument()
    expect(screen.queryByText('Song 01')).not.toBeInTheDocument()
  })

  it('F-LB-11 removing asks for confirmation, then removes', async () => {
    const view = renderApp('/library', (b) => b.seed(2))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Actions for Song 01' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from collection' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Remove “Song 01”?')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(view.backend.collection.size).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Actions for Song 01' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from collection' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('Song 01')).not.toBeInTheDocument())
    expect(view.backend.collection.size).toBe(1)
  })
})

describe('Playing from the library', () => {
  it('F-LB-12 play starts the visible list at that song', async () => {
    const view = renderApp('/library', (b) => b.seed(3))
    const user = userEvent.setup()
    await screen.findByText('Song 01')

    await user.click(screen.getByRole('button', { name: 'Play Song 02' }))

    const state = view.player.getState()
    expect(state.current?.title).toBe('Song 02')
    expect(state.queue.map((t) => t.title)).toEqual(['Song 01', 'Song 02', 'Song 03'])
    expect(view.engine.loaded).toBe('http://localhost:8000/api/v1/songs/song-2/stream')
    expect(screen.getByTestId('player-title')).toHaveTextContent('Song 02')
  })

  it('double-clicking a row plays it, and the playing row is marked', async () => {
    const view = renderApp('/library', (b) => b.seed(2))
    const user = userEvent.setup()
    const title = await screen.findByText('Song 02')

    await user.dblClick(title)

    expect(view.player.getState().current?.title).toBe('Song 02')
    const row = title.closest('tr')
    expect(row).toHaveAttribute('aria-current', 'true')
  })
})
