from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, BinaryIO

import mutagen
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.oggflac import OggFLAC
from mutagen.oggopus import OggOpus
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE

ALLOWED_EXTENSIONS = frozenset({"mp3", "wav", "flac", "ogg", "m4a"})


class UnsupportedAudioError(Exception):
    """The file is not a readable audio file of a supported format."""


@dataclass(frozen=True)
class Cover:
    data: bytes
    mime_type: str

    @property
    def extension(self) -> str:
        return "png" if self.mime_type == "image/png" else "jpg"


@dataclass(frozen=True)
class AudioMetadata:
    title: str
    artist: str | None
    album: str | None
    duration_ms: int
    format: str
    mime_type: str
    cover: Cover | None


_FORMATS: list[tuple[type, str, str]] = [
    (MP3, "mp3", "audio/mpeg"),
    (WAVE, "wav", "audio/wav"),
    (FLAC, "flac", "audio/flac"),
    (OggVorbis, "ogg", "audio/ogg"),
    (OggOpus, "ogg", "audio/ogg"),
    (OggFLAC, "ogg", "audio/ogg"),
    (MP4, "m4a", "audio/mp4"),
]


def _first(tags: Any, key: str) -> str | None:
    values = tags.get(key) if tags else None
    if not values:
        return None
    value = str(values[0]).strip()
    return value or None


def _cover(audio: Any) -> Cover | None:
    try:
        if isinstance(audio, MP3):
            tags = audio.tags
            if isinstance(tags, ID3):
                for frame in tags.getall("APIC"):
                    return Cover(frame.data, frame.mime or "image/jpeg")
        elif isinstance(audio, FLAC | OggVorbis | OggOpus | OggFLAC):
            pictures = getattr(audio, "pictures", None)
            if pictures:
                return Cover(pictures[0].data, pictures[0].mime or "image/jpeg")
        elif isinstance(audio, MP4) and audio.tags and audio.tags.get("covr"):
            cover = audio.tags["covr"][0]
            mime = "image/png" if cover.imageformat == cover.FORMAT_PNG else "image/jpeg"
            return Cover(bytes(cover), mime)
    except Exception:
        return None
    return None


class MetadataExtractor:
    """Reads tags and duration from audio, and verifies the content really is audio."""

    def extract(self, data: BinaryIO, filename: str) -> AudioMetadata:
        try:
            audio = mutagen.File(data)
        except Exception as exc:
            raise UnsupportedAudioError(str(exc)) from exc
        if audio is None or audio.info is None:
            raise UnsupportedAudioError("not a recognised audio file")

        fmt = next(((f, m) for cls, f, m in _FORMATS if isinstance(audio, cls)), None)
        if fmt is None:
            raise UnsupportedAudioError(f"unsupported audio type: {type(audio).__name__}")

        easy: Any = None
        try:
            data.seek(0)
            easy = mutagen.File(data, easy=True)
        except Exception:
            easy = None
        easy_tags = easy.tags if easy is not None else None

        title = _first(easy_tags, "title") or PurePosixPath(filename).stem or "Untitled"
        return AudioMetadata(
            title=title,
            artist=_first(easy_tags, "artist"),
            album=_first(easy_tags, "album"),
            duration_ms=int(round(audio.info.length * 1000)),
            format=fmt[0],
            mime_type=fmt[1],
            cover=_cover(audio),
        )
