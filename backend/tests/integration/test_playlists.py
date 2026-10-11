import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.integration.conftest import Env, distinct_wav

PL = "/api/v1/playlists"
Upload = Callable[..., dict[str, Any]]


def make_playlist(client: TestClient, name: str = "Road Trip", **extra: Any) -> dict[str, Any]:
    response = client.post(PL, json={"name": name, **extra})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def songs(upload: Upload, count: int) -> list[dict[str, Any]]:
    return [upload(distinct_wav(i), f"s{i}.wav") for i in range(count)]


def ids(items: list[dict[str, Any]]) -> list[str]:
    return [i["id"] for i in items]


def add(client: TestClient, playlist_id: str, song_ids: list[str]) -> Any:
    return client.post(f"{PL}/{playlist_id}/songs", json={"song_ids": song_ids})


class TestCreateAndList:
    def test_B_PL_01_create(self, client: TestClient) -> None:
        response = client.post(PL, json={"name": "Road Trip", "description": "Long drives"})

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Road Trip"
        assert body["description"] == "Long drives"
        assert body["songs"] == []
        assert uuid.UUID(body["id"])

    @pytest.mark.parametrize("name", ["", "   ", "x" * 101])
    def test_B_PL_02_invalid_names(self, client: TestClient, name: str) -> None:
        assert client.post(PL, json={"name": name}).status_code == 422

    def test_missing_name(self, client: TestClient) -> None:
        assert client.post(PL, json={}).status_code == 422

    def test_B_PL_04_name_is_trimmed(self, client: TestClient) -> None:
        assert make_playlist(client, "  Chill  ")["name"] == "Chill"

    @pytest.mark.parametrize("second", ["road trip", "ROAD TRIP", " Road Trip "])
    def test_B_PL_03_duplicate_name_any_case(self, client: TestClient, second: str) -> None:
        make_playlist(client, "Road Trip")

        response = client.post(PL, json={"name": second})

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "playlist_name_taken"

    def test_unicode_case_folding(self, client: TestClient) -> None:
        make_playlist(client, "Études")

        assert client.post(PL, json={"name": "éTUDES"}).status_code == 409

    def test_B_PL_08_list_has_counts_and_total_duration(
        self, client: TestClient, upload: Upload
    ) -> None:
        empty = make_playlist(client, "Empty")
        full = make_playlist(client, "Full")
        picked = songs(upload, 2)
        add(client, full["id"], ids(picked))

        listing = {p["name"]: p for p in client.get(PL).json()}

        assert listing["Empty"]["song_count"] == 0
        assert listing["Empty"]["total_duration_ms"] == 0
        assert listing["Full"]["song_count"] == 2
        assert listing["Full"]["total_duration_ms"] == sum(s["duration_ms"] for s in picked)
        assert empty["id"] != full["id"]

    def test_list_is_sorted_by_name(self, client: TestClient) -> None:
        for name in ["beta", "Alpha", "Gamma"]:
            make_playlist(client, name)

        assert [p["name"] for p in client.get(PL).json()] == ["Alpha", "beta", "Gamma"]


