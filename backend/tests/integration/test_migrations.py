from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.core.config import get_settings
from app.db.base import Base

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture
def alembic_cfg(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Config]:
    db_url = f"sqlite:///{tmp_path / 'migrate.db'}"
    monkeypatch.setenv("MUSIC_DATABASE_URL", db_url)
    get_settings.cache_clear()
    yield Config(str(BACKEND_DIR / "alembic.ini"))
    get_settings.cache_clear()


def table_names(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_head_creates_tables(alembic_cfg: Config) -> None:
    command.upgrade(alembic_cfg, "head")

    assert {"songs", "collection_items", "playlists", "playlist_songs"} <= table_names(
        get_settings().database_url
    )


def test_schema_matches_models_after_upgrade(alembic_cfg: Config) -> None:
    command.upgrade(alembic_cfg, "head")

    import app.db.models  # noqa: F401

    engine = create_engine(get_settings().database_url)
    try:
        with engine.connect() as connection:
            diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    finally:
        engine.dispose()

    assert diff == []


def test_downgrade_then_upgrade_round_trip(alembic_cfg: Config) -> None:
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    assert table_names(get_settings().database_url) <= {"alembic_version"}

    command.upgrade(alembic_cfg, "head")
    assert {"songs", "collection_items", "playlists", "playlist_songs"} <= table_names(
        get_settings().database_url
    )
