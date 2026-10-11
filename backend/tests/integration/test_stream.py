import uuid
from collections.abc import Callable
from typing import Any

import pytest

from tests.integration.conftest import Env, audio_bytes


@pytest.fixture
def song(upload: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    return upload(audio_bytes("wav"), "tone.wav")


@pytest.fixture
def original() -> bytes:
    return audio_bytes("wav")


def stream_url(song: dict[str, Any]) -> str:
    return str(song["stream_url"])


def test_B_ST_01_full_file(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song))

    assert response.status_code == 200
    assert response.content == original
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["content-length"] == str(len(original))


def test_B_ST_02_bounded_range(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": "bytes=0-99"})

    assert response.status_code == 206
    assert response.content == original[:100]
    assert response.headers["content-range"] == f"bytes 0-99/{len(original)}"
    assert response.headers["content-length"] == "100"


def test_B_ST_03_open_ended_range(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": "bytes=100-"})

    assert response.status_code == 206
    assert response.content == original[100:]
    assert response.headers["content-range"] == f"bytes 100-{len(original) - 1}/{len(original)}"


def test_B_ST_04_suffix_range(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": "bytes=-50"})

    assert response.status_code == 206
    assert response.content == original[-50:]


def test_end_beyond_file_is_clamped(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": "bytes=10-99999999"})

    assert response.status_code == 206
    assert response.content == original[10:]


def test_B_ST_05_range_beyond_file_is_416(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": f"bytes={len(original) + 10}-"})

    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{len(original)}"
    assert response.json()["error"]["code"] == "range_not_satisfiable"


def test_malformed_range_is_ignored(env: Env, song: dict[str, Any], original: bytes) -> None:
    response = env.client.get(stream_url(song), headers={"Range": "bytes=banana"})

    assert response.status_code == 200
    assert response.content == original


def test_B_ST_06_unknown_song(env: Env) -> None:
    response = env.client.get(f"/api/v1/songs/{uuid.uuid4()}/stream")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "song_not_found"


def test_B_ST_07_row_exists_but_file_is_missing(env: Env, song: dict[str, Any]) -> None:
    for path in env.stored_files():
        path.unlink()

    response = env.client.get(stream_url(song))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "file_missing"
