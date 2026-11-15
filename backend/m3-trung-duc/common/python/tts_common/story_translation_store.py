"""Scoped, CAS-backed glossary, translation chunks and approved revisions."""

import hashlib
import json

from . import story_chapters as chapters, story_projects as projects
from .story_store import StoryError, children, read, require_id, root, write
from datetime import datetime, timezone


def base(scope, project_id, chapter_id=None):
    prefix = f"{projects.project_key(scope, project_id)[:-12]}"
    return prefix + (f"chapters/{require_id(chapter_id)}/" if chapter_id else "")


def glossary_key(scope, project_id):
    return base(scope, project_id) + "glossary.json"


def glossary(scope, project_id):
    projects.get(scope, project_id)
    return read(glossary_key(scope, project_id)) or ({"revision": 0, "entries": []}, None)


def save_glossary(scope, project_id, revision, entries):
    current, etag = glossary(scope, project_id)
    if type(revision) is not int or revision != current["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Thuật ngữ đã đổi; hãy tải lại.")
    if not isinstance(entries, list) or len(entries) > 200:
        raise StoryError(400, "INVALID_GLOSSARY", "Danh sách tối đa 200 thuật ngữ.")
    cleaned, seen = [], set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise StoryError(400, "INVALID_GLOSSARY", "Thuật ngữ không hợp lệ.")
        source, target = entry.get("source"), entry.get("target")
        if (not isinstance(source, str) or not isinstance(target, str) or
                not 1 <= len(source.strip()) <= 80 or not 1 <= len(target.strip()) <= 120 or
                any("\x00" in value for value in (source, target)) or source.strip() in seen):
            raise StoryError(400, "INVALID_GLOSSARY", "Thuật ngữ trống, trùng hoặc quá dài.")
        seen.add(source.strip())
        cleaned.append({"source": source.strip(), "target": target.strip()})
    result = {"revision": revision + 1, "entries": cleaned}
    write(glossary_key(scope, project_id), result, etag=etag, create=etag is None)
    return result


def plan_base(scope, project_id, chapter_id, plan_id):
    chapters.get(scope, project_id, chapter_id)
    return base(scope, project_id, chapter_id) + f"translations/{require_id(plan_id)}/"


def plan_key(scope, project_id, chapter_id, plan_id):
    return plan_base(scope, project_id, chapter_id, plan_id) + "plan.json"


def chunk_key(scope, project_id, chapter_id, plan_id, index):
    if type(index) is not int or not 0 <= index < 2000:
        raise StoryError(400, "INVALID_ITEM", "Số phần dịch không hợp lệ.")
    return plan_base(scope, project_id, chapter_id, plan_id) + f"chunks/{index:04d}.json"


def get_plan(scope, project_id, chapter_id, plan_id):
    stored = read(plan_key(scope, project_id, chapter_id, plan_id))
    if not stored:
        raise StoryError(404, "PLAN_NOT_FOUND", "Không tìm thấy kế hoạch dịch.")
    return stored


def list_plans(scope, project_id, chapter_id):
    prefix = base(scope, project_id, chapter_id) + "translations/"
    result = []
    for child in children(prefix):
        stored = read(child + "plan.json")
        if stored and stored[0].get("schemaVersion") == 1:
            result.append(stored[0])
    return sorted(result, key=lambda item: item["createdAt"], reverse=True)


def run_key(scope, project_id, chapter_id, plan_id):
    return plan_base(scope, project_id, chapter_id, plan_id) + "run.json"


def get_run(scope, project_id, chapter_id, plan_id):
    return read(run_key(scope, project_id, chapter_id, plan_id))


def start_run(scope, project_id, chapter_id, plan_id):
    key = run_key(scope, project_id, chapter_id, plan_id)
    result = {"status": "RUNNING", "desiredState": "RUNNING", "leaseUntil": 0,
              "startedAt": projects.now()}
    try:
        write(key, result, create=True)
    except StoryError as error:
        if error.code != "REVISION_CONFLICT" or not read(key):
            raise
    return get_run(scope, project_id, chapter_id, plan_id)[0]


