import { Navigate, Route, Routes } from 'react-router'
import { LibraryPage } from '@/features/library/LibraryPage'
import { PoolPage } from '@/features/library/PoolPage'
import { PlaylistDetailPage } from '@/features/playlists/PlaylistDetailPage'
import { PlaylistsPage } from '@/features/playlists/PlaylistsPage'
import { AppLayout } from './AppLayout'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="pool" element={<PoolPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  )
}
