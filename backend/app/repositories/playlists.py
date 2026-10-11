import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.db.models import Playlist, PlaylistSong, Song


class PlaylistRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, playlist: Playlist) -> Playlist:
        self.session.add(playlist)
        self.session.flush()
        return playlist

    def get(self, playlist_id: uuid.UUID, owner_id: uuid.UUID) -> Playlist | None:
        return self.session.scalar(
            select(Playlist).where(Playlist.id == playlist_id, Playlist.owner_id == owner_id)
        )

    def delete(self, playlist: Playlist) -> None:
        self.session.execute(delete(PlaylistSong).where(PlaylistSong.playlist_id == playlist.id))
        self.session.delete(playlist)
        self.session.flush()

    def name_taken(self, owner_id: uuid.UUID, name_key: str, exclude: uuid.UUID | None) -> bool:
        query = select(Playlist.id).where(
            Playlist.owner_id == owner_id, Playlist.name_key == name_key
        )
        if exclude is not None:
            query = query.where(Playlist.id != exclude)
        return self.session.scalar(query) is not None

    def list_summaries(self, owner_id: uuid.UUID) -> list[tuple[Playlist, int, int]]:
        rows = self.session.execute(
            select(
                Playlist,
                func.count(PlaylistSong.song_id),
                func.coalesce(func.sum(Song.duration_ms), 0),
            )
            .outerjoin(PlaylistSong, PlaylistSong.playlist_id == Playlist.id)
            .outerjoin(Song, Song.id == PlaylistSong.song_id)
            .where(Playlist.owner_id == owner_id)
            .group_by(Playlist.id)
            .order_by(Playlist.name_key, Playlist.id)
        ).all()
        return [(p, int(count), int(duration)) for p, count, duration in rows]

    def songs(self, playlist_id: uuid.UUID) -> list[Song]:
        return list(
            self.session.scalars(
                select(Song)
                .join(PlaylistSong, PlaylistSong.song_id == Song.id)
                .where(PlaylistSong.playlist_id == playlist_id)
                .order_by(PlaylistSong.position)
            )
        )

    def song_ids(self, playlist_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self.session.scalars(
                select(PlaylistSong.song_id)
                .where(PlaylistSong.playlist_id == playlist_id)
                .order_by(PlaylistSong.position)
            )
        )

    def append(self, playlist_id: uuid.UUID, song_ids: Sequence[uuid.UUID]) -> None:
        next_position = (
            self.session.scalar(
                select(func.max(PlaylistSong.position)).where(
                    PlaylistSong.playlist_id == playlist_id
                )
            )
            if song_ids
            else None
        )
        position = 0 if next_position is None else next_position + 1
        for song_id in song_ids:
            self.session.add(
                PlaylistSong(playlist_id=playlist_id, song_id=song_id, position=position)
            )
            position += 1
        self.session.flush()

    def remove(self, playlist_id: uuid.UUID, song_id: uuid.UUID) -> bool:
        result = self.session.execute(
            delete(PlaylistSong).where(
                PlaylistSong.playlist_id == playlist_id, PlaylistSong.song_id == song_id
            )
        )
        if not getattr(result, "rowcount", 0):
            return False
        self.session.expire_all()
        self.rewrite_order(playlist_id, self.song_ids(playlist_id))
        return True

    def remove_song_from_owner_playlists(self, owner_id: uuid.UUID, song_id: uuid.UUID) -> None:
        affected = list(
            self.session.scalars(
                select(PlaylistSong.playlist_id)
                .join(Playlist, Playlist.id == PlaylistSong.playlist_id)
                .where(Playlist.owner_id == owner_id, PlaylistSong.song_id == song_id)
            )
        )
        for playlist_id in affected:
            self.remove(playlist_id, song_id)

    def rewrite_order(self, playlist_id: uuid.UUID, ordered_song_ids: Sequence[uuid.UUID]) -> None:
        """Give the playlist's songs positions 0..n-1 in the given order.

        Positions are first moved into the negative range so the
        ``UNIQUE(playlist_id, position)`` constraint is never violated mid-update.
        """
        self.session.execute(
            update(PlaylistSong)
            .where(PlaylistSong.playlist_id == playlist_id)
            .values(position=-PlaylistSong.position - 1)
        )
        for index, song_id in enumerate(ordered_song_ids):
            self.session.execute(
                update(PlaylistSong)
                .where(PlaylistSong.playlist_id == playlist_id, PlaylistSong.song_id == song_id)
                .values(position=index)
            )
        self.session.flush()
        self.session.expire_all()
