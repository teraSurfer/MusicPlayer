import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, delete, func, select
from sqlalchemy.orm import Session

from app.db.models import CollectionItem, Song
from app.repositories.songs import SONG_SORTS, order_by, search_filter

COLLECTION_SORTS: dict[str, Any] = {**SONG_SORTS, "added_at": CollectionItem.added_at}


class CollectionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(
        self, *, owner_id: uuid.UUID, q: str | None, sort: str, limit: int, offset: int
    ) -> tuple[list[tuple[Song, datetime]], int]:
        filters: list[ColumnElement[bool]] = [CollectionItem.owner_id == owner_id]
        if q and q.strip():
            filters.append(search_filter(q))
        base = select(Song, CollectionItem.added_at).join(
            CollectionItem, CollectionItem.song_id == Song.id
        )
        total = (
            self.session.scalar(
                select(func.count())
                .select_from(Song)
                .join(CollectionItem, CollectionItem.song_id == Song.id)
                .where(*filters)
            )
            or 0
        )
        rows = self.session.execute(
            base.where(*filters)
            .order_by(*order_by(COLLECTION_SORTS, sort, "added_at"))
            .limit(limit)
            .offset(offset)
        ).all()
        return [(song, added_at) for song, added_at in rows], total

    def song_ids_in_collection(
        self, owner_id: uuid.UUID, song_ids: Sequence[uuid.UUID]
    ) -> set[uuid.UUID]:
        if not song_ids:
            return set()
        return set(
            self.session.scalars(
                select(CollectionItem.song_id).where(
                    CollectionItem.owner_id == owner_id, CollectionItem.song_id.in_(song_ids)
                )
            )
        )

    def contains(self, owner_id: uuid.UUID, song_id: uuid.UUID) -> bool:
        return song_id in self.song_ids_in_collection(owner_id, [song_id])

    def add(self, owner_id: uuid.UUID, song_ids: Sequence[uuid.UUID]) -> None:
        for song_id in song_ids:
            self.session.add(CollectionItem(owner_id=owner_id, song_id=song_id))
        self.session.flush()

    def remove(self, owner_id: uuid.UUID, song_id: uuid.UUID) -> bool:
        result = self.session.execute(
            delete(CollectionItem).where(
                CollectionItem.owner_id == owner_id, CollectionItem.song_id == song_id
            )
        )
        return bool(getattr(result, "rowcount", 0))
