from collections.abc import Iterator
from dataclasses import dataclass
from typing import BinaryIO, Protocol


class StorageError(Exception):
    """Base class for storage failures."""


class StorageKeyError(StorageError):
    """The key is not a safe, relative storage key."""


class StorageKeyExistsError(StorageError):
    """A file is already stored under this key."""


class StorageNotFoundError(StorageError):
    """No file is stored under this key."""


class InvalidRangeError(StorageError):
    """The requested byte range cannot be satisfied (HTTP 416)."""


@dataclass(frozen=True)
class StoredFile:
    key: str
    size_bytes: int
    sha256: str


class StorageBackend(Protocol):
    """Where song and cover files live.

    Callers refer to files only by opaque, relative keys, never by path, so an
    object-store implementation (S3, GCS, ...) can replace the local one.
    """

    def save(self, key: str, data: BinaryIO) -> StoredFile:
        """Write ``data`` under ``key`` atomically, hashing it while streaming.

        Raises ``StorageKeyExistsError`` if the key is taken. A failed write
        leaves nothing behind.
        """
        ...

    def open(self, key: str) -> BinaryIO:
        """Open the file for binary reading. The caller closes it."""
        ...

    def stream(self, key: str, start: int = 0, end: int | None = None) -> Iterator[bytes]:
        """Yield the bytes ``start..end`` inclusive (``end=None`` means to the end).

        An ``end`` past the file size is clamped. Missing files and unsatisfiable
        ranges raise when called, not on first iteration.
        """
        ...

    def size(self, key: str) -> int: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> None:
        """Remove the file. Deleting a missing key is a no-op."""
        ...

    def url(self, key: str) -> str | None:
        """A directly fetchable (e.g. pre-signed) URL, or None to stream via the API."""
        ...
