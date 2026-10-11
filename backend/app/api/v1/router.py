from fastapi import APIRouter

from app.api.v1 import collection, health, playlists, songs, testing
from app.core.config import get_settings

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(songs.router)
api_router.include_router(collection.router)
api_router.include_router(playlists.router)

if get_settings().app_env == "test":
    api_router.include_router(testing.router)
