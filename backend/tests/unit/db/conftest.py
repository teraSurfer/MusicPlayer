from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import create_db_engine, create_session_factory


@pytest.fixture
def engine() -> Iterator[Engine]:
    engine = create_db_engine("sqlite://")
    import app.db.models  # noqa: F401  (registers tables on Base.metadata)

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with create_session_factory(engine)() as session:
        yield session
