import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Song(Base):
    """A file in the shared pool."""

    __tablename__ = "songs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str | None] = mapped_column(String)
    album: Mapped[str | None] = mapped_column(String)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    format: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    cover_key: Mapped[str | None] = mapped_column(String)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # reserved FK to users
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )


class CollectionItem(Base):
    """A pool song that a user has added to their collection."""

    __tablename__ = "collection_items"
    __table_args__ = (
        UniqueConstraint("owner_id", "song_id", name="uq_collection_items_owner_song"),
        # NULLs compare as distinct in a UNIQUE constraint, so without this index a
        # single-user collection (owner_id IS NULL) could hold the same song twice.
        Index(
            "uq_collection_items_unowned_song",
            "song_id",
            unique=True,
            sqlite_where=text("owner_id IS NULL"),
            postgresql_where=text("owner_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # reserved for multi-user
    song_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("songs.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    song: Mapped[Song] = relationship()


class Playlist(Base):
    __tablename__ = "playlists"
    __table_args__ = (
        UniqueConstraint("owner_id", "name_key", name="uq_playlists_owner_name_key"),
        # Same NULL-owner gap as collection_items: enforce uniqueness for unowned rows too.
        Index(
            "uq_playlists_unowned_name_key",
            "name_key",
            unique=True,
            sqlite_where=text("owner_id IS NULL"),
            postgresql_where=text("owner_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # reserved for multi-user
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Case-folded copy of ``name``; the unique key, so "Chill" and "chill" collide on any DB.
    name_key: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )


class PlaylistSong(Base):
    __tablename__ = "playlist_songs"
    __table_args__ = (
        UniqueConstraint("playlist_id", "position", name="uq_playlist_songs_playlist_position"),
    )

    playlist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("songs.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    song: Mapped[Song] = relationship()
