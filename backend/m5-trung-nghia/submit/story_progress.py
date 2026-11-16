"""Reconcile persisted story queue items against their M3 job and key records."""

import hashlib
import os
import time
from concurrent.futures import ThreadPoolExecutor

from tts_common import config, db, storage, story_batch_store as batches, story_chapters, story_slots
from tts_common.story_store import StoryError, page
from tts_common.expression import remaining_gemini_calls

STATES = ("QUEUED", "SUBMITTING", "SUBMITTED", "PROCESSING", "DONE", "FAILED",
          "BLOCKED_QUOTA", "UNCERTAIN")


def request_key(plan, ref, attempt=1):
    raw = f"{plan['fingerprint']}:{ref['segmentId']}:{ref['revision']}:{ref['sourceHash']}"
    if attempt > 1:
        raw += f":attempt:{attempt}"
    return "story-" + hashlib.sha256(raw.encode()).hexdigest()


def _job_state(scope, job):
    if not job:
        return "UNCERTAIN"
    status = job.get("status")
    if status == "DONE":
        if not job.get("audioKey") or storage.find_audio(scope, job["jobId"]) != job["audioKey"]:
            return "UNCERTAIN"
        return "DONE"
    if status == "PROCESSING":
        lease = job.get("leaseUntil")
        return "PROCESSING" if isinstance(lease, (int, float)) and lease > time.time() else "UNCERTAIN"
    return {"PENDING": "SUBMITTED", "FAILED": "FAILED"}.get(status, "UNCERTAIN")


def _attempt(item, attempt, state, **fields):
    values = list(item.get("attempts", []))
    record = next((entry for entry in reversed(values) if entry.get("attempt") == attempt), None)
    if record is None:
        record = {"attempt": attempt}
        values.append(record)
    record.update(status=state, **fields)
    return values[-3:]


def _release(scope, project_id, item):
    if item.get("claimToken"):
        story_slots.release(scope, project_id, item["claimToken"])


def _retry_at(item, job, attempt):
    jitter = int(hashlib.sha256(job["jobId"].encode()).hexdigest()[:2], 16) % 11
    delay = min(300, 15 * (2 ** max(0, attempt - 1)) + jitter)
    return int(time.time()) + max(delay, job.get("retryAfterSeconds", 0))


def _audio_fraction(scope, item):
    if item["status"] == "DONE":
        return 1.0
    if item["status"] not in {"SUBMITTED", "PROCESSING"} or not item.get("jobId"):
        return 0.0
    job = db.get_job(scope, item["jobId"])
    if not job or job.get("status") != "PROCESSING":
        return 0.0
    total = job.get("chunkCount", 1)
    complete = job.get("chunksDone", 0)
    if type(total) is not int or total < 1 or type(complete) is not int:
        return 0.0
    return min(0.999, max(0.0, complete / total))


def reconcile(scope, project_id, chapter_id, plan, index):
    item, etag = batches.get_item(scope, project_id, chapter_id, plan["planId"], index)
    if item["status"] in {"FAILED", "BLOCKED_QUOTA"}:
        return item
    previous_attempts = item.get("attemptCount", 0)
    attempt = item.get("activeAttempt")
    if attempt is None:
        attempt = previous_attempts + 1 if item["status"] == "QUEUED" else max(1, previous_attempts)
    job_id, state = item.get("jobId"), item["status"]
    job = None
    mapping = db.get_idempotency(scope, request_key(plan, item, attempt))
    if not job_id and mapping:
        record = mapping.data if isinstance(mapping.data, dict) else {}
        if record.get("dispatchState") == "QUOTA_REJECTED":
            state = "BLOCKED_QUOTA"
        elif isinstance(record.get("jobId"), str):
            job_id = record["jobId"]
            job = db.get_job(scope, job_id)
            accepted = record.get("dispatchState") == "DISPATCHED" or (job and job.get("status") != "PENDING")
            state = _job_state(scope, job) if accepted else "UNCERTAIN"
        else:
            state = "UNCERTAIN"
    elif job_id:
        job = db.get_job(scope, job_id)
        state = _job_state(scope, job)
        if state == "SUBMITTED" and mapping and mapping.data.get("dispatchState") != "DISPATCHED":
            state = "UNCERTAIN"
    else:
        job = None
        if state == "SUBMITTING" and item.get("claimUntil", 0) <= time.time():
            state = "QUEUED" if mapping is None else "UNCERTAIN"

    if state == item["status"] and job_id == item.get("jobId"):
        return item
    details = {}
    if job:
        details = {key: job[key] for key in ("errorCode", "retryable", "retryAfterSeconds") if key in job}
    retry_at = None
    if state == "FAILED" and details.get("retryable"):
        retry_at = _retry_at(item, job, attempt)
    attempts = _attempt(item, attempt, state, jobId=job_id, errorCode=details.get("errorCode"))
    try:
        updated = batches.update_item(scope, project_id, chapter_id, plan["planId"], index, item, etag,
            status=state, jobId=job_id, attempts=attempts,
            **({"errorCode": details.get("errorCode"), "retryable": bool(details.get("retryable")),
                "nextRetryAt": retry_at} if state == "FAILED" else {}),
            **({"claimToken": None, "claimUntil": 0, "activeAttempt": None} if state in {"DONE", "FAILED", "BLOCKED_QUOTA"} else {}))
    except StoryError as error:
        if error.code != "REVISION_CONFLICT":
            raise
        return batches.get_item(scope, project_id, chapter_id, plan["planId"], index)[0]
    if state in {"DONE", "FAILED", "BLOCKED_QUOTA"}:
        _release(scope, project_id, item)
    return updated


