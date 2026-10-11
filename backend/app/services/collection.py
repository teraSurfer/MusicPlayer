import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.repositories.collection import CollectionRepository
from app.repositories.playlists import PlaylistRepository
from app.services.songs import Listing, SongService, SongView


@dataclass(frozen=True)
class AddResult:
    added: list[uuid.UUID]
    already_in_collection: list[uuid.UUID]


class CollectionService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = CollectionRepository(session)
        self.songs = SongService(session)
        self.playlists = PlaylistRepository(session)

    def list(
        self, *, owner_id: uuid.UUID, q: str | None, sort: str, limit: int, offset: int
    ) -> Listing:
        rows, total = self.repo.list(owner_id=owner_id, q=q, sort=sort, limit=limit, offset=offset)
        return Listing([SongView(song, True, added_at) for song, added_at in rows], total)

    def add(self, owner_id: uuid.UUID, song_ids: Sequence[uuid.UUID]) -> AddResult:
        unique_ids = list(dict.fromkeys(song_ids))
        self.songs.require_many(unique_ids)  # all-or-nothing
        present = self.repo.song_ids_in_collection(owner_id, unique_ids)
        to_add = [i for i in unique_ids if i not in present]
        self.repo.add(owner_id, to_add)
        self.session.commit()
        return AddResult(
            added=to_add, already_in_collection=[i for i in unique_ids if i in present]
        )

    def remove(self, owner_id: uuid.UUID, song_id: uuid.UUID) -> None:
        if not self.repo.remove(owner_id, song_id):
            raise NotFoundError("Song is not in the collection", code="not_in_collection")
        # A playlist may only hold collection songs, so removal cascades to this user's playlists.
        self.playlists.remove_song_from_owner_playlists(owner_id, song_id)
        self.session.commit()
