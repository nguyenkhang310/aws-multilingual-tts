"""Read an approved segment and submit it through the existing M5 service."""

import hashlib
import json

from tts_common import config, story_content, story_translation_store
from tts_common.story_store import StoryError

from story_progress import request_key


def checked_segment(scope, project_id, chapter_id, plan, item):
    if plan.get("textSource") == "approved_translation":
        segment = story_translation_store.approved_segment(scope, project_id, chapter_id,
            plan["translationRevision"], item["index"])
        text = segment["text"]
        if hashlib.sha256(text.encode()).hexdigest() != item["sourceHash"] or not text.strip():
            raise StoryError(409, "SEGMENT_CHANGED", "Đoạn dịch đã duyệt không khớp kế hoạch.")
        return text
    segment = story_content.segment_at(scope, project_id, chapter_id, plan["contentRevision"], item["index"])
    text = segment["sourceText"]
    if (segment["segmentId"] != item["segmentId"] or segment["revision"] != item["revision"]
            or hashlib.sha256(text.encode()).hexdigest() != item["sourceHash"] or not text.strip()
            or len(text) > config.MAX_CHARS):
        raise StoryError(409, "SEGMENT_CHANGED", "Đoạn đã duyệt không còn khớp kế hoạch.")
    return text


def submit(scope, plan, item, text, attempt=1):
    from app import _synthesize
    index = item.get("index", item.get("order", 0))
    body = {"text": text, "lang": plan["language"], "voice": plan["voice"],
            "speed": plan["speed"], "provider": plan["provider"], "style": plan["style"],
            "styleIntensity": plan["styleIntensity"], "translateTo": plan.get("translateTo")}
    event = {"body": json.dumps(body, ensure_ascii=False),
             "headers": {"Idempotency-Key": request_key(plan, item, attempt)},
             "storyContext": {"projectId": plan["projectId"], "chapterId": plan["chapterId"],
                 "planId": plan["planId"], "segmentId": item["segmentId"], "index": index,
                 "attempt": attempt, "planRevision": plan["planRevision"]},
             "requestContext": {"scope": scope}}
    response = _synthesize(event)
    return response["statusCode"], json.loads(response["body"])
