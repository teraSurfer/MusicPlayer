import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Header, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from app.api.deps import (
    CurrentUserId,
    Limit,
    Offset,
    SongServiceDep,
    StorageDep,
    UploadServiceDep,
)
from app.api.mappers import to_song_read
from app.api.ranges import parse_range
from app.core.errors import NotFoundError, RangeNotSatisfiableError, error_body
from app.schemas.common import Page
from app.schemas.songs import SongRead, SongUpdate, UploadResponse, UploadResult
from app.services.songs import SongView
from app.services.upload import UploadOutcome

logger = logging.getLogger("app.stream")

router = APIRouter(prefix="/songs", tags=["songs"])

_REJECTION_STATUS = {"unsupported_type": 415, "invalid_audio": 415, "file_too_large": 413}


@router.post("/upload", response_model=UploadResponse, status_code=201)
def upload_songs(
    files: Annotated[list[UploadFile], File()],
    service: UploadServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
) -> Response:
    outcomes: list[UploadOutcome] = [
        service.upload(item.file, item.filename or "unnamed", user_id) for item in files
    ]
    results = [
        UploadResult(
            filename=o.filename,
            status=o.status,
            reason=o.reason,
            message=o.message,
            song=to_song_read(SongView(o.song, True), storage) if o.song else None,
        )
        for o in outcomes
    ]
    payload = UploadResponse(results=results).model_dump(mode="json")

    rejections = {o.reason for o in outcomes if o.status == "rejected"}
    if all(o.status == "rejected" for o in outcomes) and len(rejections) == 1:
        reason = next(iter(rejections))
        status = _REJECTION_STATUS[str(reason)]
        body = error_body(str(reason), outcomes[0].message or "Upload rejected", payload)
        return JSONResponse(body, status_code=status)

    created = any(o.status == "created" for o in outcomes)
    return JSONResponse(payload, status_code=201 if created else 200)


@router.get("", response_model=Page[SongRead])
def list_songs(
    service: SongServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
    q: str | None = None,
    uploaded_by: uuid.UUID | None = None,
    sort: str = "-created_at",
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[SongRead]:
    listing = service.list_pool(
        owner_id=user_id, q=q, uploaded_by=uploaded_by, sort=sort, limit=limit, offset=offset
    )
    return Page(
        items=[to_song_read(v, storage) for v in listing.items],
        total=listing.total,
        limit=limit,
        offset=offset,
    )


@router.get("/{song_id}", response_model=SongRead)
def get_song(
    song_id: uuid.UUID, service: SongServiceDep, storage: StorageDep, user_id: CurrentUserId
) -> SongRead:
    return to_song_read(service.get(song_id, user_id), storage)


@router.patch("/{song_id}", response_model=SongRead)
def update_song(
    song_id: uuid.UUID,
    body: SongUpdate,
    service: SongServiceDep,
    storage: StorageDep,
    user_id: CurrentUserId,
) -> SongRead:
    changes = body.model_dump(exclude_unset=True)
    return to_song_read(service.update(song_id, user_id, changes), storage)


@router.get("/{song_id}/cover")
def get_cover(song_id: uuid.UUID, service: SongServiceDep, storage: StorageDep) -> Response:
    song = service.require(song_id)
    if song.cover_key is None or not storage.exists(song.cover_key):
        raise NotFoundError("This song has no cover art", code="cover_not_found")
    media_type = "image/png" if song.cover_key.endswith(".png") else "image/jpeg"
    with storage.open(song.cover_key) as handle:
        return Response(handle.read(), media_type=media_type)


@router.get("/{song_id}/stream")
def stream_song(
    song_id: uuid.UUID,
    service: SongServiceDep,
    storage: StorageDep,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> Response:
    song = service.require(song_id)
    if not storage.exists(song.storage_key):
        logger.error("audio file missing for song %s (%s)", song.id, song.storage_key)
        raise NotFoundError("The audio file is missing", code="file_missing")

    size = storage.size(song.storage_key)
    headers = {"Accept-Ranges": "bytes"}
    try:
        byte_range = parse_range(range_header, size)
    except RangeNotSatisfiableError as exc:
        exc.headers = {"Content-Range": f"bytes */{size}"}
        raise

    if byte_range is None:
        headers["Content-Length"] = str(size)
        return StreamingResponse(
            storage.stream(song.storage_key), media_type=song.mime_type, headers=headers
        )

    start, end = byte_range
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)
    return StreamingResponse(
        storage.stream(song.storage_key, start, end),
        status_code=206,
        media_type=song.mime_type,
        headers=headers,
    )
