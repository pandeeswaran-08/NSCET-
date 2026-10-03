"""CLI script to create or update an administrator account for NSCET."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import get_settings
from app.core.security import hash_password, validate_email_domain
from app.db.session import make_engine, make_session_factory
from app.db.repository import Repository


def main():
    parser = argparse.ArgumentParser(description="Create the initial NSCET Admin account.")
    parser.add_argument("--email", default="admin@nscet.edu.in", help="Admin email (@nscet.edu.in)")
    parser.add_argument("--password", default="Admin@NSCET2026", help="Admin password")
    parser.add_argument("--name", default="NSCET Administrator", help="Admin full name")
    args = parser.parse_args()

    s = get_settings()
    email = args.email.strip().lower()

    if not validate_email_domain(email, s.allowed_email_domain):
        print(f"[ERROR] Email must belong to the college domain '@{s.allowed_email_domain}'. Got: '{email}'")
        sys.exit(1)

    engine = make_engine(s.effective_database_url)
    factory = make_session_factory(engine)
    repo = Repository(factory)

    existing = repo.get_user_by_email(email)
    hashed = hash_password(args.password)

    if existing is not None:
        print(f"[INFO] User '{email}' already exists. Updating credentials and elevating to admin...")
        with factory() as session:
            u = session.get(type(existing), existing.id)
            u.hashed_password = hashed
            u.full_name = args.name
            u.role = "admin"
            u.active = True
            session.commit()
        print(f"[SUCCESS] Admin user '{email}' updated successfully.")
    else:
        repo.create_user(email=email, hashed_password=hashed, full_name=args.name, role="admin")
        print(f"[SUCCESS] Admin account created for '{email}' with role 'admin'.")


if __name__ == "__main__":
    main()
