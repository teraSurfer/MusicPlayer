"""Test-only endpoints. Registered only when MUSIC_APP_ENV=test (see router.py)."""

import shutil

from fastapi import APIRouter, Response
from sqlalchemy import delete

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.db.models import CollectionItem, Playlist, PlaylistSong, Song

router = APIRouter(prefix="/test", tags=["test"])


@router.post("/reset", status_code=204)
def reset(session: SessionDep) -> Response:
    """Empty the database and the song storage so each end-to-end test starts clean."""
    for model in (PlaylistSong, Playlist, CollectionItem, Song):
        session.execute(delete(model))
    session.commit()

    storage_dir = get_settings().storage_dir
    if storage_dir.exists():
        shutil.rmtree(storage_dir)
    return Response(status_code=204)
