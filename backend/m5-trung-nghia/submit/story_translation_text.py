"""Lossless, bounded Translator chunks and exact glossary placeholders."""

import hashlib
import re

from tts_common.story_store import StoryError

MAX_UNITS = 1200
MAX_BYTES = 6000
BOUNDARY = re.compile(r"[.!?。！？]\s*|\n+|\s+")


def split(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 1_000_000:
        raise StoryError(413, "CHAPTER_TOO_LARGE", "Chương quá dài hoặc rỗng.")
    if any(0xD800 <= ord(char) <= 0xDFFF for char in text):
        raise StoryError(400, "INVALID_TEXT", "Unicode không hợp lệ.")
    parts, start = [], 0
    while start < len(text):
        end, units, size = start, 0, 0
        while end < len(text):
            char = text[end]
            next_units = units + (2 if ord(char) > 0xFFFF else 1)
            next_size = size + len(char.encode("utf-8"))
            if next_units > MAX_UNITS or next_size > MAX_BYTES:
                break
            units, size, end = next_units, next_size, end + 1
        if end == start:
            raise StoryError(413, "CHUNK_TOO_LARGE", "Không chia được phần dịch.")
        if end < len(text):
            boundaries = [match.end() for match in BOUNDARY.finditer(text, start, end)
                          if match.end() > start + (end - start) // 2]
            if boundaries:
                end = boundaries[-1]
        parts.append(text[start:end])
        start = end
        if len(parts) > 2000:
            raise StoryError(413, "PLAN_TOO_LARGE", "Chương có quá nhiều phần dịch.")
    if "".join(parts) != text:
        raise StoryError(503, "CHUNK_MISMATCH", "Không giữ được nội dung gốc.")
    return parts


def protect(text, entries):
    """Replace longest exact glossary matches; avoid Latin substrings."""
    terms = sorted(entries, key=lambda item: len(item["source"]), reverse=True)
    pieces, mapping, index = [], {}, 0
    while index < len(text):
        match = next((item for item in terms if text.startswith(item["source"], index) and
                      (not item["source"][0].isascii() or not item["source"][0].isalpha() or
                       index == 0 or not text[index - 1].isalnum()) and
                      (not item["source"][-1].isascii() or not item["source"][-1].isalpha() or
                       index + len(item["source"]) == len(text) or
                       not text[index + len(item["source"])].isalnum())), None)
        if match:
            token = "ZXQ" + hashlib.sha256(f"{index}:{match['source']}".encode()).hexdigest()[:12].upper() + "QXZ"
            if token in text:
                raise StoryError(409, "GLOSSARY_COLLISION", "Văn bản trùng mã thuật ngữ; cần chỉnh glossary.")
            pieces.append(token)
            mapping[token] = match["target"]
            index += len(match["source"])
        else:
            pieces.append(text[index])
            index += 1
    return "".join(pieces), mapping


def restore(translated, mapping):
    if not isinstance(translated, str) or not translated.strip():
        raise StoryError(503, "TRANSLATION_INVALID_RESPONSE", "Bản dịch trả về rỗng.")
    if any(translated.count(token) != 1 for token in mapping):
        raise StoryError(409, "GLOSSARY_NOT_PRESERVED", "Azure không giữ được mã thuật ngữ; cần duyệt thủ công.")
    for token, target in mapping.items():
        translated = translated.replace(token, target)
    return translated
