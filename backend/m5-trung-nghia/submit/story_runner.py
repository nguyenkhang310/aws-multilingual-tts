"""Bounded, CAS-guarded audiobook dispatcher; one invocation submits one item."""

import os
import time

from tts_common import db, story_batch_store as batches, story_slots
from tts_common.expression import remaining_gemini_calls
from tts_common.story_store import StoryError

import story_dispatch
import story_progress
import story_run_state as run_state
import story_run_recovery as recovery

QUOTA_ERRORS = {"PROVIDER_QUOTA", "GEMINI_TTS_QUOTA", "EMOTION_QUOTA", "TRANSLATION_QUOTA_EXCEEDED"}
BLOCKING_ERRORS = {"PROVIDER_AUTH", "TTS_NOT_CONFIGURED", "GEMINI_TTS_NOT_CONFIGURED",
                   "UNSUPPORTED_STYLE", "UNSUPPORTED_STYLE_INTENSITY", "UNSUPPORTED_SPEED",
                   "TRANSLATION_NOT_CONFIGURED"}


def _failure_status(item):
    if item.get("errorCode") in QUOTA_ERRORS or (item.get("retryable") and item.get("nextRetryAt")):
        return "BLOCKED_QUOTA"
    if item.get("errorCode") in BLOCKING_ERRORS:
        return "NEEDS_ATTENTION"
    return None


def _dispatch_one(scope, project_id, chapter_id, plan, item, token):
    index = item["index"]
    attempt = item.get("activeAttempt") or item.get("attemptCount", 0) + 1
    max_attempts = int(os.environ.get("STORY_MAX_ATTEMPTS", "3"))
    if attempt > max_attempts:
        run_state.change(scope, project_id, chapter_id, plan["planId"], status="NEEDS_ATTENTION")
        return story_progress.result(scope, project_id, chapter_id, plan)
    if run_state.stale(scope, project_id, chapter_id, plan) or not run_state.permit(
        scope, project_id, chapter_id, plan["planId"], token, index, attempt):
        return story_progress.result(scope, project_id, chapter_id, plan)
    try:
        text = story_dispatch.checked_segment(scope, project_id, chapter_id, plan, item)
    except StoryError as error:
        recovery.mark(scope, project_id, chapter_id, plan["planId"], index,
                      "FAILED", error_code=error.code)
        run_state.change(scope, project_id, chapter_id, plan["planId"],
                         status="NEEDS_ATTENTION", recoveryReason=error.code)
        return story_progress.result(scope, project_id, chapter_id, plan)
    if run_state.stale(scope, project_id, chapter_id, plan):
        run_state.change(scope, project_id, chapter_id, plan["planId"],
                         status="NEEDS_ATTENTION", recoveryReason="PLAN_STALE")
        return story_progress.result(scope, project_id, chapter_id, plan)
    provider_quota = plan["provider"] == "gemini" and remaining_gemini_calls(
        int(os.environ.get("GEMINI_TTS_DAILY_CALL_LIMIT", "100"))) < (len(text) + 999) // 1000
    if db.remaining_chars() < len(text) or provider_quota:
        recovery.mark(scope, project_id, chapter_id, plan["planId"], index,
                      "BLOCKED_QUOTA", error_code="QUOTA_EXHAUSTED")
        run_state.change(scope, project_id, chapter_id, plan["planId"], status="BLOCKED_QUOTA")
        return story_progress.result(scope, project_id, chapter_id, plan)
    slot = story_slots.acquire(scope, project_id, chapter_id, plan["planId"], index,
        max(1, min(2, int(os.environ.get("STORY_MAX_ACTIVE", "1")))),
        lambda value: recovery.releasable(scope, project_id, value))
    if slot is None:
        return story_progress.result(scope, project_id, chapter_id, plan)
    current, etag = batches.get_item(scope, project_id, chapter_id, plan["planId"], index)
    if current["status"] != "QUEUED":
        story_slots.release(scope, project_id, slot)
        return story_progress.result(scope, project_id, chapter_id, plan)
    attempts = story_progress._attempt(current, attempt, "SUBMITTING", startedAt=run_state.now())
    submitting = batches.update_item(scope, project_id, chapter_id, plan["planId"], index, current, etag,
        status="SUBMITTING", attemptCount=max(current.get("attemptCount", 0), attempt),
        activeAttempt=attempt, claimToken=slot, claimUntil=int(time.time()) + story_slots.LEASE_SECONDS,
        attempts=attempts)
    try:
        status, payload = story_dispatch.submit(scope, plan, submitting, text, attempt)
    except Exception:
        status, payload = 503, {"error": {"code": "SUBMIT_UNCERTAIN"}}
    code = payload.get("error", {}).get("code")
    if status in {200, 202} and payload.get("jobId"):
        recovery.mark(scope, project_id, chapter_id, plan["planId"], index, "SUBMITTED", payload["jobId"])
    elif status == 429:
        recovery.mark(scope, project_id, chapter_id, plan["planId"], index,
                      "BLOCKED_QUOTA", error_code=code)
        story_slots.release(scope, project_id, slot)
        run_state.change(scope, project_id, chapter_id, plan["planId"], status="BLOCKED_QUOTA")
    else:
        state = "UNCERTAIN" if code == "SUBMIT_UNCERTAIN" else "FAILED"
        recovery.mark(scope, project_id, chapter_id, plan["planId"], index, state, error_code=code or state)
        if state == "FAILED":
            story_slots.release(scope, project_id, slot)
            run_state.change(scope, project_id, chapter_id, plan["planId"], status="NEEDS_ATTENTION")
    return story_progress.result(scope, project_id, chapter_id, plan)


