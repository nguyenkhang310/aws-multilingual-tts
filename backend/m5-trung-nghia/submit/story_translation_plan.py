"""Immutable chapter translation snapshots; source text stays in M3 S3 records."""

import hashlib
import json
import os

from tts_common import story_chapters, story_content, story_projects, story_translation_store as store
from tts_common.story_store import StoryError

from story_translation_text import split


def create(scope, project_id, chapter_id, body):
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    project, _ = story_projects.get(scope, project_id)
    if not chapter.get("contentRevision"):
        raise StoryError(400, "CHAPTER_NOT_READY", "Hãy lưu nội dung chương trước khi dịch.")
    if body.get("chapterRevision") != chapter["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã đổi; tải lại trước khi dịch.")
    source, target = chapter["sourceLang"], body.get("targetLang", project["targetLang"])
    story_projects.language(target)
    if source == "und" or source == target:
        raise StoryError(400, "INVALID_LANGUAGE", "Cần chọn ngôn ngữ gốc và đích khác nhau.")
    if not os.environ.get("TRANSLATOR_API_PARAMETER_NAME"):
        raise StoryError(503, "TRANSLATION_NOT_CONFIGURED", "Chưa cấu hình Azure Translator.")
    glossary, _ = store.glossary(scope, project_id)
    parts, cursor = [], None
    while True:
        page = story_content.source_page(scope, project_id, chapter_id, cursor)
        if page["contentRevision"] != chapter["contentRevision"]:
            raise StoryError(409, "CHAPTER_CHANGED", "Chương đã đổi khi lập kế hoạch.")
        parts.append(page["text"])
        cursor = page["nextCursor"]
        if not cursor:
            break
    source_text = "".join(parts)
    chunks = split(source_text)
    latest, _ = story_chapters.get(scope, project_id, chapter_id)
    if latest["revision"] != chapter["revision"] or latest["contentRevision"] != chapter["contentRevision"]:
        raise StoryError(409, "CHAPTER_CHANGED", "Chương đã đổi khi lập kế hoạch.")
    fingerprint = hashlib.sha256(json.dumps([project_id, chapter_id, chapter["revision"],
        chapter["contentRevision"], source, target, glossary], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    plan = {"schemaVersion": 1, "planId": fingerprint[:32], "fingerprint": fingerprint,
            "projectId": project_id, "chapterId": chapter_id,
            "sourceRevision": chapter["revision"], "contentRevision": chapter["contentRevision"],
            "sourceLang": source, "targetLang": target, "glossaryRevision": glossary["revision"],
            "glossary": glossary["entries"], "total": len(chunks), "totalChars": len(source_text),
            "createdAt": story_projects.now()}
    return store.create_plan(scope, project_id, chapter_id, plan, chunks)


def restore(scope, project_id, chapter_id, plan_id, body, imported_chunks):
    """Bind backed-up draft text to current source revisions without starting Azure."""
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    project, _ = story_projects.get(scope, project_id)
    target = body.get("targetLang")
    if (target != project["targetLang"] or target == chapter["sourceLang"] or
            not chapter.get("contentRevision")):
        raise StoryError(409, "IMPORT_MISMATCH", "Nguồn hoặc ngôn ngữ bản nháp không khớp.")
    source, cursor = [], None
    while True:
        page = story_content.source_page(scope, project_id, chapter_id, cursor)
        if page["contentRevision"] != chapter["contentRevision"]:
            raise StoryError(409, "CHAPTER_CHANGED", "Chương đã đổi khi khôi phục bản dịch.")
        source.append(page["text"])
        cursor = page["nextCursor"]
        if not cursor:
            break
    chunks = [item["sourceText"] for item in imported_chunks]
    if "".join(chunks) != "".join(source):
        raise StoryError(409, "IMPORT_MISMATCH", "Nguồn phần dịch không khớp nội dung chương.")
    glossary, _ = store.glossary(scope, project_id)
    reference = body.get("sourceReference") or {}
    if (type(reference.get("sourceRevision")) is not int or
            type(reference.get("glossaryRevision")) is not int or
            not isinstance(reference.get("contentRevision"), str)):
        raise StoryError(400, "INVALID_DRAFT", "Thông tin phiên bản bản nháp không hợp lệ.")
    reference = {key: reference[key] for key in ("sourceRevision", "contentRevision", "glossaryRevision")}
    fingerprint = hashlib.sha256(json.dumps([plan_id, chapter["contentRevision"], target,
        imported_chunks, reference], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    plan = {"schemaVersion": 1, "planId": plan_id, "fingerprint": fingerprint,
            "projectId": project_id, "chapterId": chapter_id,
            "sourceRevision": chapter["revision"], "contentRevision": chapter["contentRevision"],
            "sourceLang": chapter["sourceLang"], "targetLang": target,
            "glossaryRevision": glossary["revision"], "glossary": glossary["entries"],
            "total": len(chunks), "totalChars": sum(map(len, chunks)),
            "createdAt": story_projects.now(), "restoredFrom": reference}
    return store.restore_draft(scope, project_id, chapter_id, plan,
                               imported_chunks)
