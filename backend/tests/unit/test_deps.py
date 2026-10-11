from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import text

from app.core import deps
from app.core.config import get_settings
from app.storage.local import LocalFileStorage


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("MUSIC_DATABASE_URL", f"sqlite:///{tmp_path / 'deps.db'}")
    monkeypatch.setenv("MUSIC_STORAGE_DIR", str(tmp_path / "songs"))
    get_settings.cache_clear()
    deps._session_factory.cache_clear()
    yield
    get_settings.cache_clear()
    deps._session_factory.cache_clear()


def test_get_storage_returns_local_storage_at_configured_dir(tmp_path: Path) -> None:
    storage = deps.get_storage()

    assert isinstance(storage, LocalFileStorage)
    assert storage.url("a.mp3") is None


def test_get_session_yields_a_working_session() -> None:
    generator = deps.get_session()
    session = next(generator)

    assert session.execute(text("SELECT 1")).scalar() == 1
    generator.close()
