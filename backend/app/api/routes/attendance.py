from __future__ import annotations

import io
from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.deps import get_container, require_faculty_or_admin
from app.core.college import COLLEGE_NAME, validate_program
from app.schemas.schemas import AttendanceOut
from app.services.container import Container

router = APIRouter(prefix="/attendance", tags=["attendance"], dependencies=[Depends(require_faculty_or_admin)])


@router.get("", response_model=list[AttendanceOut])
def list_attendance(
    response: Response,
    start: date | None = None,
    end: date | None = None,
    person_id: int | None = None,
    camera_id: str | None = None,
    kind: Literal["check_in", "check_out"] | None = None,
    degree: str | None = None,
    department: str | None = None,
    year: int | None = Query(None, ge=1, le=4),
    limit: int = Query(500, le=5000),
    offset: int = 0,
    c: Container = Depends(get_container),
):
    if degree or department:
        is_valid, err_msg = validate_program(degree, department)
        if not is_valid:
            raise HTTPException(status_code=422, detail=err_msg)

    total_count = c.repo.count_attendance(
        start=start,
        end=end,
        person_id=person_id,
        camera_id=camera_id,
        kind=kind,
        degree=degree,
        department=department,
        year=year,
    )
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    return c.repo.query_attendance(
        start=start,
        end=end,
        person_id=person_id,
        camera_id=camera_id,
        kind=kind,
        degree=degree,
        department=department,
        year=year,
        limit=limit,
        offset=offset,
    )


@router.get("/daily-counts")
def daily_counts(
    start: date,
    end: date,
    degree: str | None = None,
    department: str | None = None,
    year: int | None = Query(None, ge=1, le=4),
    c: Container = Depends(get_container),
):
    if degree or department:
        is_valid, err_msg = validate_program(degree, department)
        if not is_valid:
            raise HTTPException(status_code=422, detail=err_msg)

    return [
        {"date": d.isoformat(), "present": n}
        for d, n in c.repo.daily_counts(start, end, degree=degree, department=department, year=year)
    ]


@router.get("/export")
def export(
    format: Literal["csv", "xlsx"] = "csv",
    start: date | None = None,
    end: date | None = None,
    person_id: int | None = None,
    camera_id: str | None = None,
    degree: str | None = None,
    department: str | None = None,
    year: int | None = Query(None, ge=1, le=4),
    c: Container = Depends(get_container),
):
    if degree or department:
        is_valid, err_msg = validate_program(degree, department)
        if not is_valid:
            raise HTTPException(status_code=422, detail=err_msg)

    rows = c.repo.query_attendance(
        start=start,
        end=end,
        person_id=person_id,
        camera_id=camera_id,
        kind=None,
        degree=degree,
        department=department,
        year=year,
        limit=100000,
        offset=0,
    )
    tz = ZoneInfo(c.settings.timezone)

    # Format human-readable data with official institutional column labels
    formatted_rows = []
    for r in rows:
        ts_str = r["timestamp"].astimezone(tz).strftime("%Y-%m-%d %I:%M:%S %p") if r.get("timestamp") else "—"
        conf_str = f"{r['confidence'] * 100:.1f}%" if r.get("confidence") is not None else "—"
        status_label = "Check-In" if r.get("kind") == "check_in" else "Check-Out"
        year_str = f"Year {r['year']}" if r.get("year") else "—"
        formatted_rows.append({
            "Attendance ID": r["id"],
            "Register No. / Staff ID": r.get("person_code", "—"),
            "Full Name": r.get("person_name", "—"),
            "Degree": r.get("degree") or "—",
            "Department": r.get("department") or "—",
            "Academic Year": year_str,
            "Attendance Status": status_label,
            "Date": str(r.get("date", "—")),
            "Time (IST)": ts_str,
            "Entrance / Gate": r.get("camera_id", "—"),
            "Verification Confidence": conf_str,
        })

    df = pd.DataFrame(formatted_rows)
    if df.empty:
        df = pd.DataFrame(columns=[
            "Attendance ID", "Register No. / Staff ID", "Full Name", "Degree", "Department",
            "Academic Year", "Attendance Status", "Date", "Time (IST)", "Entrance / Gate", "Verification Confidence",
        ])

    file_prefix = f"NSCET_Attendance_{date.today().isoformat()}"

    if format == "csv":
        csv_content = f"# {COLLEGE_NAME} — Attendance Report\n" + df.to_csv(index=False)
        return Response(
            csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={file_prefix}.csv"},
        )

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Attendance Log")
        ws = writer.sheets["Attendance Log"]
        # Insert college header title row
        ws.insert_rows(1)
        ws.cell(row=1, column=1, value=f"{COLLEGE_NAME} — Attendance Report")

    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={file_prefix}.xlsx"},
    )
