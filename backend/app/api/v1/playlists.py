import uuid

from fastapi import APIRouter, Response

from app.api.deps import CurrentUserId, PlaylistServiceDep, StorageDep
from app.api.mappers import to_playlist_detail, to_playlist_summary
from app.schemas.playlists import (
    AddSongsResult,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistSummary,
    PlaylistUpdate,
)
from app.schemas.songs import SongIds

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.get("", response_model=list[PlaylistSummary])
def list_playlists(service: PlaylistServiceDep, user_id: CurrentUserId) -> list[PlaylistSummary]:
    return [to_playlist_summary(s) for s in service.list_summaries(user_id)]


@router.post("", response_model=PlaylistDetail, status_code=201)
def create_playlist(
    body: PlaylistCreate, service: PlaylistServiceDep, storage: StorageDep, user_id: CurrentUserId
) -> PlaylistDetail:
    playlist = service.create(user_id, body.name, body.description)
    return to_playlist_detail(service.detail(playlist.id, user_id), storage)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
def get_playlist(
    playlist_id: uuid.UUID, service: PlaylistServiceDep, storage: StorageDep, user_id: CurrentUserId
) -> PlaylistDetail:
    return to_playlist_detail(service.detail(playlist_id, user_id), storage)


@router.patch("/{playlist_id}", response_model=PlaylistDetail)
def update_playlist(
    playlist_id: uuid.UUID,
    body: PlaylistUpdate,
    service: PlaylistServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
) -> PlaylistDetail:
    service.update(playlist_id, user_id, body.model_dump(exclude_unset=True))
    return to_playlist_detail(service.detail(playlist_id, user_id), storage)


@router.delete("/{playlist_id}", status_code=204)
def delete_playlist(
    playlist_id: uuid.UUID, service: PlaylistServiceDep, user_id: CurrentUserId
) -> Response:
    service.delete(playlist_id, user_id)
    return Response(status_code=204)


@router.post("/{playlist_id}/songs", response_model=AddSongsResult)
def add_songs(
    playlist_id: uuid.UUID,
    body: SongIds,
    service: PlaylistServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
) -> AddSongsResult:
    added, skipped = service.add_songs(playlist_id, user_id, body.song_ids)
    return AddSongsResult(
        added=added,
        skipped=skipped,
        playlist=to_playlist_detail(service.detail(playlist_id, user_id), storage),
    )


@router.put("/{playlist_id}/songs/order", response_model=PlaylistDetail)
def reorder_songs(
    playlist_id: uuid.UUID,
    body: SongIds,
    service: PlaylistServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
) -> PlaylistDetail:
    service.reorder(playlist_id, user_id, body.song_ids)
    return to_playlist_detail(service.detail(playlist_id, user_id), storage)


@router.delete("/{playlist_id}/songs/{song_id}", status_code=204)
def remove_song(
    playlist_id: uuid.UUID, song_id: uuid.UUID, service: PlaylistServiceDep, user_id: CurrentUserId
) -> Response:
    service.remove_song(playlist_id, user_id, song_id)
    return Response(status_code=204)
