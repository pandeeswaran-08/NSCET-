from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_container, require_admin, require_faculty_or_admin
from app.core.college import validate_program
from app.schemas.schemas import PersonOut, PersonUpdate, RegisterResponse
from app.services.container import Container
from app.utils.image import decode_image

router = APIRouter(prefix="/persons", tags=["persons"])
MAX_BYTES = 10 * 1024 * 1024


@router.post("/register", response_model=RegisterResponse, status_code=201, dependencies=[Depends(require_admin)])
async def register(
    code: str = Form(..., min_length=1, max_length=64),
    name: str = Form(..., min_length=1, max_length=128),
    degree: str | None = Form(None),
    department: str | None = Form(None),
    year: int | None = Form(None),
    files: list[UploadFile] = File(...),
    c: Container = Depends(get_container),
):
    # Strict validation of degree and department
    is_valid, err_msg = validate_program(degree, department)
    if not is_valid:
        raise HTTPException(status_code=422, detail=err_msg)

    if year is not None and year not in (1, 2, 3, 4):
        raise HTTPException(status_code=422, detail="Academic year must be between 1 and 4.")

    raw: list[bytes] = []
    for f in files:
        data = await f.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{f.filename}: file larger than 10MB")
        raw.append(data)

    images = []
    for data in raw:
        try:
            images.append(decode_image(data))
        except ValueError:
            images.append(None)

    res = await run_in_threadpool(
        c.registration.register,
        code.strip(),
        name.strip(),
        degree.strip() if degree else None,
        department.strip() if department else None,
        year,
        images,
        raw,
    )
    return RegisterResponse(
        person=PersonOut.model_validate(res.person),
        accepted_images=res.accepted,
        rejected_images=res.rejected,
    )


@router.get("", response_model=list[PersonOut], dependencies=[Depends(require_faculty_or_admin)])
def list_persons(active_only: bool = False, limit: int = 500, offset: int = 0, c: Container = Depends(get_container)):
    return c.repo.list_persons(active_only, min(limit, 1000), offset)


@router.get("/{person_id}", response_model=PersonOut, dependencies=[Depends(require_faculty_or_admin)])
def get_person(person_id: int, c: Container = Depends(get_container)):
    return c.repo.get_person(person_id)


@router.put("/{person_id}", response_model=PersonOut, dependencies=[Depends(require_admin)])
def update_person(person_id: int, body: PersonUpdate, c: Container = Depends(get_container)):
    # Strict validation of degree and department if modified
    if body.degree is not None or body.department is not None:
        current_person = c.repo.get_person(person_id)
        effective_degree = body.degree if body.degree is not None else current_person.degree
        effective_dept = body.department if body.department is not None else current_person.department
        is_valid, err_msg = validate_program(effective_degree, effective_dept)
        if not is_valid:
            raise HTTPException(status_code=422, detail=err_msg)

    p = c.repo.update_person(person_id, **body.model_dump(exclude_unset=True))
    c.gallery.rebuild()
    return p


@router.delete("/{person_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_person(person_id: int, c: Container = Depends(get_container)):
    c.repo.delete_person(person_id)
    c.gallery.rebuild()