def update_run(scope, project_id, chapter_id, plan_id, changes, expected_etag=None):
    stored = get_run(scope, project_id, chapter_id, plan_id)
    if not stored:
        raise StoryError(409, "PLAN_NOT_STARTED", "Hãy bắt đầu dịch trước.")
    run, etag = stored
    if expected_etag is not None and etag != expected_etag:
        raise StoryError(409, "REVISION_CONFLICT", "Trạng thái dịch đã đổi.")
    result = {**run, **changes}
    write(run_key(scope, project_id, chapter_id, plan_id), result, etag=etag)
    return result


def reserve_translation_chars(scope, count, limit):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = f"{root(scope)}translation-usage/{day}.json"
    for _ in range(6):
        stored = read(key)
        data, etag = stored if stored else ({"chars": 0}, None)
        if data["chars"] + count > limit:
            return False
        try:
            write(key, {"chars": data["chars"] + count}, etag=etag, create=etag is None)
            return True
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUOTA_BUSY", "Chưa giữ được hạn mức dịch.")


def get_chunk(scope, project_id, chapter_id, plan_id, index):
    stored = read(chunk_key(scope, project_id, chapter_id, plan_id, index))
    if not stored:
        raise StoryError(503, "CHUNK_MISSING", "Thiếu phần dịch đã lưu.")
    return stored


def create_plan(scope, project_id, chapter_id, plan, chunks):
    if not 1 <= len(chunks) <= 2000 or len(chunks) != plan["total"]:
        raise StoryError(400, "PLAN_TOO_LARGE", "Chương có quá nhiều phần dịch.")
    key = plan_key(scope, project_id, chapter_id, plan["planId"])
    existing = read(key)
    if existing:
        if existing[0]["fingerprint"] != plan["fingerprint"]:
            raise StoryError(409, "PLAN_CONFLICT", "Kế hoạch dịch đã đổi.")
        return existing[0]
    for index, source in enumerate(chunks):
        item = {"index": index, "sourceText": source, "sourceHash": hashlib.sha256(source.encode()).hexdigest(),
                "status": "QUEUED", "translatedText": None, "attempts": 0, "version": 1}
        item_key = chunk_key(scope, project_id, chapter_id, plan["planId"], index)
        try:
            write(item_key, item, create=True)
        except StoryError as error:
            stored = read(item_key)
            if error.code != "REVISION_CONFLICT" or not stored or stored[0] != item:
                raise
    try:
        write(key, plan, create=True)
    except StoryError as error:
        stored = read(key)
        if error.code != "REVISION_CONFLICT" or not stored or stored[0]["fingerprint"] != plan["fingerprint"]:
            raise
    return get_plan(scope, project_id, chapter_id, plan["planId"])[0]


def update_chunk(scope, project_id, chapter_id, plan_id, index, changes, expected_version=None):
    item, etag = get_chunk(scope, project_id, chapter_id, plan_id, index)
    if expected_version is not None and expected_version != item.get("version", 1):
        raise StoryError(409, "REVISION_CONFLICT", "Phần dịch đã đổi; tải lại trước khi sửa.")
    value = {**item, **changes, "version": item.get("version", 1) + 1}
    write(chunk_key(scope, project_id, chapter_id, plan_id, index), value, etag=etag)
    return value


def edit_chunk(scope, project_id, chapter_id, plan_id, index, text, expected_version):
    item, etag = get_chunk(scope, project_id, chapter_id, plan_id, index)
    if expected_version != item.get("version", 1):
        raise StoryError(409, "REVISION_CONFLICT", "Bản nháp đã đổi; tải lại trước khi sửa.")
    history_key = (plan_base(scope, project_id, chapter_id, plan_id) +
                   f"drafts/{index:04d}/{expected_version:04d}.json")
    try:
        write(history_key, {"text": item.get("translatedText"), "version": expected_version}, create=True)
    except StoryError as error:
        if error.code != "REVISION_CONFLICT":
            raise
    value = {**item, "translatedText": text, "status": "EDITED", "version": expected_version + 1}
    write(chunk_key(scope, project_id, chapter_id, plan_id, index), value, etag=etag)
    return value


