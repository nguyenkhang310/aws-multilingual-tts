"""Immutable chapter uploads, commit manifests and paginated content reads."""

import hashlib
import json

from . import story_chapters as chapters, story_projects as projects
from .story_store import StoryError, page, read, require_id, write
from .story_text import MAX_CHUNK_CHARS, MAX_CHUNKS, split, split_with_lengths, utf16_length

PAGE_SIZE = 100


def upload(scope, project_id, chapter_id, upload_id, index, text):
    chapters.get(scope, project_id, chapter_id)
    require_id(upload_id)
    if type(index) is not int or not 0 <= index < MAX_CHUNKS or not isinstance(text, str) or not text or "\x00" in text:
        raise StoryError(400, "INVALID_CHUNK", "Phần tải lên không hợp lệ.")
    if len(text) > MAX_CHUNK_CHARS or len(text.encode()) > 120_000:
        raise StoryError(413, "CHUNK_TOO_LARGE", "Mỗi phần tối đa 32.000 ký tự hoặc 120 KB.")
    key = f"{chapters.prefix(scope, project_id, chapter_id)}uploads/{upload_id}/{index:03d}.json"
    value = {"index": index, "text": text}
    _write_once(key, value)
    return {"stored": True, "index": index}


def _write_once(key, value):
    try:
        write(key, value, create=True)
    except StoryError as error:
        existing = read(key)
        if error.code != "REVISION_CONFLICT" or not existing or existing[0] != value:
            raise


def _content_keys(base, version):
    return f"{base}revisions/{version}/"


def commit(scope, project_id, chapter_id, upload_id, count, expected_revision, segment_lengths=None):
    current, etag = chapters.get(scope, project_id, chapter_id)
    if type(expected_revision) is not int:
        raise StoryError(400, "INVALID_REVISION", "Revision chương không hợp lệ.")
    boundary_digest = None if segment_lengths is None else hashlib.sha256(
        json.dumps(segment_lengths, separators=(",", ":")).encode()).hexdigest()
    if current.get("lastUploadId") == upload_id:
        if count == current.get("uploadCount") and expected_revision == current["revision"] - 1 and boundary_digest == current.get("segmentDigest"):
            return current
        raise StoryError(409, "REVISION_CONFLICT", "Yêu cầu lưu chương không khớp lần trước.")
    if expected_revision != current["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã đổi. Tải lại trước khi lưu.")
    require_id(upload_id)
    if type(count) is not int or not 1 <= count <= MAX_CHUNKS:
        raise StoryError(400, "INVALID_CHUNK_COUNT", "Số phần tải lên không hợp lệ.")
    base = chapters.prefix(scope, project_id, chapter_id)
    parts = []
    for index in range(count):
        stored = read(f"{base}uploads/{upload_id}/{index:03d}.json")
        if not stored or stored[0].get("index") != index:
            raise StoryError(409, "UPLOAD_INCOMPLETE", "Chương chưa tải đủ các phần.")
        parts.append(stored[0]["text"])
    if any(not isinstance(part, str) or not part or len(part) > MAX_CHUNK_CHARS for part in parts):
        raise StoryError(409, "UPLOAD_INCOMPLETE", "Phần tải lên không hợp lệ.")
    source = "".join(parts)
    parts.clear()
    default_segments = split(source)
    segments = default_segments if segment_lengths is None else split_with_lengths(source, segment_lengths)
    version = upload_id
    content_base = _content_keys(base, version)
    timestamp = current["updatedAt"]
    for start in range(0, len(segments), PAGE_SIZE):
        items = [{"segmentId": hashlib.sha256(f"{version}:{index}".encode()).hexdigest()[:32],
                  "chapterId": chapter_id, "order": index, "sourceText": text,
                  "textLength": utf16_length(text), "revision": expected_revision + 1,
                  "status": "DRAFT", "jobId": None, "audioKey": None,
                  "createdAt": timestamp, "updatedAt": timestamp}
                 for index, text in enumerate(segments[start:start + PAGE_SIZE], start)]
        _write_once(f"{content_base}segments/{start // PAGE_SIZE:04d}.json", {"items": items})
    result = {**current, "contentRevision": version, "lastUploadId": upload_id,
              "textLength": utf16_length(source), "segmentCount": len(segments), "uploadCount": count,
              "segmentDigest": boundary_digest,
              "status": "READY", "revision": expected_revision + 1, "updatedAt": projects.now()}
    write(projects.chapter_key(scope, project_id, chapter_id), result, etag=etag)
    return result


