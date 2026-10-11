from app.schemas.playlists import PlaylistDetail as PlaylistDetailSchema
from app.schemas.playlists import PlaylistSummary as PlaylistSummarySchema
from app.schemas.songs import SongRead
from app.services.playlists import PlaylistDetail, PlaylistSummary
from app.services.songs import SongView
from app.storage.base import StorageBackend


def to_song_read(view: SongView, storage: StorageBackend) -> SongRead:
    song = view.song
    return SongRead(
        id=song.id,
        title=song.title,
        artist=song.artist,
        album=song.album,
        duration_ms=song.duration_ms,
        format=song.format,
        mime_type=song.mime_type,
        size_bytes=song.size_bytes,
        uploaded_by=song.uploaded_by,
        created_at=song.created_at,
        stream_url=storage.url(song.storage_key) or f"/api/v1/songs/{song.id}/stream",
        cover_url=(
            (storage.url(song.cover_key) or f"/api/v1/songs/{song.id}/cover")
            if song.cover_key
            else None
        ),
        in_collection=view.in_collection,
        added_at=view.added_at,
    )


def to_playlist_summary(summary: PlaylistSummary) -> PlaylistSummarySchema:
    p = summary.playlist
    return PlaylistSummarySchema(
        id=p.id,
        name=p.name,
        description=p.description,
        song_count=summary.song_count,
        total_duration_ms=summary.total_duration_ms,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def to_playlist_detail(detail: PlaylistDetail, storage: StorageBackend) -> PlaylistDetailSchema:
    p = detail.playlist
    return PlaylistDetailSchema(
        id=p.id,
        name=p.name,
        description=p.description,
        song_count=len(detail.songs),
        total_duration_ms=sum(v.song.duration_ms for v in detail.songs),
        created_at=p.created_at,
        updated_at=p.updated_at,
        songs=[to_song_read(v, storage) for v in detail.songs],
    )
