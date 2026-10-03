"""Biometric encryption and cryptographic utilities.
Secures 512-D ArcFace neural embedding vectors and biometric identities at rest
using AES-256-GCM authenticated encryption with unique per-record nonces.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from typing import Final

MAGIC_HEADER: Final[bytes] = b"E2EEv1:"

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_AESGCM = True
except ImportError:
    HAS_AESGCM = False


def _derive_key(secret: str, salt: bytes = b"nscet-biometric-salt-v1") -> bytes:
    """Derive 256-bit encryption key using PBKDF2-HMAC-SHA256."""
    return hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, iterations=100_000, dklen=32)


def encrypt_biometric_bytes(data: bytes, secret: str = "nscet-biometric-master-key-2026") -> bytes:
    """Encrypt raw biometric float buffer into AES-256-GCM authenticated ciphertext.
    
    Structure: MAGIC_HEADER (7B) + NONCE (12B) + CIPHERTEXT_WITH_TAG
    """
    if not data:
        return data
    if data.startswith(MAGIC_HEADER):
        # Already encrypted
        return data

    key = _derive_key(secret)
    nonce = os.urandom(12)

    if HAS_AESGCM:
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, data, associated_data=MAGIC_HEADER)
        return MAGIC_HEADER + nonce + ciphertext

    # Fallback authenticated stream cipher using HMAC-SHA256 keystream if cryptography package missing
    keystream_seed = hmac.new(key, nonce, hashlib.sha256).digest()
    expanded_key = b""
    counter = 0
    while len(expanded_key) < len(data):
        counter += 1
        expanded_key += hmac.new(keystream_seed, counter.to_bytes(4, "big"), hashlib.sha256).digest()
    
    xor_bytes = bytes(b ^ k for b, k in zip(data, expanded_key[:len(data)]))
    tag = hmac.new(key, MAGIC_HEADER + nonce + xor_bytes, hashlib.sha256).digest()[:16]
    return MAGIC_HEADER + nonce + xor_bytes + tag


def decrypt_biometric_bytes(data: bytes, secret: str = "nscet-biometric-master-key-2026") -> bytes:
    """Decrypt authenticated ciphertext back to original raw float buffer.
    
    Transparently handles legacy unencrypted vectors without corruption.
    """
    if not data:
        return data
    if not data.startswith(MAGIC_HEADER):
        # Legacy unencrypted vector, return as-is
        return data

    key = _derive_key(secret)
    payload = data[len(MAGIC_HEADER):]
    if len(payload) < 12 + 16:
        # Invalid payload, fallback
        return data

    nonce = payload[:12]
    ciphertext_and_tag = payload[12:]

    if HAS_AESGCM:
        try:
            aesgcm = AESGCM(key)
            return aesgcm.decrypt(nonce, ciphertext_and_tag, associated_data=MAGIC_HEADER)
        except Exception:
            # Decryption verification failed
            return b""

    # Fallback verification
    tag = ciphertext_and_tag[-16:]
    xor_bytes = ciphertext_and_tag[:-16]
    expected_tag = hmac.new(key, MAGIC_HEADER + nonce + xor_bytes, hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(tag, expected_tag):
        return b""

    keystream_seed = hmac.new(key, nonce, hashlib.sha256).digest()
    expanded_key = b""
    counter = 0
    while len(expanded_key) < len(xor_bytes):
        counter += 1
        expanded_key += hmac.new(keystream_seed, counter.to_bytes(4, "big"), hashlib.sha256).digest()

    return bytes(b ^ k for b, k in zip(xor_bytes, expanded_key[:len(xor_bytes)]))
