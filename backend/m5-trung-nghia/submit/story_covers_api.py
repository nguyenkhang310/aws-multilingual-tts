"""HTTP routes for presigned audiobook cover upload, delivery and removal."""

import json
import re

from tts_common import story_covers
from tts_common.errors import json_response
from tts_common.story_store import StoryError

ROUTE = re.compile(r"^/audiobooks/([a-f0-9]{32})/cover(-upload)?$")


def _body(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        body = None
    if not isinstance(body, dict):
        raise StoryError(400, "INVALID_INPUT", "Nội dung JSON không hợp lệ.")
    return body


def run(event):
    match = ROUTE.fullmatch(event.get("path", ""))
    if not match:
        raise StoryError(404, "NOT_FOUND", "Không tìm thấy ảnh bìa.")
    project_id, upload_route = match.groups()
    scope = (event.get("requestContext") or {}).get("scope")
    if scope != "demo":
        raise StoryError(403, "FORBIDDEN", "Không có quyền xem dự án này.")
    method = event.get("httpMethod", "")
    if upload_route and method == "POST":
        body = _body(event)
        return 201, story_covers.begin(scope, project_id, body.get("contentType"),
                                      body.get("sizeBytes"), body.get("version"))
    if upload_route:
        raise StoryError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.")
    if method == "GET":
        from tts_common import story_projects
        project, _ = story_projects.get(scope, project_id)
        cover = story_covers.public_view(scope, project_id, project)
        if cover is None:
            raise StoryError(404, "COVER_NOT_FOUND", "Dự án chưa có ảnh bìa.")
        return 200, {"cover": cover}
    if method == "POST":
        body = _body(event)
        return 200, {"project": story_covers.commit(scope, project_id,
            body.get("uploadId"), body.get("version"))}
    if method == "DELETE":
        return 200, {"project": story_covers.clear(scope, project_id, _body(event).get("version"))}
    raise StoryError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.")


def handler(event, context):
    try:
        status, body = run(event)
        return json_response(status, body)
    except StoryError as error:
        from tts_common.errors import error_response
        return error_response(error.status, error.code, str(error))
