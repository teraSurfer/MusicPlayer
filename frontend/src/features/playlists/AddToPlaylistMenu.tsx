import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import type { Song } from '@/shared/api/schemas'
import { useAddSongsToPlaylist, usePlaylists } from './queries'

/** Menu entries for adding one song to a playlist; render inside a DropdownMenuContent. */
export function AddToPlaylistMenu({ song }: { song: Song }) {
  const playlists = usePlaylists()
  const add = useAddSongsToPlaylist()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Add to playlist</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {playlists.isPending && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
        {playlists.isSuccess && playlists.data.length === 0 && (
          <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
        )}
        {playlists.isSuccess &&
          playlists.data.map((playlist) => (
            <DropdownMenuItem
              key={playlist.id}
              onClick={() => add.mutate({ playlistId: playlist.id, songIds: [song.id] })}
            >
              {playlist.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
