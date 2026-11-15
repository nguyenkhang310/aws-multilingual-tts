"""Validate a fixed TTS plan from stored chapter segments, never client text."""

import hashlib
import json
import math
import os

from tts_common import config, story_chapters, story_content, story_batch_store, story_projects, story_translation_store
from tts_common.expression import validate_intensity, validate_style
from tts_common.story_store import StoryError
from tts_common.story_projects import now


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def _settings(scope, project_id, chapter, body):
    import app
    provider = body.get("provider")
    if provider not in {"azure", "gemini"}:
        raise StoryError(400, "INVALID_PROVIDER", "Chọn nguồn Azure hoặc Gemini.")
    translated = body.get("textSource", "original") == "approved_translation"
    if body.get("textSource", "original") not in {"original", "approved_translation"}:
        raise StoryError(400, "INVALID_TEXT_SOURCE", "Nguồn văn bản không hợp lệ.")
    approved = story_translation_store.approved(scope, project_id, chapter["chapterId"]) if translated else None
    if translated and not approved:
        raise StoryError(409, "TRANSLATION_NOT_APPROVED", "Cần duyệt bản dịch trước khi tạo audio.")
    if translated and approved[0]["sourceContentRevision"] != chapter["contentRevision"]:
        raise StoryError(409, "TRANSLATION_STALE", "Chương đã đổi; duyệt bản dịch mới trước khi tạo audio.")
    if translated and body.get("translateTo") is not None:
        raise StoryError(400, "DOUBLE_TRANSLATION", "Bản dịch đã duyệt không được dịch lại.")
    target = body.get("translateTo")
    if target is not None:
        project, _ = story_projects.get(scope, project_id)
        if target != project["targetLang"] or target == chapter["sourceLang"]:
            raise StoryError(400, "INVALID_TARGET_LANGUAGE", "Ngôn ngữ đích không khớp dự án.")
        if not os.environ.get("TRANSLATOR_API_PARAMETER_NAME"):
            raise StoryError(503, "TRANSLATION_NOT_CONFIGURED", "Chưa kết nối Azure Translator để đọc bản dịch.")
    try:
        entry = app._find_entry(approved[0]["targetLang"] if translated else target or chapter["sourceLang"], provider)
        voice = app._pick_voice(entry, body.get("voice"))
        speed = app._pick_speed(entry, body.get("speed"))
        style = body.get("style", "neutral")
        validate_style(entry, voice, style)
        intensity = validate_intensity(style, body.get("styleIntensity", 1.0))
    except app.InvalidRequest as error:
        payload = json.loads(error.response["body"])["error"]
        raise StoryError(error.response["statusCode"], payload["code"], payload["message"]) from None
    except ValueError as error:
        code = str(error)
        raise StoryError(503 if code == "EMOTION_NOT_CONFIGURED" else 400, code,
                         "Chưa bật nhận diện sắc thái." if code == "EMOTION_NOT_CONFIGURED"
                         else "Giọng hoặc sắc thái chưa được hỗ trợ.") from None
    return {"provider": provider, "voice": voice,
            "language": approved[0]["targetLang"] if translated else chapter["sourceLang"],
            "translateTo": target, "textSource": "approved_translation" if translated else "original",
            "translationRevision": approved[0]["revision"] if translated else None,
            "speed": speed, "style": style, "resolvedStyle": style, "styleIntensity": intensity,
            "engine": entry.get("engine")}


