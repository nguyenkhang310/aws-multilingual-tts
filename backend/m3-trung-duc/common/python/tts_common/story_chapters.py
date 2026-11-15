"""Project-scoped chapter metadata and optimistic revisions."""

import hashlib
import json

from . import story_projects as projects
from .story_store import StoryError, children, new_id, read, require_id, root, write


def prefix(scope, project_id, chapter_id):
    return f"{root(scope)}{require_id(project_id)}/chapters/{require_id(chapter_id)}/"


def get(scope, project_id, chapter_id):
    projects.get(scope, project_id)
    stored = read(projects.chapter_key(scope, project_id, chapter_id))
    if not stored or stored[0].get("deleted"):
        raise StoryError(404, "CHAPTER_NOT_FOUND", "Không tìm thấy chương.")
    if stored[0].get("schemaVersion") != 1:
        raise StoryError(503, "SCHEMA_UNSUPPORTED", "Chương có phiên bản dữ liệu chưa được hỗ trợ.")
    return stored


def list_all(scope, project_id, include_deleted=False):
    projects.get(scope, project_id)
    base = f"{root(scope)}{require_id(project_id)}/chapters/"
    chapters = []
    for child in children(base):
        stored = read(f"{child}metadata.json")
        if stored and (include_deleted or not stored[0].get("deleted")) and stored[0].get("schemaVersion") == 1:
            chapters.append(stored[0])
    return sorted(chapters, key=lambda item: (item["order"], item["chapterNumber"], item["chapterId"]))


def create(scope, project_id, body, key=None):
    project, _ = projects.get(scope, project_id)
    number = body.get("chapterNumber")
    order = body.get("order", number)
    if type(number) is not int or not 1 <= number <= 100000 or type(order) is not int or not 0 <= order <= 100000:
        raise StoryError(400, "INVALID_ORDER", "Số và thứ tự chương không hợp lệ.")
    name = projects.title(body.get("title"), "Tên chương")
    lang = projects.language(body.get("sourceLang", project["sourceLang"]))
    request_hash = hashlib.sha256(json.dumps([number, order, name, lang], ensure_ascii=False).encode()).hexdigest()
    chapter_id = new_id(scope, f"chapter:{project_id}", key)
    timestamp = projects.now()
    data = {"schemaVersion": 1, "chapterId": chapter_id, "projectId": project_id,
            "chapterNumber": number, "title": name, "order": order, "sourceLang": lang,
            "textLength": 0, "segmentCount": 0, "status": "DRAFT", "revision": 1,
            "contentRevision": None, "lastUploadId": None, "requestHash": request_hash,
            "createdAt": timestamp, "updatedAt": timestamp}
    metadata_key = projects.chapter_key(scope, project_id, chapter_id)
    try:
        write(metadata_key, data, create=True)
    except StoryError as error:
        existing = read(metadata_key)
        same = existing and existing[0].get("requestHash") == request_hash
        if error.code != "REVISION_CONFLICT" or not same or existing[0].get("deleted"):
            raise
        return existing[0]
    return data


def update(scope, project_id, chapter_id, body):
    current, etag = get(scope, project_id, chapter_id)
    if type(body.get("revision")) is not int:
        raise StoryError(400, "INVALID_REVISION", "Revision chương không hợp lệ.")
    if body.get("revision") != current["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã đổi. Tải lại trước khi lưu.")
    changes = {}
    for field in ("title", "chapterNumber", "order", "sourceLang", "status"):
        if field not in body:
            continue
        value = body[field]
        if field == "title":
            value = projects.title(value, "Tên chương")
        elif field in ("chapterNumber", "order"):
            if type(value) is not int or not 0 <= value <= 100000 or (field == "chapterNumber" and value == 0):
                raise StoryError(400, "INVALID_ORDER", "Số hoặc thứ tự chương không hợp lệ.")
        elif field == "sourceLang":
            value = projects.language(value)
        elif value not in {"DRAFT", "READY", "ARCHIVED"} or (value == "READY" and not current["contentRevision"]):
            raise StoryError(400, "INVALID_STATUS", "Trạng thái chương không hợp lệ.")
        changes[field] = value
    if not changes:
        raise StoryError(400, "INVALID_INPUT", "Không có nội dung cần cập nhật.")
    result = {**current, **changes, "revision": current["revision"] + 1, "updatedAt": projects.now()}
    write(projects.chapter_key(scope, project_id, chapter_id), result, etag=etag)
    return result


def delete(scope, project_id, chapter_id, revision):
    current, etag = get(scope, project_id, chapter_id)
    if type(revision) is not int:
        raise StoryError(400, "INVALID_REVISION", "Revision chương không hợp lệ.")
    if revision != current["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã đổi. Tải lại trước khi xóa.")
    write(projects.chapter_key(scope, project_id, chapter_id),
          {**current, "deleted": True, "revision": revision + 1, "updatedAt": projects.now()}, etag=etag)
    return {"deleted": True}



