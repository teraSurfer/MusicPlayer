import importlib
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.core.config import get_settings
from tests.integration.conftest import Env, audio_bytes, multipart


def build_client(env_name: str, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    from alembic import command
    from alembic.config import Config

    monkeypatch.setenv("MUSIC_APP_ENV", env_name)
    monkeypatch.setenv("MUSIC_DATABASE_URL", f"sqlite:///{tmp_path / 'x.db'}")
    monkeypatch.setenv("MUSIC_STORAGE_DIR", str(tmp_path / "songs"))
    get_settings.cache_clear()
    deps._session_factory.cache_clear()
    command.upgrade(Config(str(Path(__file__).resolve().parents[2] / "alembic.ini")), "head")

    import app.api.v1.router as router_module
    import app.main as main_module

    importlib.reload(router_module)
    importlib.reload(main_module)
    return TestClient(main_module.create_app())


@pytest.fixture(autouse=True)
def restore_modules() -> Iterator[None]:
    yield
    import app.api.v1.router as router_module
    import app.main as main_module

    get_settings.cache_clear()
    importlib.reload(router_module)
    importlib.reload(main_module)


def test_reset_endpoint_is_absent_outside_test_env(env: Env) -> None:
    assert env.client.post("/api/v1/test/reset").status_code == 404


def test_reset_wipes_database_and_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = build_client("test", monkeypatch, tmp_path)
    with client:
        client.post("/api/v1/songs/upload", files=[multipart("a.wav", audio_bytes("wav"))])
        client.post("/api/v1/playlists", json={"name": "P"})
        assert client.get("/api/v1/songs").json()["total"] == 1
        assert any((tmp_path / "songs").rglob("*.wav"))

        assert client.post("/api/v1/test/reset").status_code == 204

        assert client.get("/api/v1/songs").json()["total"] == 0
        assert client.get("/api/v1/collection").json()["total"] == 0
        assert client.get("/api/v1/playlists").json() == []
        assert not any((tmp_path / "songs").rglob("*.wav"))
        # and the app still works afterwards
        again = client.post("/api/v1/songs/upload", files=[multipart("a.wav", audio_bytes("wav"))])
        assert again.status_code == 201
