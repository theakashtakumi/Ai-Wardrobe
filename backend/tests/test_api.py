import asyncio
import io
import sqlite3

import httpx
import pytest
from fastapi import HTTPException

from app import main


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.sqlite3")
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path / "uploads")
    main.UPLOAD_DIR.mkdir()
    main.initialize()
    return tmp_path


async def register(client, email="wardrobe@example.com"):
    response = await client.post("/auth/register", json={"email": email, "password": "secure-pass-123", "name": "Taylor"})
    assert response.status_code == 200, response.text
    return response.json()["token"]


async def upload(client, name, category, color):
    image = b"\x89PNG\r\n\x1a\n" + b"wardrobe-test"
    response = await client.post("/wardrobe", data={"name": name, "category": category, "color": color, "analyze": "false"}, files={"file": ("piece.png", io.BytesIO(image), "image/png")})
    assert response.status_code == 201, response.text
    return response.json()


def run(coro):
    return asyncio.run(coro)


def test_private_wardrobe_outfits_and_persistence(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            owner_token = await register(client)
            top = await upload(client, "Linen shirt", "Shirt", "White")
            bottom = await upload(client, "Wide leg trousers", "Trousers", "Navy")

            assert (await client.get("/health")).json()["database"] == "connected"
            assert len((await client.get("/wardrobe")).json()) == 2
            assert len((await client.get("/wardrobe", params={"search": "linen"})).json()) == 1
            assert (await client.get(top["image_url"])).status_code == 200

            updated = await client.patch(f"/wardrobe/{top['id']}", json={"favorite": True, "style": "Classic"})
            assert updated.status_code == 200
            assert updated.json()["favorite"] is True
            assert [item["id"] for item in (await client.get("/wardrobe", params={"favorite": True})).json()] == [top["id"]]
            assert [item["id"] for item in (await client.get("/wardrobe", params={"favorite": False})).json()] == [bottom["id"]]
            assert (await client.get("/recommendations", params={"occasion": "Work"})).json()["recommendations"]

            outfit = await client.post("/outfits", json={"name": "Easy workday", "occasion": "Work", "item_ids": [top["id"], bottom["id"]]})
            assert outfit.status_code == 201
            assert len((await client.get("/outfits")).json()[0]["items"]) == 2
            assert (await client.post("/feedback", json={"outfit_id": outfit.json()["id"], "rating": 5, "note": "Comfortable"})).status_code == 201
            assert (await client.put("/preferences", json={"styles": ["Classic"], "colors": [], "occasions": ["Work"]})).status_code == 200

            async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
                other_token = await register(other, "other@example.com")
                headers = {"Authorization": f"Bearer {other_token}"}
                assert (await other.get(f"/wardrobe/{top['id']}", headers=headers)).status_code == 404
                assert (await other.get(top["image_url"], headers=headers)).status_code == 404
            assert (await client.get(f"/wardrobe/{top['id']}", headers={"Authorization": f"Bearer {owner_token}"})).status_code == 200

            with main.db() as connection:
                assert connection.execute("SELECT COUNT(*) FROM clothing").fetchone()[0] == 2
            # A fresh SQLite connection models persistence across a backend process restart.
            reopened = main.connect()
            try:
                assert reopened.execute("SELECT COUNT(*) FROM clothing").fetchone()[0] == 2
                assert reopened.execute("SELECT COUNT(*) FROM feedback").fetchone()[0] == 1
            finally:
                reopened.close()
            assert (await client.delete(f"/wardrobe/{bottom['id']}")).status_code == 200
            assert len((await client.get("/wardrobe")).json()) == 1
    run(scenario())


def test_auth_validation_and_upload_validation(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/wardrobe")).status_code == 401
            assert (await client.post("/auth/register", json={"email": "bad", "password": "short"})).status_code == 422
            await register(client)
            bad = await client.post("/wardrobe", data={"name": "bad"}, files={"file": ("text.txt", b"not image", "text/plain")})
            assert bad.status_code == 415
            missing_file = await client.post("/wardrobe", data={"name": "No photo", "category": "Shirt"})
            assert missing_file.status_code == 422
            assert isinstance(missing_file.json()["detail"], list)
            invalid_field = await client.post("/wardrobe", data={"name": "Bad analysis flag", "analyze": "sometimes"}, files={"file": ("piece.png", io.BytesIO(b"\x89PNG\r\n\x1a\nbody"), "image/png")})
            assert invalid_field.status_code == 422
            assert (await client.post("/auth/login", json={"email": "wardrobe@example.com", "password": "wrong-pass"})).status_code == 401
    run(scenario())


def test_login_me_and_logout_revoke_session(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            login = await client.post("/auth/login", json={"email": "WARDROBE@example.com", "password": "secure-pass-123"})
            assert login.status_code == 200
            token = login.json()["token"]
            headers = {"Authorization": f"Bearer {token}"}
            assert (await client.get("/auth/me", headers=headers)).json()["email"] == "wardrobe@example.com"
            assert (await client.post("/auth/logout", headers=headers)).status_code == 200
            assert (await client.get("/auth/me", headers=headers)).status_code == 401
    run(scenario())


def test_style_profile_validation_isolation_and_recommendation_scoring(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            styled_top = await upload(client, "Minimal red shirt", "Shirt", "Red")
            await client.patch(f"/wardrobe/{styled_top['id']}", json={"style": "Minimal"})
            await upload(client, "Blue shirt", "Shirt", "Blue")
            await upload(client, "Black trousers", "Trousers", "Black")
            await upload(client, "Cream jeans", "Jeans", "Cream")

            before = (await client.get("/recommendations")).json()["recommendations"]
            assert before
            preferences = {"styles": ["Minimal"], "colors": ["Cream"], "avoid_colors": [], "neutral_colors": ["Black"], "accent_colors": ["Cream"], "occasions": ["Work"], "seasons": ["Winter"], "fit": "Relaxed", "layering": True, "comfort_formality": 25, "variety": 80, "cold_layering": True}
            saved = await client.put("/preferences", json=preferences)
            assert saved.status_code == 200
            loaded = (await client.get("/preferences")).json()
            assert loaded["styles"] == ["Minimal"] and loaded["avoid_colors"] == []
            liked = (await client.get("/recommendations")).json()["recommendations"]
            preferences["avoid_colors"] = ["Red"]
            assert (await client.put("/preferences", json=preferences)).status_code == 200
            assert (await client.get("/preferences")).json()["avoid_colors"] == ["Red"]
            after = (await client.get("/recommendations")).json()["recommendations"]
            scores_before = {tuple(sorted(item["id"] for item in combo["items"])): combo["score"] for combo in before}
            scores_after = {tuple(sorted(item["id"] for item in combo["items"])): combo["score"] for combo in after}
            scores_liked = {tuple(sorted(item["id"] for item in combo["items"])): combo["score"] for combo in liked}
            assert any(scores_after[key] > scores_before[key] for key in scores_before)
            assert any(scores_after[key] < scores_liked[key] for key in scores_liked if any(item["color"] == "Red" for item in next(combo["items"] for combo in liked if tuple(sorted(i["id"] for i in combo["items"])) == key)))
            disliked_ids = [item["id"] for item in after[0]["items"]]
            assert (await client.post("/feedback", json={"rating": 1, "item_ids": disliked_ids})).status_code == 201
            assert (await client.post("/feedback", json={"rating": 1, "item_ids": ["not-owned"]})).status_code == 422
            preferences["exclude_disliked"] = True
            assert (await client.put("/preferences", json=preferences)).status_code == 200
            remaining = (await client.get("/recommendations")).json()["recommendations"]
            assert all(set(item["id"] for item in combo["items"]) != set(disliked_ids) for combo in remaining)
            assert (await client.put("/preferences", json={"styles": ["Unsupported"], "colors": [], "occasions": []})).status_code == 422
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
                await register(other, "profile-other@example.com")
                other_profile = (await other.get("/preferences")).json()
                assert other_profile["styles"] == [] and other_profile["avoid_colors"] == []
    run(scenario())


def test_outfit_create_update_duplicate_and_deleted_item_lifecycle(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            dress = await upload(client, "One-piece dress", "Dress", "Navy")
            created = await client.post("/outfits", json={"name": "Navy one-piece", "item_ids": [dress["id"], dress["id"]], "description": "A simple look", "provenance": "manual"})
            assert created.status_code == 201
            outfit_id = created.json()["id"]
            detail = await client.get(f"/outfits/{outfit_id}")
            assert detail.status_code == 200 and detail.json()["item_ids"] == [dress["id"]]
            updated = await client.put(f"/outfits/{outfit_id}", json={"name": "Edited look", "item_ids": [dress["id"]], "notes": "Wear with boots", "favorite": True})
            assert updated.status_code == 200 and updated.json()["favorite"] is True
            assert updated.json()["notes"] == "Wear with boots"
            assert (await client.put(f"/outfits/{outfit_id}", json={"name": "Wrong owner", "item_ids": ["unknown"]})).status_code == 422
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
                await register(other, "outfit-other@example.com")
                assert (await other.get(f"/outfits/{outfit_id}")).status_code == 404
                assert (await other.put(f"/outfits/{outfit_id}", json={"name": "Hijack", "item_ids": ["unknown"]})).status_code == 404
            assert (await client.delete(f"/wardrobe/{dress['id']}")).status_code == 200
            assert (await client.get(f"/outfits/{outfit_id}")).json()["items"] == []
            assert (await client.delete(f"/outfits/{outfit_id}")).status_code == 200
            assert (await client.get(f"/outfits/{outfit_id}")).status_code == 404
    run(scenario())


def test_authenticated_image_upload_replace_and_delete(isolated_store):
    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            first = await upload(client, "Image test", "Top", "Green")
            old_file = main.UPLOAD_DIR / first["image_url"].split("/")[-1]
            assert old_file.is_file()
            assert (await client.get(first["image_url"])).status_code == 200
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as anonymous:
                assert (await anonymous.get(first["image_url"])).status_code == 401
            with main.db() as connection:
                assert connection.execute("SELECT image_path FROM clothing WHERE id=?", (first["id"],)).fetchone()[0] == old_file.name
            replacement_bytes = b"\x89PNG\r\n\x1a\nreplacement"
            replaced = await client.put(f"/wardrobe/{first['id']}/image", files={"file": ("replacement.png", replacement_bytes, "image/png")})
            assert replaced.status_code == 200
            new_file = main.UPLOAD_DIR / replaced.json()["image_url"].split("/")[-1]
            assert new_file.is_file() and not old_file.exists()
            assert (await client.get(replaced.json()["image_url"])).content == replacement_bytes
            assert (await client.delete(f"/wardrobe/{first['id']}")).status_code == 200
            assert not new_file.exists()
            second = await upload(client, "Missing image file", "Top", "Gray")
            broken_file = main.UPLOAD_DIR / second["image_url"].split("/")[-1]
            broken_file.unlink()
            assert (await client.get(second["image_url"])).status_code == 404
    run(scenario())


def test_additive_migration_preserves_existing_profiles_and_outfits(tmp_path, monkeypatch):
    database = tmp_path / "legacy.sqlite3"
    monkeypatch.setattr(main, "DB_PATH", database)
    connection = sqlite3.connect(database)
    connection.executescript("""
      PRAGMA foreign_keys = ON;
      CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),
        styles TEXT NOT NULL DEFAULT '[]', colors TEXT NOT NULL DEFAULT '[]', occasions TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE outfits(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL, occasion TEXT, explanation TEXT, created_at TEXT NOT NULL);
      INSERT INTO users VALUES('legacy-user','legacy@example.com','Legacy','hash','salt','2026-01-01');
      INSERT INTO preferences(user_id,styles,colors,occasions) VALUES('legacy-user','["Classic"]','["Navy"]','["Work"]');
      INSERT INTO outfits VALUES('legacy-outfit','legacy-user','Saved legacy outfit','Work','Original','2026-01-02');
    """)
    connection.close()

    main.initialize()

    with main.db() as migrated:
        profile = migrated.execute("SELECT styles,colors,occasions,avoid_colors FROM preferences WHERE user_id='legacy-user'").fetchone()
        outfit = migrated.execute("SELECT name,occasion,explanation,provenance,description FROM outfits WHERE id='legacy-outfit'").fetchone()
        assert tuple(profile) == ('["Classic"]', '["Navy"]', '["Work"]', '[]')
        assert tuple(outfit) == ("Saved legacy outfit", "Work", "Original", "manual", None)


def test_manual_creation_works_without_ai_configuration(isolated_store, monkeypatch):
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)

    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            response = await client.post("/wardrobe", data={"name": "My own linen shirt", "category": "Shirt", "color": "Cream", "analyze": "true"}, files={"file": ("shirt.png", io.BytesIO(b"\x89PNG\r\n\x1a\nbody"), "image/png")})
            assert response.status_code == 201
            item = response.json()
            assert item["name"] == "My own linen shirt"
            assert item["category"] == "Shirt"
            assert item["color"] == "Cream"
            assert item["ai_provider"] is None
            assert len((await client.get("/wardrobe")).json()) == 1
    run(scenario())


def test_unavailable_optional_ai_falls_back_to_manual_creation(isolated_store, monkeypatch):
    monkeypatch.setenv("OLLAMA_MODEL", "vision-test-model")

    def unavailable(_data, _content_type):
        raise HTTPException(status_code=503, detail="Ollama is unavailable")

    monkeypatch.setattr(main, "analyze_image", unavailable)

    async def scenario():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            response = await client.post("/wardrobe", data={"name": "Manual fallback", "category": "Trousers", "color": "Olive", "analyze": "true"}, files={"file": ("trousers.png", io.BytesIO(b"\x89PNG\r\n\x1a\nbody"), "image/png")})
            assert response.status_code == 201
            item = response.json()
            assert item["name"] == "Manual fallback"
            assert item["analysis_warning"]
            assert (await client.get("/wardrobe")).json()[0]["id"] == item["id"]
    run(scenario())


def test_database_failure_does_not_leave_an_uploaded_or_saved_item(isolated_store, monkeypatch):
    original_connect = main.connect
    calls = 0

    def fail_when_persisting():
        nonlocal calls
        calls += 1
        if calls == 2:  # Auth lookup succeeds; the clothing insert fails.
            raise sqlite3.OperationalError("simulated database unavailable")
        return original_connect()

    async def scenario():
        transport = httpx.ASGITransport(app=main.app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await register(client)
            monkeypatch.setattr(main, "connect", fail_when_persisting)
            response = await client.post("/wardrobe", data={"name": "Should not persist", "analyze": "false"}, files={"file": ("piece.png", io.BytesIO(b"\x89PNG\r\n\x1a\nbody"), "image/png")})
            assert response.status_code == 500
            assert list(main.UPLOAD_DIR.iterdir()) == []
    run(scenario())
