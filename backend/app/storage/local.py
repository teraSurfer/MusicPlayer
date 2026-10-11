import contextlib
import hashlib
import os
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO

from app.storage.base import (
    InvalidRangeError,
    StorageKeyError,
    StorageKeyExistsError,
    StorageNotFoundError,
    StoredFile,
)

DEFAULT_CHUNK_SIZE = 64 * 1024


class LocalFileStorage:
    """``StorageBackend`` that keeps files under a directory on the local disk."""

    def __init__(self, root: Path, chunk_size: int = DEFAULT_CHUNK_SIZE) -> None:
        self._root = Path(root).resolve()
        self._chunk_size = chunk_size

    def save(self, key: str, data: BinaryIO) -> StoredFile:
        target = self._path(key)
        if target.exists():
            raise StorageKeyExistsError(key)

        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.parent / f".{uuid.uuid4().hex}.tmp"
        digest = hashlib.sha256()
        size = 0
        try:
            with temp.open("wb") as out:
                while chunk := data.read(self._chunk_size):
                    out.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            try:
                os.link(temp, target)  # atomic, and refuses to overwrite
            except FileExistsError as exc:
                raise StorageKeyExistsError(key) from exc
        finally:
            temp.unlink(missing_ok=True)

        return StoredFile(key=key, size_bytes=size, sha256=digest.hexdigest())

    def open(self, key: str) -> BinaryIO:
        return self._existing(key).open("rb")

    def stream(self, key: str, start: int = 0, end: int | None = None) -> Iterator[bytes]:
        path = self._existing(key)
        size = path.stat().st_size
        if start < 0 or (end is not None and (end < 0 or end < start)):
            raise InvalidRangeError(f"bytes {start}-{end}")
        if size == 0 and start == 0 and end is None:
            return iter(())
        if start >= size:
            raise InvalidRangeError(f"start {start} is beyond size {size}")

        last = size - 1 if end is None else min(end, size - 1)
        return self._read_range(path, start, last)

    def size(self, key: str) -> int:
        return self._existing(key).stat().st_size

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        with contextlib.suppress(FileNotFoundError):
            self._path(key).unlink()

    def url(self, key: str) -> str | None:
        self._path(key)  # validate the key
        return None

    def _read_range(self, path: Path, start: int, last: int) -> Iterator[bytes]:
        remaining = last - start + 1
        with path.open("rb") as handle:
            handle.seek(start)
            while remaining > 0:
                chunk = handle.read(min(self._chunk_size, remaining))
                if not chunk:
                    return
                remaining -= len(chunk)
                yield chunk

    def _existing(self, key: str) -> Path:
        path = self._path(key)
        if not path.is_file():
            raise StorageNotFoundError(key)
        return path

    def _path(self, key: str) -> Path:
        parts = key.split("/")
        unsafe = (
            not key
            or "\x00" in key
            or "\\" in key
            or key.startswith("/")
            or any(part in ("", ".", "..") for part in parts)
        )
        if unsafe:
            raise StorageKeyError(f"invalid storage key: {key!r}")

        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root):
            raise StorageKeyError(f"key escapes storage root: {key!r}")
        return path
