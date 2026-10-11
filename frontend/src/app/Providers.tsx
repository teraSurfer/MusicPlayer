import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlayerProvider } from '@/features/player/PlayerProvider'
import type { PlayerStore } from '@/features/player/store'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
    },
  })
}

export function Providers({
  children,
  queryClient,
  playerStore,
}: {
  children: ReactNode
  queryClient?: QueryClient
  playerStore?: PlayerStore
}) {
  const [client] = useState(() => queryClient ?? createQueryClient())
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <PlayerProvider store={playerStore}>
          {children}
          <Toaster position="top-right" />
        </PlayerProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
