import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.db.models import Playlist
from app.repositories.collection import CollectionRepository
from app.repositories.playlists import PlaylistRepository
from app.services.songs import SongService, SongView


@dataclass(frozen=True)
class PlaylistSummary:
    playlist: Playlist
    song_count: int
    total_duration_ms: int


@dataclass(frozen=True)
class PlaylistDetail:
    playlist: Playlist
    songs: list[SongView]


class PlaylistService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.playlists = PlaylistRepository(session)
        self.collection = CollectionRepository(session)
        self.songs = SongService(session)

    # --- playlists -------------------------------------------------------

    def create(self, owner_id: uuid.UUID, name: str, description: str | None) -> Playlist:
        clean = name.strip()
        self._ensure_name_free(owner_id, clean, exclude=None)
        playlist = Playlist(
            owner_id=owner_id, name=clean, name_key=clean.casefold(), description=description
        )
        self.playlists.add(playlist)
        self._commit_unique(owner_id)
        return playlist

    def update(
        self, playlist_id: uuid.UUID, owner_id: uuid.UUID, changes: dict[str, str | None]
    ) -> Playlist:
        playlist = self._require(playlist_id, owner_id)
        if "name" in changes and changes["name"] is not None:
            clean = changes["name"].strip()
            self._ensure_name_free(owner_id, clean, exclude=playlist.id)
            playlist.name = clean
            playlist.name_key = clean.casefold()
        if "description" in changes:
            playlist.description = changes["description"]
        self._commit_unique(owner_id)
        return playlist

    def delete(self, playlist_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        self.playlists.delete(self._require(playlist_id, owner_id))
        self.session.commit()

    def list_summaries(self, owner_id: uuid.UUID) -> list[PlaylistSummary]:
        return [
            PlaylistSummary(p, count, duration)
            for p, count, duration in self.playlists.list_summaries(owner_id)
        ]

    def detail(self, playlist_id: uuid.UUID, owner_id: uuid.UUID) -> PlaylistDetail:
        playlist = self._require(playlist_id, owner_id)
        return PlaylistDetail(
            playlist, [SongView(s, True) for s in self.playlists.songs(playlist.id)]
        )

    # --- playlist contents -----------------------------------------------

    def add_songs(
        self, playlist_id: uuid.UUID, owner_id: uuid.UUID, song_ids: Sequence[uuid.UUID]
    ) -> tuple[list[uuid.UUID], list[uuid.UUID]]:
        """Append songs. Returns ``(added, skipped)``; nothing changes on any error."""
        playlist = self._require(playlist_id, owner_id)
        wanted = list(dict.fromkeys(song_ids))
        self.songs.require_many(wanted)

        in_collection = self.collection.song_ids_in_collection(owner_id, wanted)
        outside = [i for i in wanted if i not in in_collection]
        if outside:
            raise ConflictError(
                "Songs must be in your collection before they can join a playlist",
                code="song_not_in_collection",
                details={"song_ids": [str(i) for i in outside]},
            )

        present = set(self.playlists.song_ids(playlist.id))
        added = [i for i in wanted if i not in present]
        skipped = [i for i in wanted if i in present]
        self.playlists.append(playlist.id, added)
        self._touch(playlist)
        self.session.commit()
        return added, skipped

    def remove_song(self, playlist_id: uuid.UUID, owner_id: uuid.UUID, song_id: uuid.UUID) -> None:
        playlist = self._require(playlist_id, owner_id)
        if not self.playlists.remove(playlist.id, song_id):
            raise NotFoundError("Song is not in this playlist", code="not_in_playlist")
        self._touch(playlist)
        self.session.commit()

    def reorder(
        self, playlist_id: uuid.UUID, owner_id: uuid.UUID, song_ids: Sequence[uuid.UUID]
    ) -> None:
        playlist = self._require(playlist_id, owner_id)
        current = self.playlists.song_ids(playlist.id)
        if len(song_ids) != len(current) or set(song_ids) != set(current):
            raise UnprocessableError(
                "The order must list every song in the playlist exactly once",
                code="invalid_order",
            )
        self.playlists.rewrite_order(playlist.id, list(song_ids))
        self._touch(playlist)
        self.session.commit()

    # --- helpers ---------------------------------------------------------

    def _require(self, playlist_id: uuid.UUID, owner_id: uuid.UUID) -> Playlist:
        playlist = self.playlists.get(playlist_id, owner_id)
        if playlist is None:
            raise NotFoundError("Playlist not found", code="playlist_not_found")
        return playlist

    def _ensure_name_free(self, owner_id: uuid.UUID, name: str, exclude: uuid.UUID | None) -> None:
        if self.playlists.name_taken(owner_id, name.casefold(), exclude):
            raise ConflictError(
                f"A playlist named '{name}' already exists", code="playlist_name_taken"
            )

    def _commit_unique(self, owner_id: uuid.UUID) -> None:
        try:
            self.session.commit()
        except IntegrityError as exc:  # lost a race with a same-named create
            self.session.rollback()
            raise ConflictError(
                "A playlist with this name already exists", code="playlist_name_taken"
            ) from exc

    @staticmethod
    def _touch(playlist: Playlist) -> None:
        from datetime import UTC, datetime

        playlist.updated_at = datetime.now(UTC)
