"""
E2E Test Suite - NSCET Face Attendance System
Tests the complete workflow: health -> settings -> register -> recognize -> attendance -> gallery -> export
Uses session-scoped fixtures so all tests share a single in-memory database and container.
"""
from __future__ import annotations

import io
import json

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.core.config import Settings
from app.core.security import hash_password
from app.core.types import Detection
from app.alignment.aligner import ArcFaceAligner
from app.recognition.engine import RecognitionEngine
from app.services.container import Container
from tests.conftest import make_face_image

API_KEY = "test-key"


# ---- Shared session-scoped fixtures ----

class FakeDetector:
    def detect_batch(self, frames):
        out = []
        for f in frames:
            h, w = f.shape[:2]
            kps = np.array([[0.35*w, 0.4*h], [0.65*w, 0.4*h], [0.5*w, 0.55*h],
                            [0.38*w, 0.72*h], [0.62*w, 0.72*h]], np.float32)
            out.append([Detection(np.array([0.1*w, 0.1*h, 0.9*w, 0.9*h], np.float32), 0.99, kps)])
        return out


class FakeEmbedder:
    def embed(self, aligned):
        out = []
        for a in aligned:
            ident = int(np.asarray(a).reshape(-1, 3)[:, 0].mean()) // 8
            rng = np.random.default_rng(ident)
            v = rng.normal(size=512)
            v += np.random.default_rng(int(a.sum()) % 997).normal(size=512) * 0.05
            out.append(v / np.linalg.norm(v))
        return np.array(out, np.float32).reshape(len(aligned), 512)


