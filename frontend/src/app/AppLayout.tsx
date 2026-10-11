import { Library, ListMusic, Music } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { PlayerBar } from '@/features/player/PlayerBar'

const links = [
  { to: '/library', label: 'Library', icon: Library },
  { to: '/pool', label: 'Pool', icon: Music },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
]

export function AppLayout() {
  return (
    <div className="grid h-screen grid-rows-[1fr_auto] md:grid-cols-[14rem_1fr]">
      <nav
        aria-label="Main"
        className="flex gap-1 border-b p-3 md:row-span-1 md:flex-col md:border-r md:border-b-0"
      >
        <p className="hidden px-3 py-2 text-lg font-semibold md:block">Music Player</p>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                isActive ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'
              }`
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="overflow-y-auto">
        <Outlet />
      </main>
      <div className="md:col-span-2">
        <PlayerBar />
      </div>
    </div>
  )
}