def tick(scope, project_id, chapter_id, plan_id):
    plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
    if run_state.stale(scope, project_id, chapter_id, plan):
        run_state.change(scope, project_id, chapter_id, plan_id, status="NEEDS_ATTENTION",
                         recoveryReason="PLAN_STALE")
        return story_progress.result(scope, project_id, chapter_id, plan)
    token = run_state.lease(scope, project_id, chapter_id, plan_id)
    if token is None:
        return story_progress.result(scope, project_id, chapter_id, plan)
    try:
        run = batches.get_run(scope, project_id, chapter_id, plan_id)[0]
        if run.get("desiredState", "RUNNING") != "RUNNING":
            return story_progress.result(scope, project_id, chapter_id, plan)
        candidate = None
        for index in range(plan["total"]):
            item = story_progress.reconcile(scope, project_id, chapter_id, plan, index)
            if item["status"] in {"UNCERTAIN", "BLOCKED_QUOTA"}:
                run_state.change(scope, project_id, chapter_id, plan_id,
                    status="BLOCKED_QUOTA" if item["status"] == "BLOCKED_QUOTA" else "NEEDS_ATTENTION")
                return story_progress.result(scope, project_id, chapter_id, plan)
            failure_status = _failure_status(item) if item["status"] == "FAILED" else None
            if failure_status:
                run_state.change(scope, project_id, chapter_id, plan_id,
                    status=failure_status, recoveryReason=item.get("errorCode") or "PROVIDER_RETRY_DELAY")
                return story_progress.result(scope, project_id, chapter_id, plan)
            if item["status"] == "QUEUED" and candidate is None:
                candidate = item
        if candidate is None:
            return recovery.complete_status(scope, project_id, chapter_id, plan)
        return _dispatch_one(scope, project_id, chapter_id, plan, candidate, token)
    finally:
        run_state.release_lease(scope, project_id, chapter_id, plan_id, token)


def start(scope, project_id, chapter_id, plan_id):
    plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
    if run_state.stale(scope, project_id, chapter_id, plan):
        raise StoryError(409, "PLAN_STALE", "Chương đã đổi; tạo và duyệt kế hoạch mới.")
    batches.start_run(scope, project_id, chapter_id, plan_id, run_state.now())
    return tick(scope, project_id, chapter_id, plan_id)