def approved_key(scope, project_id, chapter_id):
    return base(scope, project_id, chapter_id) + "translations/approved.json"


def approved(scope, project_id, chapter_id):
    chapters.get(scope, project_id, chapter_id)
    return read(approved_key(scope, project_id, chapter_id))


def approved_segment(scope, project_id, chapter_id, revision, index):
    if type(index) is not int or not 0 <= index < 2000:
        raise StoryError(400, "INVALID_ITEM", "Số đoạn không hợp lệ.")
    stored = read(base(scope, project_id, chapter_id) +
                  f"translations/revisions/{require_id(revision)}/{index:04d}.json")
    if not stored:
        raise StoryError(503, "TRANSLATION_MISSING", "Bản dịch đã duyệt chưa đọc được.")
    return stored[0]


def import_segment(scope, project_id, chapter_id, upload_id, index, text):
    require_id(upload_id)
    if type(index) is not int or not 0 <= index < 2000 or not isinstance(text, str) or not text.strip() or len(text) > 10000:
        raise StoryError(400, "INVALID_SEGMENT", "Đoạn bản dịch backup không hợp lệ.")
    key = base(scope, project_id, chapter_id) + f"translations/imports/{upload_id}/{index:04d}.json"
    value = {"index": index, "text": text}
    try:
        write(key, value, create=True)
    except StoryError as error:
        stored = read(key)
        if error.code != "REVISION_CONFLICT" or not stored or stored[0] != value:
            raise
    return {"stored": True, "index": index}


def imported_segments(scope, project_id, chapter_id, upload_id, count):
    require_id(upload_id)
    if type(count) is not int or not 1 <= count <= 2000:
        raise StoryError(400, "INVALID_SEGMENT", "Số đoạn bản dịch không hợp lệ.")
    result = []
    for index in range(count):
        key = base(scope, project_id, chapter_id) + f"translations/imports/{upload_id}/{index:04d}.json"
        stored = read(key)
        if not stored or stored[0].get("index") != index:
            raise StoryError(409, "IMPORT_INCOMPLETE", "Backup bản dịch chưa tải đủ.")
        result.append(stored[0]["text"])
    return result


def approve(scope, project_id, chapter_id, plan, segments, expected_revision):
    current = approved(scope, project_id, chapter_id)
    old, etag = current if current else ({"version": 0}, None)
    if type(expected_revision) is not int or expected_revision != old["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Bản dịch đã duyệt đã đổi.")
    digest = hashlib.sha256(json.dumps([plan["planId"], segments], ensure_ascii=False).encode()).hexdigest()
    revision = digest[:32]
    for index, text in enumerate(segments):
        key = base(scope, project_id, chapter_id) + f"translations/revisions/{revision}/{index:04d}.json"
        try:
            write(key, {"index": index, "text": text, "hash": hashlib.sha256(text.encode()).hexdigest()}, create=True)
        except StoryError as error:
            stored = read(key)
            if error.code != "REVISION_CONFLICT" or not stored or stored[0]["text"] != text:
                raise
    result = {"version": old["version"] + 1, "revision": revision, "planId": plan["planId"],
              "sourceRevision": plan["sourceRevision"], "sourceContentRevision": plan["contentRevision"],
              "sourceLang": plan["sourceLang"], "targetLang": plan["targetLang"],
              "glossaryRevision": plan["glossaryRevision"], "segmentCount": len(segments),
              "textLength": sum(len(text) for text in segments), "checksum": digest,
              "approvedAt": projects.now()}
    manifest_key = base(scope, project_id, chapter_id) + f"translations/revisions/{revision}/manifest.json"
    try:
        write(manifest_key, result, create=True)
    except StoryError as error:
        stored = read(manifest_key)
        if error.code != "REVISION_CONFLICT" or not stored or stored[0].get("checksum") != digest:
            raise
    write(approved_key(scope, project_id, chapter_id), result, etag=etag, create=etag is None)
    return result
