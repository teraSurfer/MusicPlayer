import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'

describe('Pool', () => {
  it('F-LB-09 shows Add or In collection per song', async () => {
    renderApp('/pool', (b) => {
      const [first] = b.seed(1, true)
      void first
      b.song({ title: 'Outsider' })
    })

    expect(await screen.findByText('Outsider')).toBeInTheDocument()
    expect(screen.getByText('In collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Outsider to collection' })).toBeInTheDocument()
  })

  it('F-LB-09 adding updates immediately and persists', async () => {
    const view = renderApp('/pool', (b) => b.song({ title: 'Outsider' }))
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add Outsider to collection' }))

    expect(await screen.findByText('In collection')).toBeInTheDocument()
    await waitFor(() => expect(view.backend.collection.size).toBe(1))
    expect(await screen.findByText('Added to your collection')).toBeInTheDocument()
  })

  it('F-LB-09 rolls back when the add fails', async () => {
    const view = renderApp('/pool', (b) => b.song({ title: 'Outsider' }))
    view.backend.failNextCollectionAdd = true
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add Outsider to collection' }))

    expect(await screen.findByText(/Could not add to collection/)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Outsider to collection' }),
      ).toBeInTheDocument(),
    )
    expect(view.backend.collection.size).toBe(0)
  })

  it('adds several selected songs at once', async () => {
    const view = renderApp('/pool', (b) => {
      b.song({ title: 'One' })
      b.song({ title: 'Two' })
      b.song({ title: 'Three' })
    })
    const user = userEvent.setup()
    await screen.findByText('One')

    await user.click(screen.getByRole('checkbox', { name: 'Select One' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Three' }))
    await user.click(screen.getByRole('button', { name: 'Add selected (2)' }))

    await waitFor(() => expect(view.backend.collection.size).toBe(2))
    expect(await screen.findByText('Added 2 songs to your collection')).toBeInTheDocument()
    const posts = view.backend.requests.filter((r) => r === 'POST /api/v1/collection')
    expect(posts).toHaveLength(1)
  })

  it('select all only selects songs not yet in the collection', async () => {
    renderApp('/pool', (b) => {
      b.seed(1, true)
      b.song({ title: 'Free A' })
      b.song({ title: 'Free B' })
    })
    const user = userEvent.setup()
    await screen.findByText('Free A')

    await user.click(screen.getByRole('checkbox', { name: 'Select all songs' }))

    expect(screen.getByRole('button', { name: 'Add selected (2)' })).toBeEnabled()
  })

  it('searches the pool', async () => {
    renderApp('/pool', (b) => {
      b.song({ title: 'Alpha' })
      b.song({ title: 'Beta' })
    })
    const user = userEvent.setup()
    await screen.findByText('Alpha')

    await user.type(screen.getByRole('searchbox', { name: 'Search pool' }), 'bet')

    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
    expect(await screen.findByText('Beta')).toBeInTheDocument()
  })

  it('shows an error state with retry', async () => {
    renderApp('/pool', undefined, [
      http.get('http://localhost:8000/api/v1/songs', () =>
        HttpResponse.json({ error: { code: 'internal_error', message: 'Pool broke' } }, { status: 500 }),
      ),
    ])

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Pool broke')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
