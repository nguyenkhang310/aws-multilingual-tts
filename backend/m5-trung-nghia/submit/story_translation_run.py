"""One bounded Azure translation chunk per tick, with durable CAS checkpoints."""

import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from tts_common import aws, config, story_translation_store as store
from tts_common.story_store import StoryError

from story_translation_text import protect, restore


def progress(scope, project_id, chapter_id, plan_id, offset=0, limit=25):
    plan = store.get_plan(scope, project_id, chapter_id, plan_id)[0]
    run = store.get_run(scope, project_id, chapter_id, plan_id)
    if type(offset) is not int or type(limit) is not int or not 0 <= offset <= plan["total"] or not 1 <= limit <= 50:
        raise StoryError(400, "INVALID_CURSOR", "Trang tiến độ không hợp lệ.")
    counts = {state: 0 for state in ("QUEUED", "RUNNING", "DONE", "EDITED", "FAILED", "UNCERTAIN", "BLOCKED_QUOTA")}
    visible = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        items = list(pool.map(lambda index: store.get_chunk(scope, project_id, chapter_id, plan_id, index)[0],
                              range(plan["total"])))
    for index, item in enumerate(items):
        counts[item["status"]] += 1
        if offset <= index < offset + limit:
            visible.append({key: item.get(key) for key in ("index", "status", "attempts", "errorCode")})
    status = run[0]["status"] if run else "DRAFT"
    if status == "RUNNING" and counts["DONE"] + counts["EDITED"] == plan["total"]:
        status = "READY_FOR_REVIEW"
    return {"planId": plan_id, "status": status, "total": plan["total"], "counts": counts,
            "totalChars": plan["totalChars"], "items": visible,
            "nextCursor": str(offset + limit) if offset + limit < plan["total"] else None}


def _run_change(scope, project_id, chapter_id, plan_id, changes):
    for _ in range(6):
        try:
            return store.update_run(scope, project_id, chapter_id, plan_id, changes)
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Trạng thái dịch đang đổi.")


def _claim(scope, project_id, chapter_id, plan_id):
    stored = store.get_run(scope, project_id, chapter_id, plan_id)
    if not stored or stored[0]["desiredState"] != "RUNNING":
        return None
    run, etag = stored
    if run.get("leaseUntil", 0) > time.time():
        return None
    token = uuid.uuid4().hex
    try:
        store.update_run(scope, project_id, chapter_id, plan_id,
                         {"leaseUntil": int(time.time()) + 90, "leaseToken": token}, etag)
        return token
    except StoryError as error:
        if error.code == "REVISION_CONFLICT":
            return None
        raise


def _release(scope, project_id, chapter_id, plan_id, token):
    stored = store.get_run(scope, project_id, chapter_id, plan_id)
    if stored and stored[0].get("leaseToken") == token:
        _run_change(scope, project_id, chapter_id, plan_id, {"leaseUntil": 0, "leaseToken": None})


def _worker(text, source, target):
    response = aws.lambda_client().invoke(FunctionName=config.SYNTH_FUNCTION_NAME,
        InvocationType="RequestResponse", Payload=json.dumps({"operation": "previewTranslation",
            "text": text, "sourceLang": source, "targetLang": target}, ensure_ascii=False).encode())
    if response.get("StatusCode") != 200 or response.get("FunctionError"):
        raise StoryError(503, "TRANSLATION_UNCERTAIN", "Chưa xác định được kết quả Azure.")
    payload = json.loads(response["Payload"].read())
    if not isinstance(payload, dict):
        raise StoryError(503, "TRANSLATION_INVALID_RESPONSE", "Bản dịch không hợp lệ.")
    if "error" in payload:
        code = payload["error"].get("code", "TRANSLATION_UNAVAILABLE")
        raise StoryError(429 if code in {"TRANSLATION_BUSY", "TRANSLATION_QUOTA_EXCEEDED"} else 503,
                         code, "Azure Translator chưa dịch được phần này.")
    if payload.get("sourceLang") != source or payload.get("targetLang") != target:
        raise StoryError(503, "TRANSLATION_INVALID_RESPONSE", "Ngôn ngữ bản dịch không khớp.")
    return payload.get("translatedText")


