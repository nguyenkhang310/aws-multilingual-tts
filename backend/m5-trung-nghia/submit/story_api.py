"""Audiobook plan, start, tick and persisted progress HTTP routes."""

import re

from tts_common import db, story_batch_store as batches
from tts_common.story_store import StoryError, page, require_id

import story_plan
import story_progress
import story_runner
import story_control

ROUTE = re.compile(r"^/audiobooks/([a-f0-9]{32})/chapters/([a-f0-9]{32})/(audio-plans(?:/([a-f0-9]{32})(?:/(start|tick|pause|resume|chapter-audio)|/segments/([a-f0-9]{32})/retry)?)?|audio-progress)$")


def summary(scope, plan):
    result = {key: value for key, value in plan.items() if key not in {"segments", "fingerprint"}}
    run = batches.get_run(scope, plan["projectId"], plan["chapterId"], plan["planId"])
    if run:
        result.update(status=run[0]["status"], approvedAt=run[0]["approvedAt"])
    return result


def run(event):
    from audiobooks import _body, _query
    match = ROUTE.fullmatch(event.get("path", ""))
    if not match:
        raise StoryError(404, "NOT_FOUND", "Không tìm thấy kế hoạch audio.")
    project_id, chapter_id, action, plan_id, operation, segment_id = match.groups()
    scope = (event.get("requestContext") or {}).get("scope")
    if scope != "demo":
        raise StoryError(403, "FORBIDDEN", "Không có quyền xem dữ liệu này.")
    method = event.get("httpMethod")
    if action == "audio-plans" and method == "POST":
        return 201, summary(scope, story_plan.create(scope, project_id, chapter_id, _body(event)))
    if action == "audio-plans" and method == "GET":
        query = _query(event)
        items, cursor = page(batches.list_plans(scope, project_id, chapter_id), query.get("limit"), query.get("cursor"))
        return 200, {"items": [summary(scope, item) for item in items], "nextCursor": cursor,
                     "quotaRemainingEstimate": db.remaining_chars()}
    if action == "audio-progress" and method == "GET":
        query = _query(event)
        plan_id = require_id(query.get("planId"))
        plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
        return 200, story_progress.result(scope, project_id, chapter_id, plan, query.get("limit", 25), query.get("cursor"))
    if plan_id and not operation and method == "GET":
        return 200, summary(scope, batches.get_plan(scope, project_id, chapter_id, plan_id))
    if plan_id and operation == "chapter-audio" and method in {"GET", "POST"}:
        import story_chapter_merge
        return (200 if method == "GET" else 202), (story_chapter_merge.status(scope, project_id, chapter_id, plan_id)
            if method == "GET" else story_chapter_merge.advance(scope, project_id, chapter_id, plan_id))
    if plan_id and operation == "start" and method == "POST":
        return 202, story_runner.start(scope, project_id, chapter_id, plan_id)
    if plan_id and operation == "tick" and method == "POST":
        return 200, story_runner.tick(scope, project_id, chapter_id, plan_id)
    if plan_id and operation == "pause" and method == "POST":
        return 200, story_control.pause(scope, project_id, chapter_id, plan_id)
    if plan_id and operation == "resume" and method == "POST":
        return 202, story_control.resume(scope, project_id, chapter_id, plan_id)
    if plan_id and segment_id and method == "POST":
        plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
        index = next((index for index, item in enumerate(plan["segments"])
                      if item["segmentId"] == segment_id), None)
        if index is None:
            raise StoryError(404, "SEGMENT_NOT_FOUND", "Không tìm thấy đoạn cần thử lại.")
        return 202, story_control.retry(scope, project_id, chapter_id, plan_id, index)
    raise StoryError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.")
