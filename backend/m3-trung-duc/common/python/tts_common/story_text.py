"""Lossless chapter splitting into sentence-aware TTS jobs."""

import re
import unicodedata

from . import config
from .story_store import StoryError

MAX_CHAPTER_CHARS = 1_000_000
MAX_CHUNK_CHARS = 32_000
MAX_CHUNKS = 64


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def split(text):
    if not isinstance(text, str) or not text.strip() or "\x00" in text or len(text) > MAX_CHAPTER_CHARS:
        raise StoryError(413, "CHAPTER_TOO_LARGE", "Chương rỗng hoặc vượt 1.000.000 ký tự.")
    if any(0xD800 <= ord(char) <= 0xDFFF for char in text):
        raise StoryError(400, "INVALID_TEXT", "Nội dung Unicode không hợp lệ.")
    if utf16_length(text) > MAX_CHAPTER_CHARS:
        raise StoryError(413, "CHAPTER_TOO_LARGE", "Chương vượt 1.000.000 ký tự UTF-16.")
    # Worker splits a job into provider-sized chunks; a story segment is one job.
    limit = config.MAX_CHARS
    if limit < 2:
        raise StoryError(503, "SEGMENT_LIMIT", "Giới hạn đoạn đọc chưa hợp lệ.")
    result, start, length = [], 0, 0
    for index, char in enumerate(text):
        width = 2 if ord(char) > 0xFFFF else 1
        if length + width > limit:
            window = text[start:index]
            sentences = list(re.finditer(r"(?:\n\s*\n|[.!?。！？][\s\"'”’]*|[.!?。！？]$)", window))
            preferred = next((m.end() for m in reversed(sentences) if m.end() >= len(window) // 2), None)
            if preferred is None:
                spaces = list(re.finditer(r"\s+", window))
                preferred = next((m.end() for m in reversed(spaces) if m.end() >= len(window) // 2), None)
            end = start + preferred if preferred else index
            while end > start + 1 and end < len(text) and unicodedata.combining(text[end]):
                end -= 1
            result.append(text[start:end])
            start, length = end, utf16_length(text[end:index])
        length += width
    if start < len(text):
        result.append(text[start:])
    if "".join(result) != text:
        raise StoryError(503, "SEGMENT_MISMATCH", "Không chia được chương mà vẫn giữ nguyên nội dung.")
    return result


def split_with_lengths(text, lengths):
    """Restore reviewed segment boundaries from a backup, measured in UTF-16 units."""
    limit = config.MAX_CHARS
    if not isinstance(lengths, list) or not 1 <= len(lengths) <= 2000 or any(
            type(size) is not int or size < 1 or size > limit for size in lengths):
        raise StoryError(400, "INVALID_SEGMENTS", "Ranh giới đoạn không hợp lệ.")
    result, start, index = [], 0, 0
    for size in lengths:
        width = 0
        while index < len(text) and width < size:
            width += 2 if ord(text[index]) > 0xFFFF else 1
            index += 1
        if width != size or index == start:
            raise StoryError(400, "INVALID_SEGMENTS", "Ranh giới đoạn cắt giữa ký tự Unicode.")
        result.append(text[start:index])
        start = index
    if index != len(text):
        raise StoryError(400, "INVALID_SEGMENTS", "Các đoạn chưa chứa đủ nội dung chương.")
    return result