def tick(scope, project_id, chapter_id, plan_id):
    plan = store.get_plan(scope, project_id, chapter_id, plan_id)[0]
    token = _claim(scope, project_id, chapter_id, plan_id)
    if token is None:
        return progress(scope, project_id, chapter_id, plan_id)
    try:
        if store.get_run(scope, project_id, chapter_id, plan_id)[0]["desiredState"] != "RUNNING":
            return progress(scope, project_id, chapter_id, plan_id)
        with ThreadPoolExecutor(max_workers=12) as pool:
            items = list(pool.map(lambda index: store.get_chunk(scope, project_id, chapter_id, plan_id, index)[0],
                                  range(plan["total"])))
        candidate = None
        has_failed = False
        for index, item in enumerate(items):
            if item["status"] in {"RUNNING", "UNCERTAIN", "BLOCKED_QUOTA"}:
                _run_change(scope, project_id, chapter_id, plan_id, {"status": "NEEDS_ATTENTION"})
                return progress(scope, project_id, chapter_id, plan_id)
            if item["status"] == "QUEUED" and candidate is None:
                candidate = index
            if item["status"] == "FAILED":
                has_failed = True
        if candidate is None:
            _run_change(scope, project_id, chapter_id, plan_id,
                        {"status": "NEEDS_ATTENTION" if has_failed else "READY_FOR_REVIEW"})
            return progress(scope, project_id, chapter_id, plan_id)
        item = store.get_chunk(scope, project_id, chapter_id, plan_id, candidate)[0]
        store.update_chunk(scope, project_id, chapter_id, plan_id, candidate,
                           {"status": "RUNNING", "attempts": item["attempts"] + 1})
        limit = int(os.environ.get("STORY_TRANSLATION_DAILY_CHARS", "100000"))
        if not store.reserve_translation_chars(scope, len(item["sourceText"]), limit):
            store.update_chunk(scope, project_id, chapter_id, plan_id, candidate, {"status": "BLOCKED_QUOTA"})
            _run_change(scope, project_id, chapter_id, plan_id, {"status": "BLOCKED_QUOTA"})
            return progress(scope, project_id, chapter_id, plan_id)
        protected, mapping = protect(item["sourceText"], plan["glossary"])
        try:
            translated = restore(_worker(protected, plan["sourceLang"], plan["targetLang"]), mapping)
        except StoryError as error:
            uncertain = error.code in {"TRANSLATION_UNCERTAIN", "GLOSSARY_NOT_PRESERVED"}
            state = "UNCERTAIN" if uncertain else "BLOCKED_QUOTA" if error.code == "TRANSLATION_QUOTA_EXCEEDED" else "FAILED"
            store.update_chunk(scope, project_id, chapter_id, plan_id, candidate,
                               {"status": state, "errorCode": error.code,
                                "nextRetryAt": int(time.time()) + 30 if error.code == "TRANSLATION_BUSY" else None})
            _run_change(scope, project_id, chapter_id, plan_id,
                        {"status": "BLOCKED_QUOTA" if state == "BLOCKED_QUOTA" else "NEEDS_ATTENTION"})
            return progress(scope, project_id, chapter_id, plan_id)
        except Exception:
            store.update_chunk(scope, project_id, chapter_id, plan_id, candidate,
                               {"status": "UNCERTAIN", "errorCode": "TRANSLATION_UNCERTAIN"})
            _run_change(scope, project_id, chapter_id, plan_id, {"status": "NEEDS_ATTENTION"})
            return progress(scope, project_id, chapter_id, plan_id)
        store.update_chunk(scope, project_id, chapter_id, plan_id, candidate,
                           {"status": "DONE", "translatedText": translated, "errorCode": None})
        return progress(scope, project_id, chapter_id, plan_id)
    finally:
        _release(scope, project_id, chapter_id, plan_id, token)


def control(scope, project_id, chapter_id, plan_id, action, index=None):
    plan = store.get_plan(scope, project_id, chapter_id, plan_id)[0]
    if action == "start":
        store.start_run(scope, project_id, chapter_id, plan_id)
        return tick(scope, project_id, chapter_id, plan_id)
    if action == "pause":
        _run_change(scope, project_id, chapter_id, plan_id, {"desiredState": "PAUSED", "status": "PAUSED"})
    elif action == "resume":
        states = [store.get_chunk(scope, project_id, chapter_id, plan_id, i)[0]["status"] for i in range(plan["total"])]
        if any(state in {"UNCERTAIN", "RUNNING"} for state in states):
            raise StoryError(409, "RECOVERY_REQUIRED", "Có phần chưa rõ kết quả; cần đối soát thủ công.")
        for index, state in enumerate(states):
            if state == "BLOCKED_QUOTA":
                store.update_chunk(scope, project_id, chapter_id, plan_id, index,
                                   {"status": "QUEUED", "errorCode": None})
        _run_change(scope, project_id, chapter_id, plan_id, {"desiredState": "RUNNING", "status": "RUNNING"})
    elif action == "retry":
        if type(index) is not int or not 0 <= index < plan["total"]:
            raise StoryError(400, "INVALID_ITEM", "Phần dịch không hợp lệ.")
        item = store.get_chunk(scope, project_id, chapter_id, plan_id, index)[0]
        if item["status"] != "FAILED" or item["attempts"] >= 3 or (item.get("nextRetryAt") or 0) > time.time():
            raise StoryError(409, "RETRY_UNSAFE", "Chỉ thử lại lỗi đã xác minh, tối đa ba lượt.")
        store.update_chunk(scope, project_id, chapter_id, plan_id, index,
                           {"status": "QUEUED", "errorCode": None})
        run = store.get_run(scope, project_id, chapter_id, plan_id)[0]
        _run_change(scope, project_id, chapter_id, plan_id,
                    {"status": "RUNNING" if run["desiredState"] == "RUNNING" else "PAUSED"})
    else:
        raise StoryError(400, "INVALID_ACTION", "Thao tác dịch không hợp lệ.")
    return progress(scope, project_id, chapter_id, plan_id)
