"""Validate bounded cover image headers without loading image libraries."""

import struct
import zlib

from .story_store import StoryError

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 20_000_000
MAX_SIDE = 10_000
MIMES = {"image/jpeg", "image/png"}


def _png(data):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    offset, width, height, has_data, ended = 8, 0, 0, False, False
    while offset + 12 <= len(data):
        size = int.from_bytes(data[offset:offset + 4], "big")
        kind = data[offset + 4:offset + 8]
        end = offset + 8 + size
        if end + 4 > len(data):
            break
        payload = data[offset + 8:end]
        crc = int.from_bytes(data[end:end + 4], "big")
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            break
        if offset == 8 and kind == b"IHDR" and size == 13:
            width, height = struct.unpack_from(">II", payload)
        elif kind == b"IDAT":
            has_data = True
        elif kind == b"IEND" and size == 0:
            ended = True
            break
        offset = end + 4
    return ("image/png", width, height) if width and height and has_data and ended else ("invalid", 0, 0)


def _jpeg(data):
    if not data.startswith(b"\xff\xd8"):
        return None
    if not data.endswith(b"\xff\xd9"):
        return "invalid", 0, 0
    offset, width, height, scan = 2, 0, 0, False
    while offset + 4 < len(data) and data[offset] == 0xff:
        while offset < len(data) and data[offset] == 0xff:
            offset += 1
        marker = data[offset]
        offset += 1
        if marker in {0xd8, 0xd9} or 0xd0 <= marker <= 0xd7:
            continue
        length = int.from_bytes(data[offset:offset + 2], "big")
        if length < 2 or offset + length > len(data):
            break
        if marker in {0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf}:
            if length < 7:
                break
            height, width = struct.unpack_from(">HH", data, offset + 3)
        if marker == 0xda:
            scan = True
            break
        offset += length
    return ("image/jpeg", width, height) if width and height and scan else ("invalid", 0, 0)


def inspect(data):
    """Return validated MIME/dimensions; reject SVG, truncated and oversized images."""
    if not isinstance(data, bytes) or not 1 <= len(data) <= MAX_BYTES:
        raise StoryError(400, "INVALID_COVER_SIZE", "Ảnh bìa tối đa 5 MiB.")
    result = _png(data) or _jpeg(data)
    if not result or result[0] == "invalid":
        raise StoryError(400, "INVALID_COVER_IMAGE", "Ảnh bìa phải là JPEG hoặc PNG hợp lệ.")
    mime, width, height = result
    if mime not in MIMES or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise StoryError(400, "COVER_DIMENSIONS_TOO_LARGE", "Ảnh bìa vượt giới hạn 20 megapixel.")
    return {"contentType": mime, "width": width, "height": height}
