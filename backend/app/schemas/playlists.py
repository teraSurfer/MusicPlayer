import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.songs import SongRead


def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("name must not be blank")
    if len(value) > 100:
        raise ValueError("name must be at most 100 characters")
    return value


def _clean_description(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if len(value) > 500:
        raise ValueError("description must be at most 500 characters")
    return value or None


class PlaylistCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str | None = None

    _name = field_validator("name")(_clean_name)
    _description = field_validator("description")(_clean_description)


class PlaylistUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("name must not be null")
        return _clean_name(value)

    _description = field_validator("description")(_clean_description)


class PlaylistSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    song_count: int
    total_duration_ms: int
    created_at: datetime
    updated_at: datetime


class PlaylistDetail(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    song_count: int
    total_duration_ms: int
    created_at: datetime
    updated_at: datetime
    songs: list[SongRead]


class AddSongsResult(BaseModel):
    added: list[uuid.UUID]
    skipped: list[uuid.UUID]
    playlist: PlaylistDetail
