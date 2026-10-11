import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { RequestHandler } from 'msw'
import { MemoryRouter } from 'react-router'
import { App } from '@/app/App'
import { Providers } from '@/app/Providers'
import { createPlayerStore, type PlayerStore } from '@/features/player/store'
import { FakeBackend } from './fakeBackend'
import { FakeEngine, MemoryStorage } from './fakeEngine'
import { server } from './server'

export interface Harness {
  backend: FakeBackend
  engine: FakeEngine
  player: PlayerStore
  queryClient: QueryClient
}

export function renderApp(
  route = '/library',
  setup?: (backend: FakeBackend) => void,
  overrides: RequestHandler[] = [],
) {
  const backend = new FakeBackend()
  setup?.(backend)
  server.use(...backend.handlers())
  if (overrides.length > 0) server.use(...overrides)

  const engine = new FakeEngine()
  const player = createPlayerStore({ engine, storage: new MemoryStorage() })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })

  const view = render(
    <MemoryRouter initialEntries={[route]}>
      <Providers queryClient={queryClient} playerStore={player}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
  const harness: Harness = { backend, engine, player, queryClient }
  return { ...view, ...harness }
}
