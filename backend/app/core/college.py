"""College branding configuration, degree & department taxonomy, and system processes."""
from __future__ import annotations

from enum import Enum
from typing import Any

COLLEGE_NAME = "Nadar Saraswathi College of Engineering and Technology, Theni"
COLLEGE_SHORT_NAME = "NSCET"
COLLEGE_LOCATION = "Theni, Tamil Nadu, India"
COLLEGE_LOGO_PATH = "/assets/college-logo.png"
COLLEGE_PAGE_TITLE = "Nadar Saraswathi College of Engineering and Technology — Face Attendance"

class DegreeEnum(str, Enum):
    BE = "BE"
    BTECH = "B.Tech"


# College Degree -> Department Mapping (Single Source of Truth)
COLLEGE_PROGRAMS: dict[str, list[str]] = {
    "BE": ["CSE", "CIVIL", "MECH", "ECE", "EEE"],
    "B.Tech": ["IT", "AIDS"],
}

# Set of valid (degree, department) pairs
VALID_DEGREE_DEPARTMENTS: set[tuple[str, str]] = {
    (degree, dept)
    for degree, departments in COLLEGE_PROGRAMS.items()
    for dept in departments
}

# The 8 standardized system processes for clean user-facing status
SYSTEM_PROCESSES: list[dict[str, str]] = [
    {
        "name": "Face Detection",
        "description": "finds faces in the camera frame",
        "label": "Face Detection — finds faces in the camera frame",
    },
    {
        "name": "Face Alignment & Quality Check",
        "description": "straightens the face and rejects blurry, dark, or tilted images",
        "label": "Face Alignment & Quality Check — straightens the face and rejects blurry, dark, or tilted images",
    },
    {
        "name": "Face Recognition",
        "description": "matches the face with enrolled identities",
        "label": "Face Recognition — matches the face with enrolled identities",
    },
    {
        "name": "Face Tracking & Confirmation",
        "description": "confirms identity across consecutive frames",
        "label": "Face Tracking & Confirmation — confirms identity across consecutive frames",
    },
    {
        "name": "Liveness Check",
        "description": "verifies a real person using blink detection",
        "label": "Liveness Check — verifies a real person using blink detection",
    },
    {
        "name": "Duplicate Entry Guard",
        "description": "prevents repeated attendance within the cooldown time",
        "label": "Duplicate Entry Guard — prevents repeated attendance within the cooldown time",
    },
    {
        "name": "Attendance Marking",
        "description": "records check-in and check-out automatically",
        "label": "Attendance Marking — records check-in and check-out automatically",
    },
    {
        "name": "Duplicate Enrollment Check",
        "description": "stops the same person being registered twice",
        "label": "Duplicate Enrollment Check — stops the same person being registered twice",
    },
]

COLLEGE_BRANDING_METADATA: dict[str, Any] = {
    "college_name": COLLEGE_NAME,
    "short_name": COLLEGE_SHORT_NAME,
    "location": COLLEGE_LOCATION,
    "logo_path": COLLEGE_LOGO_PATH,
    "page_title": COLLEGE_PAGE_TITLE,
    "programs": COLLEGE_PROGRAMS,
    "processes": SYSTEM_PROCESSES,
    "colors": {
        "primary": "#0d3b66",
        "primary_dark": "#08233e",
        "accent": "#d4af37",
        "accent_hover": "#c19b28",
    },
}


def validate_program(degree: str | None, department: str | None) -> tuple[bool, str | None]:
    """Validates degree and department against authorized institutional programs."""
    if not degree and not department:
        return True, None
    if bool(degree) != bool(department):
        return False, "Both Degree and Department must be provided together."
    if (degree, department) not in VALID_DEGREE_DEPARTMENTS:
        allowed_str = ", ".join(f"{deg}: {', '.join(depts)}" for deg, depts in COLLEGE_PROGRAMS.items())
        return False, f"Invalid program '{degree} - {department}'. Allowed: {allowed_str}"
    return True, None


def format_program(degree: str | None, department: str | None) -> str:
    """Format: 'BE – CSE' or 'B.Tech – AIDS'"""
    if degree and department:
        return f"{degree} – {department}"
    return department or degree or "—"