def result(scope, project_id, chapter_id, plan, limit=25, cursor=None):
    run = batches.get_run(scope, project_id, chapter_id, plan["planId"])
    run_data = run[0] if run else None
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    from story_run_state import stale as plan_stale
    stale = plan_stale(scope, project_id, chapter_id, plan)
    counts = {name: 0 for name in STATES}
    audio_complete = 0.0
    indices, next_cursor = page(list(range(plan["total"])), limit, cursor)
    selected, items = set(indices), []
    with ThreadPoolExecutor(max_workers=12) as pool:
        scanned = pool.map(lambda index: reconcile(scope, project_id, chapter_id, plan, index), range(plan["total"]))
        for index, item in enumerate(scanned):
            counts[item["status"]] += 1
            audio_complete += _audio_fraction(scope, item)
            if index not in selected:
                continue
            value = {key: item.get(key) for key in ("index", "segmentId", "revision", "order", "charCount", "jobId")}
            value.update(status=item["status"], attemptCount=item.get("attemptCount", 0),
                         errorCode=item.get("errorCode"), retryable=bool(item.get("retryable")),
                         nextRetryAt=item.get("nextRetryAt"), recoveryReason=item.get("recoveryReason"))
            if item["status"] == "DONE" and item.get("jobId"):
                job = db.get_job(scope, item["jobId"])
                value["audioUrl"] = storage.get_audio_url(job["audioKey"]) if job and job.get("audioKey") else None
            items.append(value)
    gemini_remaining = remaining_gemini_calls(int(os.environ.get("GEMINI_TTS_DAILY_CALL_LIMIT", "100"))) if plan["provider"] == "gemini" else None
    status = "STALE" if stale else run_data.get("status", "DRAFT") if run_data else "DRAFT"
    return {"planId": plan["planId"], "status": status,
            "desiredState": run_data.get("desiredState", "RUNNING") if run_data else "RUNNING",
            "startedAt": run_data.get("startedAt") if run_data else None, "total": plan["total"],
            "recoveryReason": run_data.get("recoveryReason") if run_data else None,
            "lastProgressAt": run_data.get("lastProgressAt") if run_data else None,
            "totalChars": plan["totalChars"], "quotaRemainingEstimate": db.remaining_chars(),
            "providerCallsRemainingEstimate": gemini_remaining, "queued": counts["QUEUED"],
            "claimed": counts["SUBMITTING"], "submitted": counts["SUBMITTED"],
            "processing": counts["PROCESSING"], "done": counts["DONE"], "failed": counts["FAILED"],
            "blockedQuota": counts["BLOCKED_QUOTA"], "uncertain": counts["UNCERTAIN"],
            "percentComplete": round(100 * audio_complete / plan["total"], 2),
            "maxAttempts": int(os.environ.get("STORY_MAX_ATTEMPTS", "3")),
            "items": items, "nextCursor": next_cursor}
