"""Structured logging via loguru."""
from __future__ import annotations

import sys

from loguru import logger


def setup_logging(level: str = "INFO", json: bool = False) -> None:
    logger.remove()
    if json:
        logger.add(sys.stdout, level=level.upper(), serialize=True)
    else:
        logger.add(
            sys.stdout,
            level=level.upper(),
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan> - {message}",
        )
