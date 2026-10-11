import uuid

from fastapi import APIRouter, Response

from app.api.deps import (
    CollectionServiceDep,
    CurrentUserId,
    Limit,
    Offset,
    StorageDep,
)
from app.api.mappers import to_song_read
from app.schemas.common import Page
from app.schemas.songs import CollectionAddResult, SongIds, SongRead

router = APIRouter(prefix="/collection", tags=["collection"])


@router.get("", response_model=Page[SongRead])
def list_collection(
    service: CollectionServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
    q: str | None = None,
    sort: str = "-added_at",
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[SongRead]:
    listing = service.list(owner_id=user_id, q=q, sort=sort, limit=limit, offset=offset)
    return Page(
        items=[to_song_read(v, storage) for v in listing.items],
        total=listing.total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=CollectionAddResult)
def add_to_collection(
    body: SongIds, service: CollectionServiceDep, user_id: CurrentUserId
) -> CollectionAddResult:
    result = service.add(user_id, body.song_ids)
    return CollectionAddResult(
        added=result.added, already_in_collection=result.already_in_collection
    )


@router.delete("/{song_id}", status_code=204)
def remove_from_collection(
    song_id: uuid.UUID, service: CollectionServiceDep, user_id: CurrentUserId
) -> Response:
    service.remove(user_id, song_id)
    return Response(status_code=204)
