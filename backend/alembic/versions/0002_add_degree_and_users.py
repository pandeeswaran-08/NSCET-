"""add degree column to persons, safe mapping of departments, and create users table

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add degree column to persons
    with op.batch_alter_table("persons") as batch_op:
        batch_op.add_column(sa.Column("degree", sa.String(32), nullable=True))

    # 2. Map existing department values safely
    # BE: CSE, CIVIL, MECH, ECE, EEE
    # B.Tech: IT, AIDS
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE persons SET degree = 'BE'
        WHERE UPPER(TRIM(department)) IN ('CSE', 'CIVIL', 'MECH', 'ECE', 'EEE')
    """))
    conn.execute(sa.text("""
        UPDATE persons SET degree = 'B.Tech'
        WHERE UPPER(TRIM(department)) IN ('IT', 'AIDS')
    """))
    # Standardize casing
    for dept in ['CSE', 'CIVIL', 'MECH', 'ECE', 'EEE', 'IT', 'AIDS']:
        conn.execute(sa.text(f"UPDATE persons SET department = '{dept}' WHERE UPPER(TRIM(department)) = '{dept}'"))

    # 3. Create users table for JWT authentication
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(128), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="faculty"),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    with op.batch_alter_table("persons") as batch_op:
        batch_op.drop_column("degree")
