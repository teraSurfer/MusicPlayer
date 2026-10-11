import hashlib
import io
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO, cast

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.storage.base import (
    InvalidRangeError,
    StorageBackend,
    StorageKeyError,
    StorageKeyExistsError,
    StorageNotFoundError,
)
from app.storage.local import LocalFileStorage

KEY = "ab/song.mp3"
DATA = bytes(range(256)) * 4  # 1024 bytes, every byte value appears


@pytest.fixture
def storage(tmp_path: Path) -> LocalFileStorage:
    return LocalFileStorage(tmp_path / "songs")


def put(storage: LocalFileStorage, key: str = KEY, data: bytes = DATA) -> None:
    storage.save(key, io.BytesIO(data))


class TestProtocol:
    def test_local_storage_satisfies_protocol(self, storage: LocalFileStorage) -> None:
        backend: StorageBackend = storage
        assert backend is storage


class TestSave:
    def test_returns_key_size_and_sha256(self, storage: LocalFileStorage) -> None:
        stored = storage.save(KEY, io.BytesIO(DATA))

        assert stored.key == KEY
        assert stored.size_bytes == len(DATA)
        assert stored.sha256 == hashlib.sha256(DATA).hexdigest()

    def test_content_round_trips(self, storage: LocalFileStorage) -> None:
        put(storage)

        with storage.open(KEY) as handle:
            assert handle.read() == DATA

    def test_hashes_streams_larger_than_one_chunk(self, tmp_path: Path) -> None:
        storage = LocalFileStorage(tmp_path, chunk_size=64)
        data = b"x" * 1000

        stored = storage.save("big.bin", io.BytesIO(data))

        assert stored.size_bytes == 1000
        assert stored.sha256 == hashlib.sha256(data).hexdigest()

    def test_empty_file_is_allowed(self, storage: LocalFileStorage) -> None:
        stored = storage.save("empty.bin", io.BytesIO(b""))

        assert stored.size_bytes == 0
        assert storage.exists("empty.bin")

    def test_existing_key_is_not_overwritten(self, storage: LocalFileStorage) -> None:
        put(storage, data=b"first")

        with pytest.raises(StorageKeyExistsError):
            put(storage, data=b"second")

        with storage.open(KEY) as handle:
            assert handle.read() == b"first"

    def test_failed_write_leaves_no_partial_file(
        self, storage: LocalFileStorage, tmp_path: Path
    ) -> None:
        class ExplodingStream:
            def __init__(self) -> None:
                self.calls = 0

            def read(self, size: int = -1) -> bytes:
                self.calls += 1
                if self.calls > 1:
                    raise OSError("disk went away")
                return b"hello"

        with pytest.raises(OSError, match="disk went away"):
            storage.save(KEY, cast(BinaryIO, ExplodingStream()))

        assert not storage.exists(KEY)
        leftovers = [p for p in (tmp_path / "songs").rglob("*") if p.is_file()]
        assert leftovers == []


