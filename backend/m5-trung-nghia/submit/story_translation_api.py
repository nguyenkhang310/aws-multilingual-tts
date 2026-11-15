"""HTTP contract for glossary, translation review and bounded chapter runs."""

import re

from tts_common import story_chapters, story_projects, story_translation_store as store
from tts_common.story_store import StoryError, page
from tts_common.story_text import split as audio_split

import story_translation_plan as plans
import story_translation_run as runs

ID = r"[a-f0-9]{32}"
GLOSSARY = re.compile(rf"^/audiobooks/({ID})/glossary$")
ROUTE = re.compile(rf"^/audiobooks/({ID})/chapters/({ID})/translation-plans"
                   rf"(?:/({ID})(?:/(start|tick|pause|resume|approve|progress|chunks(?:/(\d{{1,4}}))?(?:/retry)?))?)?$")
APPROVED = re.compile(rf"^/audiobooks/({ID})/chapters/({ID})/approved-translation(?:/(\d{{1,4}}))?$")
IMPORT = re.compile(rf"^/audiobooks/({ID})/chapters/({ID})/approved-translation/import/({ID})/(\d{{1,4}}|commit)$")


def run(event):
    from audiobooks import _body, _query
    path, method = event.get("path", ""), event.get("httpMethod")
    scope = (event.get("requestContext") or {}).get("scope")
    if scope != "demo":
        raise StoryError(403, "FORBIDDEN", "Không có quyền xem dữ liệu này.")
    match = GLOSSARY.fullmatch(path)
    if match:
        project_id = match.group(1)
        if method == "GET":
            return 200, store.glossary(scope, project_id)[0]
        if method == "PUT":
            body = _body(event)
            return 200, store.save_glossary(scope, project_id, body.get("revision"), body.get("entries"))
    match = IMPORT.fullmatch(path)
    if match:
        project_id, chapter_id, upload_id, step = match.groups()
        body = _body(event)
        if step != "commit" and method == "PUT":
            return 200, store.import_segment(scope, project_id, chapter_id, upload_id,
                                             int(step), body.get("text"))
        if step == "commit" and method == "POST":
            chapter, _ = story_chapters.get(scope, project_id, chapter_id)
            project, _ = story_projects.get(scope, project_id)
            if not chapter.get("contentRevision") or body.get("targetLang") != project["targetLang"]:
                raise StoryError(409, "IMPORT_MISMATCH", "Nguồn hoặc ngôn ngữ backup không khớp.")
            segments = store.imported_segments(scope, project_id, chapter_id, upload_id, body.get("count"))
            plan = {"planId": upload_id, "sourceRevision": chapter["revision"],
                    "contentRevision": chapter["contentRevision"], "sourceLang": chapter["sourceLang"],
                    "targetLang": project["targetLang"],
                    "glossaryRevision": store.glossary(scope, project_id)[0]["revision"]}
            return 200, store.approve(scope, project_id, chapter_id, plan, segments,
                                      body.get("version", 0))
    match = APPROVED.fullmatch(path)
    if match and method == "GET":
        project_id, chapter_id, index = match.groups()
        approved = store.approved(scope, project_id, chapter_id)
        if not approved:
            raise StoryError(404, "TRANSLATION_NOT_APPROVED", "Chương chưa duyệt bản dịch.")
        if index is None:
            return 200, approved[0]
        number = int(index)
        if number >= approved[0]["segmentCount"]:
            raise StoryError(404, "SEGMENT_NOT_FOUND", "Không tìm thấy đoạn bản dịch.")
        return 200, store.approved_segment(scope, project_id, chapter_id, approved[0]["revision"], number)
    match = ROUTE.fullmatch(path)
    if not match:
        raise StoryError(404, "NOT_FOUND", "Không tìm thấy tài nguyên dịch truyện.")
    project_id, chapter_id, plan_id, action, index_text = match.groups()
    story_chapters.get(scope, project_id, chapter_id)
    query = _query(event)
    if not plan_id:
        if method == "POST":
            return 201, plans.create(scope, project_id, chapter_id, _body(event))
        if method == "GET":
            items, cursor = page(store.list_plans(scope, project_id, chapter_id), query.get("limit"), query.get("cursor"))
            return 200, {"items": [{k: v for k, v in item.items() if k != "glossary"} for item in items],
                         "nextCursor": cursor}
    plan = store.get_plan(scope, project_id, chapter_id, plan_id)[0]
    if action is None and method == "GET":
        return 200, {k: v for k, v in plan.items() if k != "glossary"}
    if action == "progress" and method == "GET":
        return 200, runs.progress(scope, project_id, chapter_id, plan_id,
                                   int(query.get("cursor") or 0), int(query.get("limit") or 25))
    if action in {"start", "tick", "pause", "resume"} and method == "POST":
        result = runs.tick(scope, project_id, chapter_id, plan_id) if action == "tick" else \
            runs.control(scope, project_id, chapter_id, plan_id, action)
        return 202 if action in {"start", "resume"} else 200, result
    if action and action.startswith("chunks/") and index_text is not None:
        index = int(index_text)
        if index >= plan["total"]:
            raise StoryError(404, "CHUNK_NOT_FOUND", "Không tìm thấy phần dịch.")
        if action.endswith("/retry") and method == "POST":
            return 200, runs.control(scope, project_id, chapter_id, plan_id, "retry", index)
        if method == "GET":
            return 200, store.get_chunk(scope, project_id, chapter_id, plan_id, index)[0]
        if method == "PUT" and not action.endswith("/retry"):
            body = _body(event)
            text = body.get("translatedText")
            if not isinstance(text, str) or not text.strip() or len(text) > 6000 or type(body.get("version")) is not int:
                raise StoryError(400, "INVALID_TRANSLATION", "Bản dịch cần từ 1 đến 6.000 ký tự.")
            current = store.get_chunk(scope, project_id, chapter_id, plan_id, index)[0]
            if current["status"] not in {"DONE", "EDITED", "FAILED", "UNCERTAIN"}:
                raise StoryError(409, "CHUNK_NOT_READY", "Phần dịch chưa sẵn sàng để sửa.")
            return 200, store.edit_chunk(scope, project_id, chapter_id, plan_id, index,
                                         text, body["version"])
    if action == "approve" and method == "POST":
        body = _body(event)
        chapter, _ = story_chapters.get(scope, project_id, chapter_id)
        glossary = store.glossary(scope, project_id)[0]
        if (chapter["revision"] != plan["sourceRevision"] or
                chapter["contentRevision"] != plan["contentRevision"] or
                glossary["revision"] != plan["glossaryRevision"]):
            raise StoryError(409, "PLAN_STALE", "Nguồn hoặc thuật ngữ đã đổi; lập kế hoạch mới.")
        chunks = [store.get_chunk(scope, project_id, chapter_id, plan_id, i)[0]
                  for i in range(plan["total"])]
        if any(item["status"] not in {"DONE", "EDITED"} for item in chunks):
            raise StoryError(409, "TRANSLATION_INCOMPLETE", "Cần dịch đủ mọi phần trước khi duyệt.")
        segments = audio_split("".join(item["translatedText"] for item in chunks))
        approved = store.approve(scope, project_id, chapter_id, plan, segments, body.get("version", 0))
        return 200, approved
    raise StoryError(405, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.")