def segments_page(scope, project_id, chapter_id, limit=25, cursor=None):
    current, _ = chapters.get(scope, project_id, chapter_id)
    version = current.get("contentRevision")
    if not version:
        return {"items": [], "nextCursor": None}
    if cursor:
        try:
            saved_version, offset = cursor.split(":", 1)
            if saved_version != version:
                raise ValueError
        except ValueError:
            raise StoryError(409, "REVISION_CONFLICT", "Chương đã thay đổi; tải lại danh sách đoạn.") from None
    else:
        offset = 0
    indices, next_offset = page(list(range(current["segmentCount"])), limit, offset)
    base = _content_keys(chapters.prefix(scope, project_id, chapter_id), version)
    items, cached_page = [], None
    for index in indices:
        page_number = index // PAGE_SIZE
        if cached_page != page_number:
            stored = read(f"{base}segments/{page_number:04d}.json")
            if not stored:
                raise StoryError(503, "CHAPTER_INCOMPLETE", "Dữ liệu chương chưa đọc được đầy đủ.")
            segment_page, cached_page = stored[0]["items"], page_number
        items.append(segment_page[index % PAGE_SIZE])
    return {"items": items, "nextCursor": f"{version}:{next_offset}" if next_offset else None}


def segment_at(scope, project_id, chapter_id, version, index):
    """Read an immutable approved revision, even if the chapter was edited later."""
    chapters.get(scope, project_id, chapter_id)
    require_id(version)
    if type(index) is not int or not 0 <= index < 2000:
        raise StoryError(400, "INVALID_ITEM", "Số đoạn không hợp lệ.")
    base = _content_keys(chapters.prefix(scope, project_id, chapter_id), version)
    stored = read(f"{base}segments/{index // PAGE_SIZE:04d}.json")
    items = stored[0].get("items") if stored else None
    if not isinstance(items, list) or index % PAGE_SIZE >= len(items):
        raise StoryError(503, "CHAPTER_INCOMPLETE", "Không đọc được đoạn đã duyệt.")
    return items[index % PAGE_SIZE]


def source_page(scope, project_id, chapter_id, cursor=None):
    """Read one immutable upload part; a large chapter never enters one HTTP response."""
    current, _ = chapters.get(scope, project_id, chapter_id)
    version = current.get("contentRevision")
    if not version:
        return {"text": "", "index": 0, "nextCursor": None}
    try:
        saved_version, number = cursor.split(":", 1) if cursor else (version, "0")
        index = int(number)
    except (ValueError, TypeError):
        raise StoryError(400, "INVALID_CURSOR", "Trang nội dung không hợp lệ.") from None
    if saved_version != version:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã thay đổi; hãy tải lại.")
    if not 0 <= index < MAX_CHUNKS:
        raise StoryError(400, "INVALID_CURSOR", "Trang nội dung không hợp lệ.")
    key = f"{chapters.prefix(scope, project_id, chapter_id)}uploads/{version}/{index:03d}.json"
    stored = read(key)
    if not stored or not isinstance(stored[0].get("text"), str):
        raise StoryError(503, "CHAPTER_INCOMPLETE", "Nội dung chương chưa đọc được đầy đủ.")
    count = current.get("uploadCount")
    return {"text": stored[0]["text"], "index": index,
            "nextCursor": f"{version}:{index + 1}" if count and index + 1 < count else None,
            "contentRevision": version}
