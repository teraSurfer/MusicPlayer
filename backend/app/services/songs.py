import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.models import Song
from app.repositories.collection import CollectionRepository
from app.repositories.songs import SongRepository


@dataclass(frozen=True)
class SongView:
    song: Song
    in_collection: bool
    added_at: datetime | None = None


@dataclass(frozen=True)
class Listing:
    items: list[SongView]
    total: int


class SongService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.songs = SongRepository(session)
        self.collection = CollectionRepository(session)

    def list_pool(
        self,
        *,
        owner_id: uuid.UUID,
        q: str | None,
        uploaded_by: uuid.UUID | None,
        sort: str,
        limit: int,
        offset: int,
    ) -> Listing:
        rows, total = self.songs.list_pool(
            owner_id=owner_id,
            q=q,
            uploaded_by=uploaded_by,
            sort=sort,
            limit=limit,
            offset=offset,
        )
        return Listing([SongView(song, flag) for song, flag in rows], total)

    def get(self, song_id: uuid.UUID, owner_id: uuid.UUID) -> SongView:
        song = self.require(song_id)
        return SongView(song, self.collection.contains(owner_id, song_id))

    def require(self, song_id: uuid.UUID) -> Song:
        song = self.songs.get(song_id)
        if song is None:
            raise NotFoundError("Song not found", code="song_not_found")
        return song

    def update(
        self,
        song_id: uuid.UUID,
        owner_id: uuid.UUID,
        changes: dict[str, str | None],
    ) -> SongView:
        song = self.require(song_id)
        for field, value in changes.items():
            setattr(song, field, value)
        self.session.commit()
        return SongView(song, self.collection.contains(owner_id, song_id))

    def require_many(self, song_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Song]:
        found = self.songs.get_many(song_ids)
        missing = [str(i) for i in dict.fromkeys(song_ids) if i not in found]
        if missing:
            raise NotFoundError(
                "Some songs do not exist", code="song_not_found", details={"song_ids": missing}
            )
        return found
