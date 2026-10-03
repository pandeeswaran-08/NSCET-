"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "persons",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("department", sa.String(128), nullable=True),
        sa.Column("mean_embedding", sa.LargeBinary, nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_persons_code", "persons", ["code"], unique=True)

    op.create_table(
        "face_embeddings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("person_id", sa.Integer, sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("embedding", sa.LargeBinary, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_face_embeddings_person_id", "face_embeddings", ["person_id"])

    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("person_id", sa.Integer, sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("att_date", sa.Date, nullable=False),
        sa.Column("camera_id", sa.String(64), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("snapshot_path", sa.String(512), nullable=True),
        sa.UniqueConstraint("person_id", "att_date", "kind", name="uq_person_day_kind"),
    )
    op.create_index("ix_attendance_person_id", "attendance", ["person_id"])
    op.create_index("ix_attendance_date_camera", "attendance", ["att_date", "camera_id"])


def downgrade() -> None:
    op.drop_table("attendance")
    op.drop_table("face_embeddings")
    op.drop_table("persons")
