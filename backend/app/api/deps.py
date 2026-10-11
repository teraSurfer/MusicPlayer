import uuid
from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.current_user import get_current_user_id
from app.core.deps import get_session, get_storage
from app.services.collection import CollectionService
from app.services.metadata import MetadataExtractor
from app.services.playlists import PlaylistService
from app.services.songs import SongService
from app.services.upload import UploadService
from app.storage.base import StorageBackend

SessionDep = Annotated[Session, Depends(get_session)]
StorageDep = Annotated[StorageBackend, Depends(get_storage)]
CurrentUserId = Annotated[uuid.UUID, Depends(get_current_user_id)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_song_service(session: SessionDep) -> SongService:
    return SongService(session)


def get_collection_service(session: SessionDep) -> CollectionService:
    return CollectionService(session)


def get_playlist_service(session: SessionDep) -> PlaylistService:
    return PlaylistService(session)


def get_upload_service(
    session: SessionDep, storage: StorageDep, settings: SettingsDep
) -> UploadService:
    return UploadService(session, storage, MetadataExtractor(), max_bytes=settings.max_upload_bytes)


SongServiceDep = Annotated[SongService, Depends(get_song_service)]
CollectionServiceDep = Annotated[CollectionService, Depends(get_collection_service)]
UploadServiceDep = Annotated[UploadService, Depends(get_upload_service)]
PlaylistServiceDep = Annotated[PlaylistService, Depends(get_playlist_service)]

Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]
