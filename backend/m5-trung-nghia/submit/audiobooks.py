"""Project/chapter HTTP adapter. S3 storage and CAS belong to M3 common."""

import json
import re

from tts_common import story_chapters as chapters, story_content as content, story_projects as projects
from tts_common.errors import error_response, json_response, log_json
from tts_common.story_store import StoryError, new_id, page

ROUTE = re.compile(r"^/audiobooks(?:/([a-f0-9]{32})(?:/chapters(?:/([a-f0-9]{32})(?:/(segments|source|uploads|commit))?)?)?)?$")


def _body(event):
    try:
        value = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        value = None
    if not isinstance(value, dict):
        raise StoryError(400, "INVALID_INPUT", "Nội dung JSON không hợp lệ.")
    return value


def _query(event):
    value = event.get("queryStringParameters") or {}
    if not isinstance(value, dict):
        raise StoryError(400, "INVALID_CURSOR", "Trang danh sách không hợp lệ.")
    return value


def _key(event):
    for name, value in (event.get("headers") or {}).items():
        if name.lower() == "idempotency-key":
            return value
    return None


def _list(items, query):
    subset, cursor = page(items, query.get("limit"), query.get("cursor"))
    return {"items": subset, "nextCursor": cursor}


def _run(event):
    path, method = event.get("path", ""), event.get("httpMethod", "")
    if "/translation-plans" in path or "/translation-drafts/" in path or "/approved-translation" in path or path.endswith("/glossary"):
        import story_translation_api
        return story_translation_api.run(event)
    if "/cover" in path:
        import story_covers_api
        return story_covers_api.run(event)
    if "/audio-plans" in path or "/audio-progress" in path:
        import story_api
        return story_api.run(event)
    match = ROUTE.fullmatch(path)
    if not match:
        raise StoryError(404, "NOT_FOUND", "Không tìm thấy tài nguyên truyện.")
    project_id, chapter_id, action = match.groups()
    scope = (event.get("requestContext") or {}).get("scope")
    if scope != "demo":
        raise StoryError(403, "FORBIDDEN", "Không có quyền xem dữ liệu này.")
    query = _query(event)
    if project_id is None:
        if method == "GET":
            return 200, _list(projects.list_all(scope), query)
        if method == "POST":
            return 201, projects.create(scope, _body(event), _key(event))
    elif chapter_id is None and "/chapters" not in path:
        if method == "GET":
            return 200, projects.details(scope, project_id)
        if method == "PATCH":
            return 200, projects.update(scope, project_id, _body(event))
        if method == "DELETE":
            body = _body(event)
            if body.get("confirm") is not True:
                raise StoryError(400, "CONFIRM_REQUIRED", "Cần xác nhận xóa dự án.")
            return 200, projects.delete(scope, project_id, body.get("version"))
    elif chapter_id is None:
        if method == "GET":
            return 200, _list(chapters.list_all(scope, project_id), query)
        if method == "POST":
            return 201, chapters.create(scope, project_id, _body(event), _key(event))
    elif action is None:
        if method == "GET":
            return 200, chapters.get(scope, project_id, chapter_id)[0]
        if method == "PATCH":
            return 200, chapters.update(scope, project_id, chapter_id, _body(event))
        if method == "DELETE":
            body = _body(event)
            if body.get("confirm") is not True:
                raise StoryError(400, "CONFIRM_REQUIRED", "Cần xác nhận xóa chương.")
            return 200, chapters.delete(scope, project_id, chapter_id, body.get("revision"))
    elif action == "segments" and method == "GET":
        return 200, content.segments_page(scope, project_id, chapter_id,
                                           query.get("limit", 25), query.get("cursor"))
    elif action == "source" and method == "GET":
        return 200, content.source_page(scope, project_id, chapter_id, query.get("cursor"))
    elif action == "uploads" and method == "PUT":
        body = _body(event)
        return 200, content.upload(scope, project_id, chapter_id, body.get("uploadId"),
                                    body.get("index"), body.get("text"))
    elif action == "commit" and method == "POST":
        body = _body(event)
        return 200, content.commit(scope, project_id, chapter_id, body.get("uploadId"),
                                    body.get("count"), body.get("revision"), body.get("segmentLengths"))
    raise StoryError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.")


def handler(event, context):
    try:
        status, data = _run(event)
        return json_response(status, data)
    except StoryError as error:
        return error_response(error.status, error.code, str(error))
    except Exception as error:
        log_json(module="M5", operation="audiobooks", status="ERROR", errorCode=type(error).__name__)
        return error_response(503, "STORY_UNAVAILABLE", "Chưa truy cập được dữ liệu truyện.")
