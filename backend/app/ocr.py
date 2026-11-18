"""O'zbekiston davlat raqami normalizatsiyasi va OCR (Tesseract / pluggable)."""

from __future__ import annotations

import csv
import io
import re
import shutil
import subprocess
import threading
from io import BytesIO

try:
    from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError
except ImportError:  # pragma: no cover - optional in pure logic test environments
    Image = None  # type: ignore[assignment]
    ImageEnhance = None  # type: ignore[assignment]
    ImageOps = None  # type: ignore[assignment]
    UnidentifiedImageError = Exception  # type: ignore[misc,assignment]

_OCR_LOCK = threading.BoundedSemaphore(1)
_PLATE_REGEX = re.compile(r"^(?:\d{2}[A-Z]\d{3}[A-Z]{2}|\d{5}[A-Z]{3})$")
_WORD_PATTERN = re.compile(r"[^A-Z0-9]")

_DIGIT_CORRECTIONS = str.maketrans(
    {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "G": "6", "B": "8"}
)
_LETTER_CORRECTIONS = str.maketrans(
    {"0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B"}
)
_PLATE_DIGIT_POSITIONS = ({0, 1, 3, 4, 5}, {0, 1, 2, 3, 4})


def normalize_plate(raw: str) -> str:
    return re.sub(r"[-\s]", "", raw.strip()).upper()


def is_valid_plate(plate: str) -> bool:
    return bool(_PLATE_REGEX.match(normalize_plate(plate)))


def normalize_ocr_candidate(raw: str) -> tuple[str, int] | None:
    cleaned = _WORD_PATTERN.sub("", raw.upper())
    if len(cleaned) != 8:
        return None
    candidates: list[tuple[str, int]] = []
    for digit_positions in _PLATE_DIGIT_POSITIONS:
        normalized = list(cleaned)
        corrections = 0
        for index, char in enumerate(cleaned):
            translated = char.translate(
                _DIGIT_CORRECTIONS if index in digit_positions else _LETTER_CORRECTIONS
            )
            normalized[index] = translated
            corrections += translated != char
        plate = "".join(normalized)
        if is_valid_plate(plate):
            candidates.append((plate, corrections))
    return min(candidates, key=lambda item: item[1]) if candidates else None


def candidate_from_tsv(tsv: str) -> tuple[str | None, float]:
    lines: dict[tuple[str, str, str, str], list[tuple[str, float]]] = {}
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t"):
        if row.get("level") != "5":
            continue
        word = _WORD_PATTERN.sub("", row.get("text", "").upper())
        if not word:
            continue
        try:
            confidence = float(row["conf"])
        except (KeyError, ValueError):
            continue
        if confidence < 0:
            continue
        line_key = tuple(
            row.get(name, "") for name in ("page_num", "block_num", "par_num", "line_num")
        )
        lines.setdefault(line_key, []).append((word, confidence))

    best_plate: str | None = None
    best_conf = 0.0
    for words in lines.values():
        line_text = "".join(word for word, _ in words)
        line_conf = sum(conf * len(word) for word, conf in words) / max(
            1, sum(len(word) for word, _ in words)
        )
        for start in range(max(1, len(line_text) - 7)):
            normalized = normalize_ocr_candidate(line_text[start : start + 8])
            if normalized is None:
                continue
            plate, corrections = normalized
            conf = max(0.0, min(1.0, line_conf / 100.0 - corrections * 0.015))
            if best_plate is None or conf > best_conf:
                best_plate = plate
                best_conf = conf
    return best_plate, best_conf


def recognize_plate_tesseract(
    image_bytes: bytes,
    *,
    command: str = "tesseract",
    timeout_seconds: int = 5,
) -> tuple[str | None, float]:
    executable = shutil.which(command)
    if executable is None or Image is None:
        return None, 0.0

    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("L")
            image = ImageOps.autocontrast(image)
            image = ImageEnhance.Contrast(image).enhance(1.35)
            if image.width < 1280:
                image = image.resize((image.width * 2, image.height * 2), Image.Resampling.LANCZOS)
            out = BytesIO()
            image.save(out, format="PNG")
            prepared = out.getvalue()
    except (UnidentifiedImageError, OSError):
        return None, 0.0

    with _OCR_LOCK:
        proc = subprocess.run(
            [
                executable,
                "stdin",
                "stdout",
                "--psm",
                "6",
                "-l",
                "eng",
                "-c",
                "tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                "tsv",
            ],
            input=prepared,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    if proc.returncode != 0:
        return None, 0.0
    return candidate_from_tsv(proc.stdout.decode("utf-8", errors="replace"))
