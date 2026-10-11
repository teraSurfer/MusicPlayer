import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


class SongRead(BaseModel):
    id: uuid.UUID
    title: str
    artist: str | None
    album: str | None
    duration_ms: int
    format: str
    mime_type: str
    size_bytes: int
    uploaded_by: uuid.UUID | None
    created_at: datetime
    stream_url: str
    cover_url: str | None
    in_collection: bool
    added_at: datetime | None = None


class SongUpdate(BaseModel):
    """Only these fields are user-editable; anything else is a 422."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    artist: str | None = None
    album: str | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        if len(value) > 200:
            raise ValueError("title must be at most 200 characters")
        return value

    @field_validator("artist", "album")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 200:
            raise ValueError("must be at most 200 characters")
        return value or None


class UploadResult(BaseModel):
    filename: str
    status: Literal["created", "existing", "rejected"]
    reason: Literal["unsupported_type", "invalid_audio", "file_too_large"] | None = None
    message: str | None = None
    song: SongRead | None = None


class UploadResponse(BaseModel):
    results: list[UploadResult]


class SongIds(BaseModel):
    song_ids: list[uuid.UUID]

    @field_validator("song_ids")
    @classmethod
    def _not_empty(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if not value:
            raise ValueError("song_ids must not be empty")
        return value


class CollectionAddResult(BaseModel):
    added: list[uuid.UUID]
    already_in_collection: list[uuid.UUID]
