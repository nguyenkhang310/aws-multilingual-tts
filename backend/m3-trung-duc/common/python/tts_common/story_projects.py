"""Project metadata; chapter counts are derived from committed chapter records."""

import hashlib
import json
import re
from datetime import datetime, timezone

from .story_store import StoryError, children, new_id, read, require_id, root, write


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def project_key(scope, project_id):
    return f"{root(scope)}{require_id(project_id)}/project.json"


def chapter_key(scope, project_id, chapter_id):
    return f"{root(scope)}{require_id(project_id)}/chapters/{require_id(chapter_id)}/metadata.json"


def title(value, label="Tên"):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 120 or "\x00" in value:
        raise StoryError(400, "INVALID_TITLE", f"{label} cần từ 1 đến 120 ký tự.")
    return value.strip()


def language(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}", value):
        raise StoryError(400, "INVALID_LANGUAGE", "Mã ngôn ngữ không hợp lệ.")
    return value


def get(scope, project_id):
    stored = read(project_key(scope, project_id))
    if not stored or stored[0].get("deleted"):
        raise StoryError(404, "PROJECT_NOT_FOUND", "Không tìm thấy dự án truyện.")
    if stored[0].get("schemaVersion") != 1:
        raise StoryError(503, "SCHEMA_UNSUPPORTED", "Dự án có phiên bản dữ liệu chưa được hỗ trợ.")
    return stored


def create(scope, body, key=None):
    name, source = title(body.get("title")), language(body.get("sourceLang"))
    target = language(body.get("targetLang"))
    description = body.get("description", "")
    if not isinstance(description, str) or len(description) > 1000:
        raise StoryError(400, "INVALID_DESCRIPTION", "Mô tả tối đa 1.000 ký tự.")
    project_id = new_id(scope, "project", key)
    fingerprint = hashlib.sha256(json.dumps([name, description, source, target], ensure_ascii=False).encode()).hexdigest()
    timestamp = now()
    data = {"schemaVersion": 1, "projectId": project_id, "title": name, "description": description,
            "sourceLang": source, "targetLang": target, "chapterCount": 0,
            "createdAt": timestamp, "updatedAt": timestamp, "version": 1, "status": "DRAFT",
            "requestHash": fingerprint}
    try:
        write(project_key(scope, project_id), data, create=True)
    except StoryError as error:
        existing = read(project_key(scope, project_id))
        if error.code != "REVISION_CONFLICT" or not existing or existing[0].get("requestHash") != fingerprint or existing[0].get("deleted"):
            raise
        return details(scope, project_id)
    return data


def details(scope, project_id):
    data, _ = get(scope, project_id)
    from .story_chapters import list_all
    from .story_covers import public_view
    chapters = list_all(scope, project_id, include_deleted=True)
    updated = max([data["updatedAt"], *(item["updatedAt"] for item in chapters)])
    public = {key: value for key, value in data.items() if not key.startswith("cover")}
    return {**public, "chapterCount": sum(not item.get("deleted") for item in chapters), "updatedAt": updated,
            "cover": public_view(scope, project_id, data)}


def set_cover(scope, project_id, version, key, image):
    data, etag = get(scope, project_id)
    if type(version) is not int or version != data["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi lưu ảnh.")
    timestamp = now()
    result = {**data, "coverKey": key, "coverContentType": image["contentType"],
              "coverSizeBytes": image["sizeBytes"], "coverWidth": image["width"],
              "coverHeight": image["height"], "coverUpdatedAt": timestamp,
              "version": version + 1, "updatedAt": timestamp}
    write(project_key(scope, project_id), result, etag=etag)
    return details(scope, project_id)


def clear_cover(scope, project_id, version):
    data, etag = get(scope, project_id)
    if type(version) is not int or version != data["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi xóa ảnh.")
    fields = ("coverKey", "coverContentType", "coverSizeBytes", "coverWidth", "coverHeight", "coverUpdatedAt")
    if not data.get("coverKey"):
        return details(scope, project_id)
    result = {key: value for key, value in data.items() if key not in fields}
    timestamp = now()
    result.update(version=version + 1, updatedAt=timestamp)
    write(project_key(scope, project_id), result, etag=etag)
    return details(scope, project_id)


def list_all(scope):
    project_keys = (f"{prefix}project.json" for prefix in children(root(scope)))
    projects = []
    for key in project_keys:
        stored = read(key)
        if stored and not stored[0].get("deleted") and stored[0].get("schemaVersion") == 1:
            projects.append(details(scope, stored[0]["projectId"]))
    return sorted(projects, key=lambda item: (item["updatedAt"], item["projectId"]), reverse=True)


def update(scope, project_id, body):
    data, etag = get(scope, project_id)
    if type(body.get("version")) is not int:
        raise StoryError(400, "INVALID_VERSION", "Phiên bản dự án không hợp lệ.")
    if body.get("version") != data["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi lưu.")
    changes = {}
    for field in ("title", "description", "sourceLang", "targetLang"):
        if field in body:
            changes[field] = (title(body[field]) if field == "title" else language(body[field]) if field.endswith("Lang") else body[field])
    if "description" in changes and (not isinstance(changes["description"], str) or len(changes["description"]) > 1000):
        raise StoryError(400, "INVALID_DESCRIPTION", "Mô tả tối đa 1.000 ký tự.")
    if not changes:
        raise StoryError(400, "INVALID_INPUT", "Không có nội dung cần cập nhật.")
    result = {**data, **changes, "version": data["version"] + 1, "updatedAt": now()}
    write(project_key(scope, project_id), result, etag=etag)
    return details(scope, project_id)


def delete(scope, project_id, version):
    data, etag = get(scope, project_id)
    if type(version) is not int:
        raise StoryError(400, "INVALID_VERSION", "Phiên bản dự án không hợp lệ.")
    if version != data["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi xóa.")
    write(project_key(scope, project_id), {**data, "deleted": True, "version": version + 1, "updatedAt": now()}, etag=etag)
    return {"deleted": True}
