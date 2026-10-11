"""B-PS-09: random add/remove/reorder sequences never break position invariants."""

import uuid
from typing import Any

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.core.errors import AppError
from app.db.base import Base
from app.db.models import CollectionItem, PlaylistSong, Song
from app.db.session import create_db_engine, create_session_factory
from app.services.playlists import PlaylistService

OWNER = uuid.UUID(int=1)

operations = st.lists(
    st.tuples(
        st.sampled_from(["add", "remove", "reorder"]),
        st.lists(st.integers(min_value=0, max_value=7), max_size=8),
        st.randoms(use_true_random=False),
    ),
    max_size=25,
)


@settings(
    max_examples=60,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(ops=operations)
def test_positions_stay_unique_and_contiguous(ops: list[Any]) -> None:
    import app.db.models  # noqa: F401

    engine = create_db_engine("sqlite://")
    Base.metadata.create_all(engine)
    try:
        with create_session_factory(engine)() as session:
            song_ids = []
            for i in range(8):
                song = Song(
                    title=f"s{i}",
                    duration_ms=1,
                    format="wav",
                    mime_type="audio/wav",
                    size_bytes=1,
                    sha256=f"{i:064d}",
                    storage_key=f"k{i}",
                )
                session.add(song)
                session.flush()
                session.add(CollectionItem(owner_id=OWNER, song_id=song.id))
                song_ids.append(song.id)
            session.commit()

            service = PlaylistService(session)
            playlist = service.create(OWNER, "P", None)
            model: list[uuid.UUID] = []

            for kind, picks, rnd in ops:
                chosen = [song_ids[i] for i in picks]
                try:
                    if kind == "add" and chosen:
                        added, _ = service.add_songs(playlist.id, OWNER, chosen)
                        model.extend(added)
                    elif kind == "remove" and chosen:
                        service.remove_song(playlist.id, OWNER, chosen[0])
                        model.remove(chosen[0])
                    elif kind == "reorder":
                        shuffled = list(model)
                        rnd.shuffle(shuffled)
                        service.reorder(playlist.id, OWNER, shuffled)
                        model = shuffled
                except AppError:
                    pass  # e.g. removing a song that is not in the playlist

                rows = session.scalars(
                    select(PlaylistSong)
                    .where(PlaylistSong.playlist_id == playlist.id)
                    .order_by(PlaylistSong.position)
                ).all()
                assert [r.position for r in rows] == list(range(len(rows)))
                assert [r.song_id for r in rows] == model
                assert len({r.song_id for r in rows}) == len(rows)
    finally:
        engine.dispose()
