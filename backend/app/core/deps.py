from collections.abc import Generator
from functools import lru_cache

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.session import create_db_engine, create_session_factory
from app.storage.base import StorageBackend
from app.storage.local import LocalFileStorage


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return create_session_factory(create_db_engine(get_settings().database_url))


def get_session() -> Generator[Session]:
    with _session_factory()() as session:
        yield session


def get_storage() -> StorageBackend:
    """The one place that picks the storage implementation."""
    return LocalFileStorage(get_settings().storage_dir)
