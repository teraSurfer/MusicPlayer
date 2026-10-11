import io
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.core import deps
from app.core.config import get_settings
from app.core.current_user import get_current_user_id
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[2]
AUDIO_DIR = BACKEND_DIR / "tests" / "fixtures" / "audio"


@dataclass
class Env:
    client: TestClient
    storage_dir: Path
    db_path: Path
    app: Any

    def stored_files(self) -> list[Path]:
        return [p for p in self.storage_dir.rglob("*") if p.is_file()]


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Env]:
    db_path = tmp_path / "test.db"
    storage_dir = tmp_path / "songs"
    monkeypatch.setenv("MUSIC_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("MUSIC_STORAGE_DIR", str(storage_dir))
    monkeypatch.setenv("MUSIC_MAX_UPLOAD_BYTES", str(1024 * 1024))
    get_settings.cache_clear()
    deps._session_factory.cache_clear()

    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")

    app = create_app()
    with TestClient(app, raise_server_exceptions=False) as client:
        yield Env(client=client, storage_dir=storage_dir, db_path=db_path, app=app)

    get_settings.cache_clear()
    deps._session_factory.cache_clear()


@pytest.fixture
def client(env: Env) -> TestClient:
    return env.client


@pytest.fixture
def as_user(env: Env) -> Callable[[uuid.UUID], None]:
    def switch(user_id: uuid.UUID) -> None:
        env.app.dependency_overrides[get_current_user_id] = lambda: user_id

    return switch


AudioFile = tuple[str, tuple[str, bytes, str]]


def audio_bytes(fmt: str = "mp3") -> bytes:
    return (AUDIO_DIR / f"tone.{fmt}").read_bytes()


def multipart(name: str, data: bytes, content_type: str = "audio/mpeg") -> AudioFile:
    return ("files", (name, data, content_type))


def distinct_wav(seed: int, seconds: float = 0.1) -> bytes:
    """A tiny valid WAV whose content (and so hash) differs per seed."""
    import math
    import wave

    buffer = io.BytesIO()
    rate = 8000
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(rate)
        freq = 200 + seed * 37
        frames = bytes(
            int(128 + 100 * math.sin(2 * math.pi * freq * i / rate))
            for i in range(int(rate * seconds))
        )
        wav.writeframes(frames)
    return buffer.getvalue()


@pytest.fixture
def upload(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Upload one valid file and return the created song JSON."""

    def _upload(data: bytes | None = None, name: str = "song.wav") -> dict[str, Any]:
        payload = data if data is not None else distinct_wav(uuid.uuid4().int % 1000)
        response = client.post(
            "/api/v1/songs/upload", files=[multipart(name, payload, "audio/wav")]
        )
        assert response.status_code in (200, 201), response.text
        result = response.json()["results"][0]
        assert result["song"] is not None, result
        song: dict[str, Any] = result["song"]
        return song

    return _upload
