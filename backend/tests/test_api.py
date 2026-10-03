import io

import cv2

from app.core.security import hash_password
from tests.conftest import make_face_image


def _jpg(identity, seed):
    ok, buf = cv2.imencode(".jpg", make_face_image(identity, seed), [cv2.IMWRITE_JPEG_QUALITY, 95])
    return buf.tobytes()


def _files(identity, n=5, start=0):
    return [("files", (f"{i}.jpg", io.BytesIO(_jpg(identity, start + i)), "image/jpeg")) for i in range(n)]


def test_health_open_and_auth_required(client):
    res = client.get("/health").json()
    assert res["database"] is True
    assert res["college"] == "NSCET"
    assert client.get("/persons", headers={"X-API-Key": "bad"}).status_code == 401
    assert client.get("/persons", headers={"X-API-Key": ""}).status_code == 401


def test_register_recognize_attendance_flow(client):
    r = client.post(
        "/persons/register",
        data={"code": "E1", "name": "Alice", "degree": "BE", "department": "CSE"},
        files=_files(3),
    )
    assert r.status_code == 201, r.text
    assert r.json()["accepted_images"] == 5
    assert r.json()["person"]["degree"] == "BE"
    assert r.json()["person"]["department"] == "CSE"
    pid = r.json()["person"]["id"]

    # different identity registers fine
    assert client.post(
        "/persons/register",
        data={"code": "E2", "name": "Bob", "degree": "B.Tech", "department": "AIDS"},
        files=_files(11),
    ).status_code == 201

    # same face, new code -> duplicate rejected
    dup = client.post("/persons/register", data={"code": "E3", "name": "Alice2", "degree": "BE", "department": "CSE"}, files=_files(3, start=100))
    assert dup.status_code == 409

    # same code -> conflict
    assert client.post("/persons/register", data={"code": "E1", "name": "x", "degree": "BE", "department": "CSE"}, files=_files(20)).status_code == 409

    # too few images -> 422
    few = client.post("/persons/register", data={"code": "E9", "name": "Z", "degree": "BE", "department": "CSE"}, files=_files(25, n=2))
    assert few.status_code == 422

    assert len(client.get("/persons").json()) == 2

    rec = client.post("/recognize?mark=true&camera_id=gate1",
                      files={"file": ("a.jpg", io.BytesIO(_jpg(3, 500)), "image/jpeg")})
    assert rec.status_code == 200, rec.text
    face = rec.json()["faces"][0]
    assert face["person_id"] == pid and face["status"] == "match" and face["marked"] == "check_in"

    unknown = client.post("/recognize", files={"file": ("a.jpg", io.BytesIO(_jpg(29, 7)), "image/jpeg")})
    assert unknown.json()["faces"][0]["status"] == "unknown"

    rows = client.get("/attendance", params={"person_id": pid}).json()
    assert len(rows) == 1 and rows[0]["person_name"] == "Alice"
    assert rows[0]["degree"] == "BE" and rows[0]["department"] == "CSE"
    assert client.get("/attendance", params={"camera_id": "nope"}).json() == []

    # Test export contains college name and clean columns
    csv = client.get("/attendance/export?format=csv")
    assert csv.status_code == 200
    assert "Nadar Saraswathi College of Engineering and Technology" in csv.text
    assert "Register No. / Staff ID" in csv.text
    assert "Alice" in csv.text

    xlsx = client.get("/attendance/export?format=xlsx")
    assert xlsx.content[:2] == b"PK"


def test_degree_department_strict_validation(client):
    # Invalid department for degree -> 422
    bad1 = client.post(
        "/persons/register",
        data={"code": "INV1", "name": "Test", "degree": "BE", "department": "AIDS"},  # AIDS is only B.Tech
        files=_files(40),
    )
    assert bad1.status_code == 422

    # Unrecognized department -> 422
    bad2 = client.post(
        "/persons/register",
        data={"code": "INV2", "name": "Test", "degree": "BE", "department": "PHYSICS"},
        files=_files(41),
    )
    assert bad2.status_code == 422


def test_jwt_auth_and_email_domain(client, container):
    # Setup test user
    container.repo.create_user(
        email="faculty@nscet.edu.in",
        hashed_password=hash_password("FacultyPass123"),
        full_name="Prof. Raman",
        role="faculty",
    )

    # Login with valid college email
    resp = client.post("/auth/login", json={"email": "faculty@nscet.edu.in", "password": "FacultyPass123"})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    assert token and resp.json()["user"]["role"] == "faculty"

    # Authenticated request with Bearer token
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "faculty@nscet.edu.in"

    # Non-college domain rejected -> 422
    bad_domain = client.post("/auth/login", json={"email": "hacker@gmail.com", "password": "password123"})
    assert bad_domain.status_code == 422
    assert "restricted to official @nscet.edu.in" in bad_domain.text


def test_update_delete_person(client):
    pid = client.post(
        "/persons/register",
        data={"code": "E1", "name": "Alice", "degree": "BE", "department": "CSE"},
        files=_files(3),
    ).json()["person"]["id"]
    assert client.put(f"/persons/{pid}", json={"name": "Alicia", "degree": "BE", "department": "ECE"}).json()["department"] == "ECE"
    assert client.delete(f"/persons/{pid}").status_code == 204
    assert client.get(f"/persons/{pid}").status_code == 404


def test_bad_image_recognize(client):
    r = client.post("/recognize", files={"file": ("a.jpg", io.BytesIO(b"not an image"), "image/jpeg")})
    assert r.status_code == 400