def _segments(scope, project_id, chapter_id, chapter):
    refs, items, cursor, total_chars = [], [], None, 0
    while True:
        page = story_content.segments_page(scope, project_id, chapter_id, 50, cursor)
        for segment in page["items"]:
            text = segment["sourceText"]
            if not text.strip() or len(text) > config.MAX_CHARS:
                raise StoryError(400, "SEGMENT_UNREADABLE", "Có đoạn rỗng hoặc vượt giới hạn tạo giọng.")
            index = len(refs)
            ref = {"segmentId": segment["segmentId"], "revision": segment["revision"],
                   "order": index, "sourceHash": hashlib.sha256(text.encode()).hexdigest(),
                   "charCount": len(text)}
            refs.append(ref)
            items.append({**ref, "index": index, "status": "QUEUED", "jobId": None,
                          "attemptCount": 0, "attempts": []})
            total_chars += len(text)
            if len(refs) > story_batch_store.MAX_ITEMS:
                raise StoryError(413, "PLAN_TOO_LARGE", "Chương có quá nhiều đoạn cho một kế hoạch.")
        cursor = page["nextCursor"]
        if not cursor:
            break
    if not refs or len(refs) != chapter["segmentCount"]:
        raise StoryError(409, "CHAPTER_CHANGED", "Nội dung chương đã thay đổi; tải lại trước khi lập kế hoạch.")
    return refs, items, total_chars


def _translated_segments(scope, project_id, chapter_id, approved):
    refs, items, total_chars = [], [], 0
    for index in range(approved["segmentCount"]):
        segment = story_translation_store.approved_segment(scope, project_id, chapter_id,
                                                             approved["revision"], index)
        text = segment["text"]
        if not text.strip() or len(text) > config.MAX_CHARS:
            raise StoryError(409, "TRANSLATION_UNREADABLE", "Đoạn dịch đã duyệt không hợp lệ.")
        ref = {"segmentId": _digest([approved["revision"], index])[:32],
               "revision": approved["version"], "order": index,
               "sourceHash": segment["hash"], "charCount": len(text)}
        refs.append(ref)
        items.append({**ref, "index": index, "status": "QUEUED", "jobId": None,
                      "attemptCount": 0, "attempts": []})
        total_chars += len(text)
    return refs, items, total_chars


def create(scope, project_id, chapter_id, body):
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    if chapter.get("status") != "READY" or not chapter.get("contentRevision"):
        raise StoryError(400, "CHAPTER_NOT_READY", "Hãy lưu nội dung chương trước khi tạo audio.")
    if type(body.get("chapterRevision")) is not int or body["chapterRevision"] != chapter["revision"]:
        raise StoryError(409, "REVISION_CONFLICT", "Chương đã đổi. Tải lại trước khi duyệt kế hoạch.")
    settings = _settings(scope, project_id, chapter, body)
    translated = settings["textSource"] == "approved_translation"
    approved = story_translation_store.approved(scope, project_id, chapter_id)[0] if translated else None
    if translated and approved["revision"] != settings["translationRevision"]:
        raise StoryError(409, "TRANSLATION_CHANGED", "Bản dịch đã đổi; tải lại.")
    refs, items, total_chars = (_translated_segments(scope, project_id, chapter_id, approved)
                                if translated else _segments(scope, project_id, chapter_id, chapter))
    latest, _ = story_chapters.get(scope, project_id, chapter_id)
    if latest["revision"] != chapter["revision"] or latest["contentRevision"] != chapter["contentRevision"]:
        raise StoryError(409, "CHAPTER_CHANGED", "Chương đã đổi trong lúc lập kế hoạch.")
    fingerprint = _digest([scope, project_id, chapter_id, chapter["revision"],
                           chapter["contentRevision"], settings, refs])
    plan = {"schemaVersion": 1, "planId": fingerprint[:32], "fingerprint": fingerprint,
            "projectId": project_id, "chapterId": chapter_id,
            "sourceChapterRevision": chapter["revision"], "contentRevision": chapter["contentRevision"],
            "planRevision": 1, "segments": refs, "total": len(refs), "totalChars": total_chars,
            "providerCallsEstimate": sum(math.ceil(ref["charCount"] / 1000) for ref in refs) if settings["provider"] == "gemini" else None,
            "createdAt": now(), "approvedAt": None, "status": "DRAFT", **settings}
    return story_batch_store.create_plan(scope, project_id, chapter_id, plan, items)
