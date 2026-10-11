import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import BinaryIO, Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Song
from app.repositories.collection import CollectionRepository
from app.repositories.songs import SongRepository
from app.services.metadata import ALLOWED_EXTENSIONS, MetadataExtractor, UnsupportedAudioError
from app.storage.base import StorageBackend

logger = logging.getLogger("app.upload")

RejectReason = Literal["unsupported_type", "invalid_audio", "file_too_large"]


class FileTooLargeError(Exception):
    pass


class _LimitedReader:
    """File-like wrapper that aborts once more than ``limit`` bytes were read."""

    def __init__(self, source: BinaryIO, limit: int) -> None:
        self._source = source
        self._limit = limit
        self._read = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self._source.read(size)
        self._read += len(chunk)
        if self._read > self._limit:
            raise FileTooLargeError
        return chunk


@dataclass(frozen=True)
class UploadOutcome:
    filename: str
    status: Literal["created", "existing", "rejected"]
    song: Song | None = None
    reason: RejectReason | None = None
    message: str | None = None


class UploadService:
    def __init__(
        self,
        session: Session,
        storage: StorageBackend,
        extractor: MetadataExtractor,
        *,
        max_bytes: int,
    ) -> None:
        self.session = session
        self.storage = storage
        self.extractor = extractor
        self.max_bytes = max_bytes
        self.songs = SongRepository(session)
        self.collection = CollectionRepository(session)

    def upload(self, data: BinaryIO, filename: str, user_id: uuid.UUID) -> UploadOutcome:
        extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower().lstrip(".")
        if extension not in ALLOWED_EXTENSIONS:
            return self._rejected(filename, "unsupported_type", f"'.{extension}' is not supported")

        key = f"songs/{uuid.uuid4()}.{extension}"
        try:
            stored = self.storage.save(key, _LimitedReader(data, self.max_bytes))  # type: ignore[arg-type]
        except FileTooLargeError:
            return self._rejected(
                filename, "file_too_large", f"File exceeds {self.max_bytes} bytes"
            )

        duplicate = self.songs.get_by_sha256(stored.sha256)
        if duplicate is not None:
            self.storage.delete(key)
            self._ensure_in_collection(user_id, duplicate)
            return UploadOutcome(filename, "existing", song=duplicate)

        cover_key: str | None = None
        try:
            with self.storage.open(key) as handle:
                meta = self.extractor.extract(handle, filename)
        except UnsupportedAudioError as exc:
            self.storage.delete(key)
            return self._rejected(filename, "invalid_audio", str(exc))

        try:
            if meta.cover is not None:
                cover_key = f"covers/{uuid.uuid4()}.{meta.cover.extension}"
                self.storage.save(cover_key, io.BytesIO(meta.cover.data))
            song = Song(
                title=meta.title,
                artist=meta.artist,
                album=meta.album,
                duration_ms=meta.duration_ms,
                format=meta.format,
                mime_type=meta.mime_type,
                size_bytes=stored.size_bytes,
                sha256=stored.sha256,
                storage_key=key,
                cover_key=cover_key,
                uploaded_by=user_id,
            )
            self.songs.add(song)
            self.collection.add(user_id, [song.id])
            self.session.commit()
        except IntegrityError:
            # Lost a race with a concurrent upload of the same content.
            self.session.rollback()
            self._cleanup(key, cover_key)
            winner = self.songs.get_by_sha256(stored.sha256)
            if winner is None:
                raise
            self._ensure_in_collection(user_id, winner)
            return UploadOutcome(filename, "existing", song=winner)
        except Exception:
            self.session.rollback()
            self._cleanup(key, cover_key)
            raise

        return UploadOutcome(filename, "created", song=song)

    def _ensure_in_collection(self, user_id: uuid.UUID, song: Song) -> None:
        if not self.collection.contains(user_id, song.id):
            self.collection.add(user_id, [song.id])
        self.session.commit()

    def _cleanup(self, *keys: str | None) -> None:
        for key in keys:
            if key:
                self.storage.delete(key)

    @staticmethod
    def _rejected(filename: str, reason: RejectReason, message: str) -> UploadOutcome:
        return UploadOutcome(filename, "rejected", reason=reason, message=message)