class TestUpdateAndDelete:
    def test_rename_and_describe(self, client: TestClient) -> None:
        pl = make_playlist(client, "Old")

        response = client.patch(f"{PL}/{pl['id']}", json={"name": "New", "description": "d"})

        assert response.status_code == 200
        assert response.json()["name"] == "New"
        assert response.json()["description"] == "d"

    def test_B_PL_05_rename_to_taken_name_conflicts_but_own_name_is_fine(
        self, client: TestClient
    ) -> None:
        make_playlist(client, "Taken")
        mine = make_playlist(client, "Mine")

        assert client.patch(f"{PL}/{mine['id']}", json={"name": "taken"}).status_code == 409
        assert client.patch(f"{PL}/{mine['id']}", json={"name": "MINE"}).status_code == 200

    def test_partial_update_keeps_other_fields(self, client: TestClient) -> None:
        pl = make_playlist(client, "Keep", description="desc")

        body = client.patch(f"{PL}/{pl['id']}", json={"name": "Kept"}).json()

        assert body["description"] == "desc"

    def test_clearing_description(self, client: TestClient) -> None:
        pl = make_playlist(client, "Keep", description="desc")

        body = client.patch(f"{PL}/{pl['id']}", json={"description": None}).json()

        assert body["description"] is None

    def test_B_PL_06_delete_keeps_songs_in_collection(
        self, client: TestClient, upload: Upload
    ) -> None:
        pl = make_playlist(client)
        picked = songs(upload, 2)
        add(client, pl["id"], ids(picked))

        assert client.delete(f"{PL}/{pl['id']}").status_code == 204

        assert client.get(f"{PL}/{pl['id']}").status_code == 404
        assert client.get("/api/v1/collection").json()["total"] == 2
        # the name is free again
        assert client.post(PL, json={"name": "Road Trip"}).status_code == 201

    def test_B_PL_07_unknown_playlist(self, client: TestClient) -> None:
        missing = uuid.uuid4()
        assert client.delete(f"{PL}/{missing}").status_code == 404
        assert client.get(f"{PL}/{missing}").status_code == 404
        assert client.patch(f"{PL}/{missing}", json={"name": "x"}).status_code == 404


