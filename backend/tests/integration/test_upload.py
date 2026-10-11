import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from mutagen.id3 import APIC, ID3
from mutagen.mp3 import MP3

from app.core.current_user import LOCAL_USER_ID
from tests.integration.conftest import Env, audio_bytes, distinct_wav, multipart

UPLOAD = "/api/v1/songs/upload"


class TestUploadSingleFile:
    @pytest.mark.parametrize("fmt", ["mp3", "wav", "flac", "ogg", "m4a"])
    def test_B_UP_09_valid_file_lands_in_pool_collection_and_storage(
        self, env: Env, fmt: str
    ) -> None:
        response = env.client.post(UPLOAD, files=[multipart(f"tone.{fmt}", audio_bytes(fmt))])

        assert response.status_code == 201
        result = response.json()["results"][0]
        assert result["status"] == "created"
        song = result["song"]
        assert song["format"] == fmt
        assert song["in_collection"] is True
        assert song["duration_ms"] == pytest.approx(1000, abs=200)
        assert len(env.stored_files()) == 1

        assert env.client.get(f"/api/v1/songs/{song['id']}").json()["id"] == song["id"]
        collection = env.client.get("/api/v1/collection").json()
        assert [s["id"] for s in collection["items"]] == [song["id"]]

    def test_B_UP_01_tags_are_extracted(self, client: TestClient) -> None:
        response = client.post(UPLOAD, files=[multipart("whatever.flac", audio_bytes("flac"))])

        song = response.json()["results"][0]["song"]
        assert song["title"] == "Tone flac"
        assert song["artist"] == "Test Artist"
        assert song["album"] == "Test Album"

    def test_B_UP_02_untagged_file_falls_back_to_filename(self, client: TestClient) -> None:
        response = client.post(UPLOAD, files=[multipart("My Great Song.wav", audio_bytes("wav"))])

        song = response.json()["results"][0]["song"]
        assert song["title"] == "My Great Song"
        assert song["artist"] is None

    def test_B_UP_03_embedded_cover_art_is_stored_and_served(
        self, env: Env, tmp_path_factory: pytest.TempPathFactory
    ) -> None:
        path = tmp_path_factory.mktemp("cover") / "with_cover.mp3"
        path.write_bytes(audio_bytes("mp3"))
        tags = MP3(path).tags or ID3()
        tags.add(APIC(encoding=3, mime="image/png", type=3, desc="cover", data=b"\x89PNG-bytes"))
        tags.save(path)

        response = env.client.post(UPLOAD, files=[multipart("c.mp3", path.read_bytes())])

        song = response.json()["results"][0]["song"]
        assert song["cover_url"] is not None
        cover = env.client.get(song["cover_url"])
        assert cover.status_code == 200
        assert cover.content == b"\x89PNG-bytes"
        assert cover.headers["content-type"] == "image/png"

    def test_B_ST_09_cover_is_404_when_song_has_none(self, client: TestClient) -> None:
        song = client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))]).json()[
            "results"
        ][0]["song"]

        assert song["cover_url"] is None
        assert client.get(f"/api/v1/songs/{song['id']}/cover").status_code == 404


class TestUploadRejections:
    def test_B_UP_04_text_file_renamed_mp3_is_rejected(self, env: Env) -> None:
        response = env.client.post(
            UPLOAD, files=[multipart("fake.mp3", b"this is not audio at all" * 50)]
        )

        assert response.status_code == 415
        body = response.json()
        assert body["error"]["code"] == "invalid_audio"
        assert body["error"]["details"]["results"][0]["status"] == "rejected"
        assert env.stored_files() == []  # nothing orphaned

    def test_B_UP_04b_truncated_audio_is_rejected(self, env: Env) -> None:
        response = env.client.post(UPLOAD, files=[multipart("cut.flac", audio_bytes("flac")[:20])])

        assert response.status_code == 415
        assert env.stored_files() == []

    def test_B_UP_05_disallowed_extension_is_rejected(self, env: Env) -> None:
        response = env.client.post(UPLOAD, files=[multipart("virus.exe", b"MZ" * 100)])

        assert response.status_code == 415
        assert response.json()["error"]["code"] == "unsupported_type"
        assert env.stored_files() == []

    def test_B_UP_06_file_over_size_limit_is_rejected(self, env: Env) -> None:
        too_big = audio_bytes("wav") + b"\0" * (1024 * 1024 + 1)

        response = env.client.post(UPLOAD, files=[multipart("big.wav", too_big)])

        assert response.status_code == 413
        assert response.json()["error"]["code"] == "file_too_large"
        assert env.stored_files() == []

    def test_no_files_is_a_validation_error(self, client: TestClient) -> None:
        response = client.post(UPLOAD)

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


