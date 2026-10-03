"""Dependency container (no global mutable state; one instance per process/app)."""
from __future__ import annotations

import threading

from app.core.config import Settings, get_settings
from app.db.repository import Repository
from app.db.session import create_all, make_engine, make_session_factory
from app.recognition.engine import RecognitionEngine
from app.recognition.gallery import Gallery
from app.recognition.matcher import build_matcher
from app.services.attendance_service import AttendanceService
from app.services.recognition_service import RecognitionService
from app.services.registration_service import RegistrationService
from app.utils.kv import build_kv


class Container:
    def __init__(self, settings: Settings | None = None, engine: RecognitionEngine | None = None) -> None:
        self.settings = settings or get_settings()
        self.db_engine = make_engine(self.settings.effective_database_url)
        if self.settings.effective_database_url.startswith("sqlite"):
            create_all(self.db_engine)
        self.repo = Repository(make_session_factory(self.db_engine))
        self.kv = build_kv(self.settings.redis_url)
        self.gallery = Gallery(self.repo, self.kv, build_matcher(self.settings.use_faiss))
        self._engine = engine
        self._lock = threading.Lock()
        self.attendance = AttendanceService(self.repo, self.kv, self.settings)
        self.registration = RegistrationService(self.get_engine, self.repo, self.gallery, self.settings)
        self.recognition = RecognitionService(self.get_engine, self.gallery, self.attendance, self.settings)

    def get_engine(self) -> RecognitionEngine:
        with self._lock:
            if self._engine is None:
                from app.recognition.factory import build_engine

                self._engine = build_engine(self.settings, self.gallery)
            return self._engine

    @property
    def models_loaded(self) -> bool:
        return self._engine is not None