class TestPlaylistSongs:
    def test_B_PS_01_added_in_request_order(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        a, b, c = songs(upload, 3)

        response = add(client, pl["id"], [c["id"], a["id"], b["id"]])

        assert response.status_code == 200
        body = response.json()
        assert body["added"] == [c["id"], a["id"], b["id"]]
        assert body["skipped"] == []
        assert ids(body["playlist"]["songs"]) == [c["id"], a["id"], b["id"]]
        assert ids(client.get(f"{PL}/{pl['id']}").json()["songs"]) == [c["id"], a["id"], b["id"]]

    def test_appending_to_existing(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        a, b, c = songs(upload, 3)
        add(client, pl["id"], [a["id"]])

        body = add(client, pl["id"], [b["id"], c["id"]]).json()

        assert ids(body["playlist"]["songs"]) == [a["id"], b["id"], c["id"]]

    def test_B_PS_02_already_present_is_skipped(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        a, b = songs(upload, 2)
        add(client, pl["id"], [a["id"]])

        body = add(client, pl["id"], [a["id"], b["id"], b["id"]]).json()

        assert body["added"] == [b["id"]]
        assert body["skipped"] == [a["id"]]
        assert ids(body["playlist"]["songs"]) == [a["id"], b["id"]]

    def test_B_PS_03_song_outside_collection_is_rejected_atomically(
        self, client: TestClient, upload: Upload
    ) -> None:
        pl = make_playlist(client)
        inside, outside = songs(upload, 2)
        client.delete(f"/api/v1/collection/{outside['id']}")

        response = add(client, pl["id"], [inside["id"], outside["id"]])

        assert response.status_code == 409
        assert response.json()["error"]["code"] == "song_not_in_collection"
        assert response.json()["error"]["details"]["song_ids"] == [outside["id"]]
        assert client.get(f"{PL}/{pl['id']}").json()["songs"] == []

    def test_B_PS_04_unknown_song_or_playlist(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        (a,) = songs(upload, 1)

        assert add(client, pl["id"], [str(uuid.uuid4())]).status_code == 404
        assert add(client, str(uuid.uuid4()), [a["id"]]).status_code == 404

    def test_empty_song_ids_is_422(self, client: TestClient) -> None:
        pl = make_playlist(client)

        assert add(client, pl["id"], []).status_code == 422

    def test_B_PS_05_remove_compacts_positions(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        a, b, c = songs(upload, 3)
        add(client, pl["id"], ids([a, b, c]))

        assert client.delete(f"{PL}/{pl['id']}/songs/{b['id']}").status_code == 204

        assert ids(client.get(f"{PL}/{pl['id']}").json()["songs"]) == [a["id"], c["id"]]
        # appending after a removal must not collide with an old position
        (d,) = [upload(distinct_wav(99), "d.wav")]
        assert add(client, pl["id"], [d["id"]]).status_code == 200

    def test_B_PS_06_remove_song_not_in_playlist(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        (a,) = songs(upload, 1)

        response = client.delete(f"{PL}/{pl['id']}/songs/{a['id']}")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_in_playlist"

    def test_B_PS_07_reorder(self, client: TestClient, upload: Upload) -> None:
        pl = make_playlist(client)
        a, b, c = songs(upload, 3)
        add(client, pl["id"], ids([a, b, c]))

        response = client.put(
            f"{PL}/{pl['id']}/songs/order", json={"song_ids": [c["id"], a["id"], b["id"]]}
        )

        assert response.status_code == 200
        assert ids(response.json()["songs"]) == [c["id"], a["id"], b["id"]]
        assert ids(client.get(f"{PL}/{pl['id']}").json()["songs"]) == [c["id"], a["id"], b["id"]]

    @pytest.mark.parametrize("variant", ["missing", "extra", "duplicate", "unknown"])
    def test_B_PS_08_invalid_reorder_changes_nothing(
        self, client: TestClient, upload: Upload, variant: str
    ) -> None:
        pl = make_playlist(client)
        a, b, c = songs(upload, 3)
        add(client, pl["id"], ids([a, b]))
        payloads = {
            "missing": [a["id"]],
            "extra": [a["id"], b["id"], c["id"]],
            "duplicate": [a["id"], a["id"]],
            "unknown": [a["id"], str(uuid.uuid4())],
        }

        response = client.put(f"{PL}/{pl['id']}/songs/order", json={"song_ids": payloads[variant]})

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_order"
        assert ids(client.get(f"{PL}/{pl['id']}").json()["songs"]) == [a["id"], b["id"]]

    def test_B_PS_10_same_song_in_two_playlists(self, client: TestClient, upload: Upload) -> None:
        one, two = make_playlist(client, "One"), make_playlist(client, "Two")
        (a,) = songs(upload, 1)
        add(client, one["id"], [a["id"]])
        add(client, two["id"], [a["id"]])

        client.delete(f"{PL}/{one['id']}/songs/{a['id']}")

        assert ids(client.get(f"{PL}/{two['id']}").json()["songs"]) == [a["id"]]

    def test_removing_from_collection_removes_from_all_playlists(
        self, client: TestClient, upload: Upload
    ) -> None:
        one, two = make_playlist(client, "One"), make_playlist(client, "Two")
        a, b, c = songs(upload, 3)
        add(client, one["id"], ids([a, b, c]))
        add(client, two["id"], ids([b]))

        client.delete(f"/api/v1/collection/{b['id']}")

        assert ids(client.get(f"{PL}/{one['id']}").json()["songs"]) == [a["id"], c["id"]]
        assert client.get(f"{PL}/{two['id']}").json()["songs"] == []
        # positions were compacted, so appending works
        assert add(client, one["id"], [b["id"]]).status_code == 409  # b not in collection now


class TestPlaybackData:
    def test_B_PD_01_detail_has_ordered_songs_with_resolvable_stream_urls(
        self, env: Env, upload: Upload
    ) -> None:
        pl = make_playlist(env.client)
        a, b = songs(upload, 2)
        add(env.client, pl["id"], [b["id"], a["id"]])

        detail = env.client.get(f"{PL}/{pl['id']}").json()

        assert ids(detail["songs"]) == [b["id"], a["id"]]
        for song in detail["songs"]:
            stream = env.client.get(song["stream_url"], headers={"Range": "bytes=0-9"})
            assert stream.status_code == 206
            assert song["in_collection"] is True

    def test_B_PD_02_empty_playlist(self, client: TestClient) -> None:
        pl = make_playlist(client)

        assert client.get(f"{PL}/{pl['id']}").json()["songs"] == []