class TestUploadBatchesAndDuplicates:
    def test_B_UP_10_mixed_batch_reports_each_file(self, env: Env) -> None:
        response = env.client.post(
            UPLOAD,
            files=[
                multipart("good.wav", distinct_wav(1)),
                multipart("bad.mp3", b"nope" * 100),
                multipart("good2.wav", distinct_wav(2)),
            ],
        )

        assert response.status_code == 201
        results = response.json()["results"]
        assert [r["status"] for r in results] == ["created", "rejected", "created"]
        assert results[1]["reason"] == "invalid_audio"
        assert results[0]["filename"] == "good.wav"
        assert len(env.stored_files()) == 2

    def test_B_UP_11_same_file_twice_creates_one_song(self, env: Env) -> None:
        first = env.client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))])
        second = env.client.post(UPLOAD, files=[multipart("renamed.wav", audio_bytes("wav"))])

        assert first.json()["results"][0]["status"] == "created"
        assert second.status_code == 200
        assert second.json()["results"][0]["status"] == "existing"
        assert second.json()["results"][0]["song"]["id"] == first.json()["results"][0]["song"]["id"]
        assert env.client.get("/api/v1/songs").json()["total"] == 1
        assert env.client.get("/api/v1/collection").json()["total"] == 1
        assert len(env.stored_files()) == 1

    def test_B_UP_12_db_failure_after_file_write_removes_the_file(
        self, env: Env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.repositories.songs import SongRepository

        def boom(self: SongRepository, song: object) -> None:
            raise RuntimeError("database exploded")

        monkeypatch.setattr(SongRepository, "add", boom)

        response = env.client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))])

        assert response.status_code == 500
        assert response.json()["error"]["code"] == "internal_error"
        assert env.stored_files() == []

    def test_N_04_concurrent_duplicate_insert_resolves_to_existing(
        self, env: Env, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Simulate losing the race: the pre-insert duplicate check misses a row
        that another request commits first; the unique constraint must catch it."""
        from app.repositories.songs import SongRepository

        first = env.client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))])
        existing_id = first.json()["results"][0]["song"]["id"]

        original = SongRepository.get_by_sha256
        calls = {"n": 0}

        def blind_first_time(self: SongRepository, sha256: str):  # type: ignore[no-untyped-def]
            calls["n"] += 1
            return None if calls["n"] == 1 else original(self, sha256)

        monkeypatch.setattr(SongRepository, "get_by_sha256", blind_first_time)

        response = env.client.post(UPLOAD, files=[multipart("b.wav", audio_bytes("wav"))])

        result = response.json()["results"][0]
        assert result["status"] == "existing"
        assert result["song"]["id"] == existing_id
        assert len(env.stored_files()) == 1

    def test_B_UP_08_hostile_filename_is_not_used_as_a_path(self, env: Env) -> None:
        response = env.client.post(
            UPLOAD, files=[multipart("../../etc/pass wörd 🎵.wav", audio_bytes("wav"))]
        )

        song = response.json()["results"][0]["song"]
        assert song["title"] == "pass wörd 🎵"
        (stored,) = env.stored_files()
        assert env.storage_dir in stored.parents
        assert stored.name.endswith(".wav")


class TestUploader:
    def test_B_UP_21_uploader_is_recorded(self, client: TestClient) -> None:
        song = client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))]).json()[
            "results"
        ][0]["song"]

        assert song["uploaded_by"] == str(LOCAL_USER_ID)
        assert client.get(f"/api/v1/songs/{song['id']}").json()["uploaded_by"] == str(LOCAL_USER_ID)

    def test_B_UP_22_first_uploader_wins_and_users_have_separate_collections(
        self, client: TestClient, as_user: Callable[[uuid.UUID], None]
    ) -> None:
        first = client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))]).json()
        song_id = first["results"][0]["song"]["id"]

        other = uuid.uuid4()
        as_user(other)
        second = client.post(UPLOAD, files=[multipart("a.wav", audio_bytes("wav"))]).json()

        assert second["results"][0]["status"] == "existing"
        assert second["results"][0]["song"]["uploaded_by"] == str(LOCAL_USER_ID)
        assert second["results"][0]["song"]["id"] == song_id
        assert client.get("/api/v1/collection").json()["total"] == 1  # other user's own entry

    def test_uploaded_by_filter(self, client: TestClient, as_user: Callable[..., None]) -> None:
        client.post(UPLOAD, files=[multipart("a.wav", distinct_wav(1))])
        other = uuid.uuid4()
        as_user(other)
        client.post(UPLOAD, files=[multipart("b.wav", distinct_wav(2))])

        mine = client.get(f"/api/v1/songs?uploaded_by={other}").json()

        assert mine["total"] == 1
        assert mine["items"][0]["uploaded_by"] == str(other)


def _seed(upload: Callable[..., dict[str, Any]], count: int) -> list[dict[str, Any]]:
    return [upload(distinct_wav(i), f"s{i}.wav") for i in range(count)]


class TestPoolListing:
    def test_B_UP_13_pagination_search_and_sort(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        for i, (title, artist) in enumerate(
            [("Alpha", "Zed"), ("Bravo", "Yan"), ("Charlie Alpha", "Xi")]
        ):
            song = upload(distinct_wav(i), f"{i}.wav")
            client.patch(f"/api/v1/songs/{song['id']}", json={"title": title, "artist": artist})

        page1 = client.get("/api/v1/songs?limit=2&offset=0&sort=title").json()
        page2 = client.get("/api/v1/songs?limit=2&offset=2&sort=title").json()
        assert page1["total"] == 3
        assert [s["title"] for s in page1["items"]] == ["Alpha", "Bravo"]
        assert [s["title"] for s in page2["items"]] == ["Charlie Alpha"]

        found = client.get("/api/v1/songs?q=ALPHA&sort=-title").json()
        assert [s["title"] for s in found["items"]] == ["Charlie Alpha", "Alpha"]
        by_artist = client.get("/api/v1/songs?q=yan").json()
        assert [s["title"] for s in by_artist["items"]] == ["Bravo"]

    def test_search_treats_wildcards_literally(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        song = upload(distinct_wav(1), "x.wav")
        client.patch(f"/api/v1/songs/{song['id']}", json={"title": "100% Pure"})
        upload(distinct_wav(2), "y.wav")

        assert client.get("/api/v1/songs?q=%25").json()["total"] == 1

    def test_limit_above_max_is_rejected(self, client: TestClient) -> None:
        assert client.get("/api/v1/songs?limit=201").status_code == 422
        assert client.get("/api/v1/songs?limit=0").status_code == 422

    def test_B_UP_14_in_collection_flag(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        a, b = _seed(upload, 2)
        client.delete(f"/api/v1/collection/{b['id']}")

        items = {s["id"]: s for s in client.get("/api/v1/songs").json()["items"]}

        assert items[a["id"]]["in_collection"] is True
        assert items[b["id"]]["in_collection"] is False


class TestCollection:
    def test_B_UP_15_add_pool_songs(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        a, b = _seed(upload, 2)
        client.delete(f"/api/v1/collection/{a['id']}")
        client.delete(f"/api/v1/collection/{b['id']}")
        assert client.get("/api/v1/collection").json()["total"] == 0

        response = client.post("/api/v1/collection", json={"song_ids": [a["id"], b["id"]]})

        assert response.status_code == 200
        assert response.json()["added"] == [a["id"], b["id"]]
        assert client.get("/api/v1/collection").json()["total"] == 2

    def test_B_UP_16_adding_twice_is_idempotent(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        (song,) = _seed(upload, 1)

        response = client.post("/api/v1/collection", json={"song_ids": [song["id"]] * 2})

        assert response.status_code == 200
        assert response.json() == {"added": [], "already_in_collection": [song["id"]]}
        assert client.get("/api/v1/collection").json()["total"] == 1

    def test_B_UP_17_unknown_id_fails_atomically(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        (song,) = _seed(upload, 1)
        client.delete(f"/api/v1/collection/{song['id']}")
        unknown = str(uuid.uuid4())

        response = client.post("/api/v1/collection", json={"song_ids": [song["id"], unknown]})

        assert response.status_code == 404
        assert response.json()["error"]["details"]["song_ids"] == [unknown]
        assert client.get("/api/v1/collection").json()["total"] == 0

    def test_empty_and_malformed_bodies_are_rejected(self, client: TestClient) -> None:
        assert client.post("/api/v1/collection", json={"song_ids": []}).status_code == 422
        assert client.post("/api/v1/collection", json={"song_ids": ["nope"]}).status_code == 422

    def test_B_UP_18_remove_keeps_the_file_in_the_pool(
        self, env: Env, upload: Callable[..., dict[str, Any]]
    ) -> None:
        (song,) = _seed(upload, 1)

        response = env.client.delete(f"/api/v1/collection/{song['id']}")

        assert response.status_code == 204
        assert env.client.get("/api/v1/collection").json()["total"] == 0
        pool = env.client.get(f"/api/v1/songs/{song['id']}").json()
        assert pool["in_collection"] is False
        assert len(env.stored_files()) == 1

    def test_removing_a_song_not_in_collection_is_404(self, client: TestClient) -> None:
        response = client.delete(f"/api/v1/collection/{uuid.uuid4()}")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_in_collection"

    def test_collection_search_and_sort(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        a, b = _seed(upload, 2)
        client.patch(f"/api/v1/songs/{a['id']}", json={"title": "Zebra"})
        client.patch(f"/api/v1/songs/{b['id']}", json={"title": "Apple"})

        listing = client.get("/api/v1/collection?sort=title").json()
        assert [s["title"] for s in listing["items"]] == ["Apple", "Zebra"]
        assert [s["title"] for s in client.get("/api/v1/collection?q=zeb").json()["items"]] == [
            "Zebra"
        ]
        assert all(s["added_at"] for s in listing["items"])


class TestEditSong:
    def test_B_UP_20_valid_edit(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        (song,) = _seed(upload, 1)

        response = client.patch(
            f"/api/v1/songs/{song['id']}",
            json={"title": "  New Title ", "artist": "New Artist", "album": ""},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "New Title"
        assert body["artist"] == "New Artist"
        assert body["album"] is None

    @pytest.mark.parametrize("title", ["", "   ", "x" * 201])
    def test_B_UP_19_invalid_title(
        self, client: TestClient, upload: Callable[..., dict[str, Any]], title: str
    ) -> None:
        (song,) = _seed(upload, 1)

        response = client.patch(f"/api/v1/songs/{song['id']}", json={"title": title})

        assert response.status_code == 422

    def test_B_UP_23_uploader_is_not_editable(
        self, client: TestClient, upload: Callable[..., dict[str, Any]]
    ) -> None:
        (song,) = _seed(upload, 1)

        response = client.patch(
            f"/api/v1/songs/{song['id']}", json={"uploaded_by": str(uuid.uuid4())}
        )

        assert response.status_code == 422
        assert client.get(f"/api/v1/songs/{song['id']}").json()["uploaded_by"] == str(LOCAL_USER_ID)

    def test_unknown_song_is_404(self, client: TestClient) -> None:
        assert client.get(f"/api/v1/songs/{uuid.uuid4()}").status_code == 404
        assert client.patch(f"/api/v1/songs/{uuid.uuid4()}", json={"title": "x"}).status_code == 404

    def test_non_uuid_id_is_422(self, client: TestClient) -> None:
        assert client.get("/api/v1/songs/not-a-uuid").status_code == 422