@pytest.fixture(scope="session")
def shared_settings(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("e2e_db")
    return Settings(
        database_url=f"sqlite:///{tmp}/e2e.db",
        redis_url=None,
        api_key=API_KEY,
        snapshots_dir=str(tmp / "snaps"),
        raw_dir=str(tmp / "raw"),
        min_images=5,
        blur_threshold=10.0,
        min_face_px=50,
        cameras=[],
        low_light_threshold=0,
    )


@pytest.fixture(scope="session")
def shared_container(shared_settings):
    c = Container(shared_settings)
    engine = RecognitionEngine(
        FakeDetector(), None, ArcFaceAligner(), FakeEmbedder(), c.gallery,
        threshold=shared_settings.match_threshold, low_light_threshold=0,
    )
    c._engine = engine
    return c


@pytest.fixture(scope="session")
def e2e_client(shared_container):
    return TestClient(create_app(shared_container), headers={"X-API-Key": API_KEY})


# ---- Helpers ----

def _jpg(identity, seed):
    ok, buf = cv2.imencode(".jpg", make_face_image(identity, seed), [cv2.IMWRITE_JPEG_QUALITY, 95])
    return buf.tobytes()


def _files(identity, n=5, start=0):
    return [("files", (f"{i}.jpg", io.BytesIO(_jpg(identity, start + i)), "image/jpeg")) for i in range(n)]


# ---- Test Class (ordered) ----

class TestE2EWorkflow:
    """End-to-end test of the entire attendance workflow in sequential order."""

    def test_01_health_endpoint(self, e2e_client):
        """System health check returns correct status and college branding."""
        res = e2e_client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["database"] is True
        assert data["status"] == "ok"
        assert data["college"] == "NSCET"
        assert data["gallery_size"] == 0
        assert "persons" in data
        assert data["models_loaded"] is True
        print(f"  [PASS] Health OK: db={data['database']}, gallery={data['gallery_size']}, persons={data['persons']}")

    def test_02_college_config_endpoint(self, e2e_client):
        """College branding and config endpoint returns institutional metadata."""
        res = e2e_client.get("/college/config")
        assert res.status_code == 200
        data = res.json()
        assert "college_name" in data
        assert "programs" in data
        print(f"  [PASS] College config: {data.get('short_name', 'N/A')}")

    def test_03_settings_get_defaults(self, e2e_client):
        """GET /settings returns valid default values."""
        res = e2e_client.get("/settings")
        assert res.status_code == 200
        data = res.json()
        assert "match_threshold" in data
        assert "duplicate_threshold" in data
        assert "confirm_frames" in data
        assert "attendance_cooldown_s" in data
        assert "min_checkout_gap_min" in data
        assert "late_cutoff" in data
        assert "default_mode" in data
        assert "cameras" in data
        assert isinstance(data["cameras"], list)
        print(f"  [PASS] Settings defaults: threshold={data['match_threshold']}, cooldown={data['attendance_cooldown_s']}s")

    def test_04_settings_update_and_persist(self, e2e_client):
        """PUT /settings updates system values and returns them."""
        new_settings = {
            "match_threshold": 0.48,
            "duplicate_threshold": 0.68,
            "confirm_frames": 4,
            "attendance_cooldown_s": 600,
            "min_checkout_gap_min": 90,
            "late_cutoff": "09:30",
            "default_mode": "auto",
            "cameras": [
                {"id": "cam-test-1", "name": "Test Kiosk", "url": "0", "mode": "auto"},
                {"id": "cam-test-2", "name": "Test RTSP", "url": "rtsp://test:test@192.168.1.1:554/live", "mode": "check_in"},
            ],
        }
        res = e2e_client.put("/settings", json=new_settings)
        assert res.status_code == 200
        data = res.json()
        assert data["match_threshold"] == 0.48
        assert data["confirm_frames"] == 4
        assert data["attendance_cooldown_s"] == 600
        assert data["late_cutoff"] == "09:30"
        assert len(data["cameras"]) == 2
        assert data["cameras"][0]["id"] == "cam-test-1"
        assert data["cameras"][1]["mode"] == "check_in"

        # Verify re-reading returns persisted values
        res2 = e2e_client.get("/settings")
        data2 = res2.json()
        assert data2["match_threshold"] == 0.48
        assert data2["late_cutoff"] == "09:30"
        print(f"  [PASS] Settings updated & persisted: threshold={data['match_threshold']}, cams={len(data['cameras'])}")

    def test_05_auth_required_for_persons(self, e2e_client):
        """API key authentication is enforced on protected endpoints."""
        no_key = e2e_client.get("/persons", headers={"X-API-Key": "wrong-key"})
        assert no_key.status_code == 401
        empty_key = e2e_client.get("/persons", headers={"X-API-Key": ""})
        assert empty_key.status_code == 401
        print("  [PASS] Auth enforcement: unauthorized requests correctly blocked")

    def test_06_register_first_person(self, e2e_client):
        """Register person 1: Alice (BE, CSE) with 5 face images."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "22CSR001", "name": "Alice Priya", "degree": "BE", "department": "CSE"},
            files=_files(3),
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["accepted_images"] == 5
        assert data["person"]["name"] == "Alice Priya"
        assert data["person"]["degree"] == "BE"
        assert data["person"]["department"] == "CSE"
        print(f"  [PASS] Person registered: {data['person']['name']} (ID={data['person']['id']})")

    def test_07_register_second_person(self, e2e_client):
        """Register person 2: Bob (B.Tech, AIDS) with 5 face images."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "22AIR002", "name": "Bob Kumar", "degree": "B.Tech", "department": "AIDS"},
            files=_files(11),
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["accepted_images"] == 5
        assert data["person"]["department"] == "AIDS"
        print(f"  [PASS] Person registered: {data['person']['name']} (ID={data['person']['id']})")

    def test_08_duplicate_face_rejected(self, e2e_client):
        """Same face under different code is rejected (duplicate detection)."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "22CSR099", "name": "Alice Duplicate", "degree": "BE", "department": "CSE"},
            files=_files(3, start=100),
        )
        assert res.status_code == 409
        print("  [PASS] Duplicate face correctly rejected (HTTP 409)")

    def test_09_duplicate_code_rejected(self, e2e_client):
        """Same register code re-used is rejected (code conflict)."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "22CSR001", "name": "Another Person", "degree": "BE", "department": "CSE"},
            files=_files(20),
        )
        assert res.status_code == 409
        print("  [PASS] Duplicate code correctly rejected (HTTP 409)")

    def test_10_too_few_images_rejected(self, e2e_client):
        """Registration with too few images (< min_images) fails."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "22CSR050", "name": "Few Images", "degree": "BE", "department": "CSE"},
            files=_files(25, n=2),
        )
        assert res.status_code == 422
        print("  [PASS] Too few images correctly rejected (HTTP 422)")

    def test_11_invalid_department_rejected(self, e2e_client):
        """Invalid degree-department combination is rejected."""
        res = e2e_client.post(
            "/persons/register",
            data={"code": "INV001", "name": "Invalid Dept", "degree": "BE", "department": "AIDS"},
            files=_files(40),
        )
        assert res.status_code == 422
        print("  [PASS] Invalid degree-department combination rejected (HTTP 422)")

    def test_12_list_persons(self, e2e_client):
        """List all registered persons."""
        res = e2e_client.get("/persons")
        assert res.status_code == 200
        persons = res.json()
        assert len(persons) == 2
        names = {p["name"] for p in persons}
        assert "Alice Priya" in names
        assert "Bob Kumar" in names
        print(f"  [PASS] Persons listed: {len(persons)} enrolled ({', '.join(sorted(names))})")

    def test_13_recognize_known_face(self, e2e_client):
        """Recognize a known enrolled face and mark check-in attendance."""
        res = e2e_client.post(
            "/recognize?mark=true&camera_id=gate1",
            files={"file": ("face.jpg", io.BytesIO(_jpg(3, 500)), "image/jpeg")},
        )
        assert res.status_code == 200, res.text
        face = res.json()["faces"][0]
        assert face["status"] == "match"
        assert face["person_id"] is not None
        assert face["marked"] == "check_in"
        assert face["score"] > 0
        print(f"  [PASS] Face recognized: person_id={face['person_id']}, score={face['score']:.4f}, marked={face['marked']}")

    def test_14_recognize_unknown_face(self, e2e_client):
        """Unknown face returns 'unknown' status."""
        res = e2e_client.post(
            "/recognize",
            files={"file": ("face.jpg", io.BytesIO(_jpg(29, 7)), "image/jpeg")},
        )
        assert res.status_code == 200
        face = res.json()["faces"][0]
        assert face["status"] == "unknown"
        assert face["person_id"] is None
        print("  [PASS] Unknown face correctly identified as 'unknown'")

    def test_15_bad_image_rejected(self, e2e_client):
        """Corrupt / non-image file returns 400."""
        res = e2e_client.post(
            "/recognize",
            files={"file": ("bad.jpg", io.BytesIO(b"not an image at all"), "image/jpeg")},
        )
        assert res.status_code == 400
        print("  [PASS] Corrupt image correctly rejected (HTTP 400)")

    def test_16_attendance_records(self, e2e_client):
        """Query attendance records for the recognized person."""
        persons = e2e_client.get("/persons").json()
        alice = next(p for p in persons if p["name"] == "Alice Priya")

        res = e2e_client.get("/attendance", params={"person_id": alice["id"]})
        assert res.status_code == 200
        records = res.json()
        assert len(records) >= 1
        assert records[0]["person_name"] == "Alice Priya"
        assert records[0]["person_code"] == "22CSR001"
        assert records[0]["degree"] == "BE"
        assert records[0]["department"] == "CSE"
        assert records[0]["kind"] == "check_in"
        assert records[0]["camera_id"] == "gate1"
        print(f"  [PASS] Attendance records: {len(records)} event(s) for {records[0]['person_name']}")

    def test_17_attendance_filter_by_camera(self, e2e_client):
        """Filtering by non-existing camera returns empty results."""
        res = e2e_client.get("/attendance", params={"camera_id": "nonexistent-cam"})
        assert res.status_code == 200
        assert res.json() == []
        print("  [PASS] Camera filter: non-existing camera returns empty list")

    def test_18_export_csv(self, e2e_client):
        """CSV export contains college name, proper column headers, and attendance data."""
        res = e2e_client.get("/attendance/export?format=csv")
        assert res.status_code == 200
        text = res.text
        assert "Nadar Saraswathi College of Engineering and Technology" in text
        assert "Register No. / Staff ID" in text
        assert "Alice Priya" in text
        print("  [PASS] CSV export: college branding + data verified")

    def test_19_export_xlsx(self, e2e_client):
        """XLSX export produces valid ZIP-based Office Open XML file."""
        res = e2e_client.get("/attendance/export?format=xlsx")
        assert res.status_code == 200
        assert res.content[:2] == b"PK"
        print(f"  [PASS] XLSX export: {len(res.content)} bytes, valid ZIP format")

    def test_20_gallery_rebuild(self, e2e_client):
        """Gallery rebuild re-indexes face vectors from encrypted database."""
        res = e2e_client.post("/gallery/rebuild")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "gallery_size" in data
        assert data["gallery_size"] > 0
        assert "persons" in data
        assert data["persons"] == 2
        print(f"  [PASS] Gallery rebuilt: {data['gallery_size']} vectors, {data['persons']} persons")

    def test_21_health_after_gallery_rebuild(self, e2e_client):
        """Health endpoint reflects gallery and persons count after rebuild."""
        res = e2e_client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["gallery_size"] > 0
        assert data["persons"] == 2
        print(f"  [PASS] Health post-rebuild: gallery={data['gallery_size']}, persons={data['persons']}")

    def test_22_update_person(self, e2e_client):
        """Update person's name and department."""
        persons = e2e_client.get("/persons").json()
        alice = next(p for p in persons if p["name"] == "Alice Priya")

        res = e2e_client.put(f"/persons/{alice['id']}", json={"name": "Alice Priya R", "degree": "BE", "department": "ECE"})
        assert res.status_code == 200
        assert res.json()["name"] == "Alice Priya R"
        assert res.json()["department"] == "ECE"
        print(f"  [PASS] Person updated: {res.json()['name']}, dept={res.json()['department']}")

    def test_23_jwt_auth_flow(self, e2e_client, shared_container):
        """Full JWT authentication: create user -> login -> /me -> domain enforcement."""
        shared_container.repo.create_user(
            email="faculty@nscet.edu.in",
            hashed_password=hash_password("SecurePass2026"),
            full_name="Prof. Raman K",
            role="faculty",
        )

        login_res = e2e_client.post("/auth/login", json={"email": "faculty@nscet.edu.in", "password": "SecurePass2026"})
        assert login_res.status_code == 200, login_res.text
        token_data = login_res.json()
        assert "access_token" in token_data
        assert token_data["user"]["role"] == "faculty"
        token = token_data["access_token"]

        me_res = e2e_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "faculty@nscet.edu.in"

        bad_domain = e2e_client.post("/auth/login", json={"email": "hacker@gmail.com", "password": "pass123"})
        assert bad_domain.status_code == 422
        assert "nscet.edu.in" in bad_domain.text
        print("  [PASS] JWT auth flow complete: login + /me + domain enforcement")

    def test_24_delete_person(self, e2e_client):
        """Delete a person removes them from the system."""
        persons = e2e_client.get("/persons").json()
        bob = next(p for p in persons if "Bob" in p["name"])

        res = e2e_client.delete(f"/persons/{bob['id']}")
        assert res.status_code == 204

        get_res = e2e_client.get(f"/persons/{bob['id']}")
        assert get_res.status_code == 404

        remaining = e2e_client.get("/persons").json()
        assert len(remaining) == 1
        print(f"  [PASS] Person deleted: Bob (remaining={len(remaining)})")

    def test_25_settings_reset_to_defaults(self, e2e_client):
        """Reset settings back to reasonable defaults."""
        default_settings = {
            "match_threshold": 0.45,
            "duplicate_threshold": 0.65,
            "confirm_frames": 3,
            "attendance_cooldown_s": 300,
            "min_checkout_gap_min": 60,
            "late_cutoff": "09:15",
            "default_mode": "auto",
            "cameras": [],
        }
        res = e2e_client.put("/settings", json=default_settings)
        assert res.status_code == 200
        data = res.json()
        assert data["match_threshold"] == 0.45
        assert data["confirm_frames"] == 3
        print("  [PASS] Settings reset to defaults")

    def test_26_final_system_integrity_check(self, e2e_client):
        """Final comprehensive health check verifying all components are consistent."""
        health = e2e_client.get("/health").json()
        settings = e2e_client.get("/settings").json()
        persons = e2e_client.get("/persons").json()

        assert health["database"] is True
        assert health["status"] == "ok"
        assert health["college"] == "NSCET"
        assert health["persons"] == len(persons)
        assert settings["match_threshold"] == 0.45

        print("  [PASS] FINAL INTEGRITY CHECK PASSED")
        print(f"    |- Database: Connected={health['database']}")
        print(f"    |- Status: {health['status']}")
        print(f"    |- Gallery: {health['gallery_size']} vectors")
        print(f"    |- Persons: {health['persons']} enrolled")
        print(f"    |- Threshold: {settings['match_threshold']}")
        print(f"    |- College: {health['college']}")
