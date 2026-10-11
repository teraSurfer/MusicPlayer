import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, exists, func, select
from sqlalchemy.orm import Session

from app.db.models import CollectionItem, Song

SONG_SORTS: dict[str, Any] = {
    "title": func.lower(Song.title),
    "artist": func.lower(func.coalesce(Song.artist, "")),
    "album": func.lower(func.coalesce(Song.album, "")),
    "duration": Song.duration_ms,
    "created_at": Song.created_at,
}


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_filter(q: str) -> ColumnElement[bool]:
    pattern = f"%{escape_like(q.strip().lower())}%"
    return (
        func.lower(Song.title).like(pattern, escape="\\")
        | func.lower(func.coalesce(Song.artist, "")).like(pattern, escape="\\")
        | func.lower(func.coalesce(Song.album, "")).like(pattern, escape="\\")
    )


def order_by(sorts: dict[str, Any], sort: str, default: str) -> list[Any]:
    descending = sort.startswith("-")
    column = sorts[sort.lstrip("-")] if sort.lstrip("-") in sorts else sorts[default.lstrip("-")]
    return [column.desc() if descending else column.asc(), Song.id.asc()]


class SongRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, song: Song) -> Song:
        self.session.add(song)
        self.session.flush()
        return song

    def get(self, song_id: uuid.UUID) -> Song | None:
        return self.session.get(Song, song_id)

    def get_many(self, song_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Song]:
        if not song_ids:
            return {}
        rows = self.session.scalars(select(Song).where(Song.id.in_(song_ids))).all()
        return {song.id: song for song in rows}

    def get_by_sha256(self, sha256: str) -> Song | None:
        return self.session.scalar(select(Song).where(Song.sha256 == sha256))

    def list_pool(
        self,
        *,
        owner_id: uuid.UUID,
        q: str | None,
        uploaded_by: uuid.UUID | None,
        sort: str,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[Song, bool]], int]:
        in_collection = exists().where(
            CollectionItem.song_id == Song.id, CollectionItem.owner_id == owner_id
        )
        filters: list[ColumnElement[bool]] = []
        if q and q.strip():
            filters.append(search_filter(q))
        if uploaded_by is not None:
            filters.append(Song.uploaded_by == uploaded_by)

        query = select(Song, in_collection).where(*filters)
        total = self.session.scalar(select(func.count()).select_from(Song).where(*filters)) or 0
        rows = self.session.execute(
            query.order_by(*order_by(SONG_SORTS, sort, "created_at")).limit(limit).offset(offset)
        ).all()
        return [(song, bool(flag)) for song, flag in rows], total