class TestOpenSizeExistsDelete:
    def test_exists(self, storage: LocalFileStorage) -> None:
        assert not storage.exists(KEY)
        put(storage)
        assert storage.exists(KEY)

    def test_size(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert storage.size(KEY) == len(DATA)

    def test_open_missing_raises(self, storage: LocalFileStorage) -> None:
        with pytest.raises(StorageNotFoundError):
            storage.open("nope.mp3")

    def test_size_missing_raises(self, storage: LocalFileStorage) -> None:
        with pytest.raises(StorageNotFoundError):
            storage.size("nope.mp3")

    def test_delete_removes_file(self, storage: LocalFileStorage) -> None:
        put(storage)
        storage.delete(KEY)
        assert not storage.exists(KEY)

    def test_delete_missing_is_a_no_op(self, storage: LocalFileStorage) -> None:
        storage.delete("nope.mp3")

    def test_url_is_none_for_local_storage(self, storage: LocalFileStorage) -> None:
        assert storage.url(KEY) is None


class TestKeyValidation:
    BAD_KEYS = [
        "",
        ".",
        "..",
        "../escape.mp3",
        "a/../../escape.mp3",
        "/etc/passwd",
        "a\\b.mp3",
        "a//b.mp3",
        "a/./b.mp3",
        "nul\x00byte.mp3",
    ]

    @pytest.mark.parametrize("key", BAD_KEYS)
    def test_every_operation_rejects_bad_keys(self, storage: LocalFileStorage, key: str) -> None:
        with pytest.raises(StorageKeyError):
            storage.save(key, io.BytesIO(b"x"))
        with pytest.raises(StorageKeyError):
            storage.open(key)
        with pytest.raises(StorageKeyError):
            storage.stream(key)
        with pytest.raises(StorageKeyError):
            storage.exists(key)
        with pytest.raises(StorageKeyError):
            storage.delete(key)
        with pytest.raises(StorageKeyError):
            storage.size(key)

    def test_nothing_is_written_outside_the_root(self, tmp_path: Path) -> None:
        root = tmp_path / "songs"
        storage = LocalFileStorage(root)

        with pytest.raises(StorageKeyError):
            storage.save("../outside.mp3", io.BytesIO(b"x"))

        assert not (tmp_path / "outside.mp3").exists()

    def test_symlink_escaping_root_is_rejected(self, tmp_path: Path) -> None:
        root = tmp_path / "songs"
        outside = tmp_path / "outside"
        outside.mkdir()
        (outside / "secret.mp3").write_bytes(b"secret")
        root.mkdir()
        try:
            (root / "link").symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("creating symlinks needs extra privileges on this platform (Windows)")
        storage = LocalFileStorage(root)

        with pytest.raises(StorageKeyError):
            storage.open("link/secret.mp3")


def collect(chunks: Iterator[bytes]) -> bytes:
    return b"".join(chunks)


class TestStream:
    def test_full_file(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert collect(storage.stream(KEY)) == DATA

    def test_inclusive_start_and_end(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert collect(storage.stream(KEY, start=0, end=99)) == DATA[0:100]

    def test_open_ended(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert collect(storage.stream(KEY, start=100)) == DATA[100:]

    def test_single_byte(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert collect(storage.stream(KEY, start=7, end=7)) == DATA[7:8]

    def test_last_byte(self, storage: LocalFileStorage) -> None:
        put(storage)
        last = len(DATA) - 1
        assert collect(storage.stream(KEY, start=last)) == DATA[last:]

    def test_end_beyond_size_is_clamped(self, storage: LocalFileStorage) -> None:
        put(storage)
        assert collect(storage.stream(KEY, start=1000, end=10_000)) == DATA[1000:]

    def test_yields_chunks_no_larger_than_chunk_size(self, tmp_path: Path) -> None:
        storage = LocalFileStorage(tmp_path, chunk_size=100)
        put(storage, "k.bin", DATA)

        chunks = list(storage.stream("k.bin"))

        assert all(len(chunk) <= 100 for chunk in chunks)
        assert b"".join(chunks) == DATA

    @pytest.mark.parametrize(
        ("start", "end"),
        [(len(DATA), None), (len(DATA) + 5, None), (-1, None), (10, 5), (0, -1)],
    )
    def test_invalid_range_raises_at_call_time(
        self, storage: LocalFileStorage, start: int, end: int | None
    ) -> None:
        put(storage)

        with pytest.raises(InvalidRangeError):
            storage.stream(KEY, start=start, end=end)

    def test_empty_file_streams_nothing(self, storage: LocalFileStorage) -> None:
        put(storage, "empty.bin", b"")
        assert collect(storage.stream("empty.bin")) == b""

    def test_missing_key_raises_at_call_time(self, storage: LocalFileStorage) -> None:
        with pytest.raises(StorageNotFoundError):
            storage.stream("nope.mp3")

    @settings(max_examples=75, deadline=None)
    @given(
        data=st.binary(min_size=1, max_size=2048),
        chunk_size=st.integers(min_value=1, max_value=300),
        a=st.integers(min_value=0, max_value=2047),
        b=st.integers(min_value=0, max_value=2047),
    )
    def test_any_range_matches_slicing(
        self, tmp_path_factory: pytest.TempPathFactory, data: bytes, chunk_size: int, a: int, b: int
    ) -> None:
        storage = LocalFileStorage(tmp_path_factory.mktemp("prop"), chunk_size=chunk_size)
        storage.save("f.bin", io.BytesIO(data))
        start: int = min(a, b)
        end: int | None = max(a, b)
        if start >= len(data):
            start, end = 0, None

        expected = data[start:] if end is None else data[start : end + 1]

        assert collect(storage.stream("f.bin", start=start, end=end)) == expected
