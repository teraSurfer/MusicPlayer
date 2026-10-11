import uuid
from datetime import datetime

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import CollectionItem, Song


def make_song(**overrides: object) -> Song:
    fields: dict[str, object] = {
        "title": "Test Song",
        "duration_ms": 1000,
        "format": "mp3",
        "mime_type": "audio/mpeg",
        "size_bytes": 1234,
        "sha256": uuid.uuid4().hex * 2,
        "storage_key": f"ab/{uuid.uuid4()}.mp3",
    }
    fields.update(overrides)
    return Song(**fields)


class TestSong:
    def test_defaults_are_generated(self, session: Session) -> None:
        song = make_song()
        session.add(song)
        session.commit()

        assert isinstance(song.id, uuid.UUID)
        assert isinstance(song.created_at, datetime)
        assert song.artist is None
        assert song.album is None
        assert song.cover_key is None
        assert song.uploaded_by is None

    def test_uploaded_by_is_stored(self, session: Session) -> None:
        uploader = uuid.uuid4()
        song = make_song(uploaded_by=uploader)
        session.add(song)
        session.commit()
        session.expire_all()

        assert session.get(Song, song.id).uploaded_by == uploader  # type: ignore[union-attr]

    def test_sha256_must_be_unique(self, session: Session) -> None:
        session.add(make_song(sha256="a" * 64))
        session.commit()

        session.add(make_song(sha256="a" * 64))
        with pytest.raises(IntegrityError):
            session.commit()

    @pytest.mark.parametrize("column", ["title", "duration_ms", "format", "storage_key", "sha256"])
    def test_required_columns_are_not_null(self, session: Session, column: str) -> None:
        session.add(make_song(**{column: None}))
        with pytest.raises(IntegrityError):
            session.commit()


class TestCollectionItem:
    def test_links_to_song(self, session: Session) -> None:
        song = make_song()
        session.add(song)
        session.flush()

        item = CollectionItem(song_id=song.id)
        session.add(item)
        session.commit()

        assert isinstance(item.added_at, datetime)
        assert item.owner_id is None
        assert item.song.id == song.id

    def test_foreign_key_is_enforced(self, session: Session) -> None:
        session.add(CollectionItem(song_id=uuid.uuid4()))
        with pytest.raises(IntegrityError):
            session.commit()

    def test_song_cannot_be_added_twice_for_the_same_owner(self, session: Session) -> None:
        song = make_song()
        owner = uuid.uuid4()
        session.add(song)
        session.flush()
        session.add(CollectionItem(song_id=song.id, owner_id=owner))
        session.commit()

        session.add(CollectionItem(song_id=song.id, owner_id=owner))
        with pytest.raises(IntegrityError):
            session.commit()

    def test_song_cannot_be_added_twice_when_owner_is_null(self, session: Session) -> None:
        # A plain UNIQUE(owner_id, song_id) does not catch this: NULLs compare as distinct.
        song = make_song()
        session.add(song)
        session.flush()
        session.add(CollectionItem(song_id=song.id))
        session.commit()

        session.add(CollectionItem(song_id=song.id))
        with pytest.raises(IntegrityError):
            session.commit()

    def test_different_owners_can_each_add_the_same_song(self, session: Session) -> None:
        song = make_song()
        session.add(song)
        session.flush()
        session.add_all(
            [
                CollectionItem(song_id=song.id, owner_id=uuid.uuid4()),
                CollectionItem(song_id=song.id, owner_id=uuid.uuid4()),
            ]
        )
        session.commit()

        assert len(session.scalars(select(CollectionItem)).all()) == 2


def test_sqlite_foreign_keys_pragma_is_on(session: Session) -> None:
    assert session.connection().exec_driver_sql("PRAGMA foreign_keys").scalar() == 1


def test_expected_tables_exist(session: Session) -> None:
    tables = set(inspect(session.connection()).get_table_names())
    assert {"songs", "collection_items", "playlists", "playlist_songs"} <= tables
