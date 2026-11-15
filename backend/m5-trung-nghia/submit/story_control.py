"""Pause, resume and bounded retry controls for an approved chapter plan."""

import os
import time

from tts_common import db, story_batch_store as batches, story_chapters
from tts_common.expression import remaining_gemini_calls
from tts_common.story_store import StoryError

import story_progress
import story_runner
import story_run_state as run_state


def _change(scope, project_id, chapter_id, plan_id, **changes):
    return run_state.change(scope, project_id, chapter_id, plan_id, **changes)


def _plan(scope, project_id, chapter_id, plan_id):
    plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    if run_state.stale(scope, project_id, chapter_id, plan):
        raise StoryError(409, "PLAN_STALE", "Chương đã đổi; tạo và duyệt kế hoạch mới.")
    return plan


def pause(scope, project_id, chapter_id, plan_id):
    plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan_id)
        if not stored:
            raise StoryError(409, "PLAN_NOT_STARTED", "Kế hoạch chưa được bắt đầu.")
        run, etag = stored
        if run.get("status") == "COMPLETED":
            return story_progress.result(scope, project_id, chapter_id, plan)
        lease = run.get("dispatchLease") or {}
        status = "PAUSING" if lease.get("expiresAt", 0) > time.time() else "PAUSED"
        if run.get("desiredState") == "PAUSED" and run.get("status") == status:
            break
        try:
            batches.update_run(scope, project_id, chapter_id, plan_id, run, etag,
                desiredState="PAUSED", status=status, pausedAt=run.get("pausedAt") or time.time(),
                updatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
            break
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    else:
        raise StoryError(503, "QUEUE_BUSY", "Hàng đợi đang được cập nhật.")
    return story_progress.result(scope, project_id, chapter_id, plan)


def resume(scope, project_id, chapter_id, plan_id):
    plan = _plan(scope, project_id, chapter_id, plan_id)
    stored = batches.get_run(scope, project_id, chapter_id, plan_id)
    if not stored:
        raise StoryError(409, "PLAN_NOT_STARTED", "Kế hoạch chưa được bắt đầu.")
    run, run_etag = stored
    if run.get("status") == "COMPLETED":
        return story_progress.result(scope, project_id, chapter_id, plan)
    if run.get("desiredState") == "RUNNING" and run.get("status") not in {"BLOCKED_QUOTA", "NEEDS_ATTENTION"}:
        return story_progress.result(scope, project_id, chapter_id, plan)
    states = [story_progress.reconcile(scope, project_id, chapter_id, plan, i)["status"] for i in range(plan["total"])]
    if "UNCERTAIN" in states:
        raise StoryError(409, "RECOVERY_REQUIRED", "Có đoạn chưa rõ trạng thái; cần đối soát trước khi tiếp tục.")
    queued = next((i for i, state in enumerate(states) if state == "QUEUED"), None)
    for index, state in enumerate(states):
        if state != "BLOCKED_QUOTA":
            continue
        item, etag = batches.get_item(scope, project_id, chapter_id, plan_id, index)
        next_attempt = max(1, item.get("activeAttempt") or item.get("attemptCount", 0))
        mapping = db.get_idempotency(scope, story_progress.request_key(plan, item, next_attempt))
        attempt = next_attempt + 1 if mapping and mapping.data.get("dispatchState") == "QUOTA_REJECTED" else next_attempt
        if attempt > int(os.environ.get("STORY_MAX_ATTEMPTS", "3")):
            raise StoryError(409, "MAX_ATTEMPTS", "Đoạn này đã đạt số lần thử tối đa.")
        if db.remaining_chars() < item["charCount"]:
            run_state.transition(scope, project_id, chapter_id, plan_id, "RUNNING", status="BLOCKED_QUOTA")
            raise StoryError(429, "TOO_MANY_REQUESTS", "Quota chưa đủ để tiếp tục audio chương.")
        batches.update_item(scope, project_id, chapter_id, plan_id, index, item, etag,
            status="QUEUED", jobId=None, activeAttempt=None, claimToken=None, claimUntil=0,
            errorCode=None, retryable=False, nextRetryAt=None)
        states[index] = "QUEUED"
        if queued is None:
            queued = index
    if queued is not None:
        item = batches.get_item(scope, project_id, chapter_id, plan_id, queued)[0]
        provider_quota = plan["provider"] == "gemini" and remaining_gemini_calls(
            int(os.environ.get("GEMINI_TTS_DAILY_CALL_LIMIT", "100"))) < (item["charCount"] + 999) // 1000
        if db.remaining_chars() < item["charCount"] or provider_quota:
            run_state.transition(scope, project_id, chapter_id, plan_id, "RUNNING", status="BLOCKED_QUOTA")
            raise StoryError(429, "TOO_MANY_REQUESTS", "Quota chưa đủ để tiếp tục audio chương.")
    try:
        batches.update_run(scope, project_id, chapter_id, plan_id, run, run_etag,
            desiredState="RUNNING", status="RUNNING", resumedAt=time.time(), recoveryReason=None)
    except StoryError as error:
        if error.code == "REVISION_CONFLICT":
            raise StoryError(409, "RUN_CHANGED", "Trạng thái chương vừa thay đổi. Hãy tải lại trước khi tiếp tục.") from None
        raise
    return story_runner.tick(scope, project_id, chapter_id, plan_id)


def retry(scope, project_id, chapter_id, plan_id, index):
    plan = _plan(scope, project_id, chapter_id, plan_id)
    if type(index) is not int or not 0 <= index < plan["total"]:
        raise StoryError(404, "SEGMENT_NOT_FOUND", "Không tìm thấy đoạn cần thử lại.")
    item = story_progress.reconcile(scope, project_id, chapter_id, plan, index)
    if item["status"] != "FAILED" or not item.get("retryable"):
        raise StoryError(409, "RETRY_UNSAFE", "Đoạn lỗi chưa có bằng chứng để thử lại an toàn.")
    retry_at = item.get("nextRetryAt") or 0
    if retry_at > time.time():
        raise StoryError(409, "RETRY_NOT_READY", f"Có thể thử lại sau {int(retry_at)}.")
    max_attempts = int(os.environ.get("STORY_MAX_ATTEMPTS", "3"))
    if item.get("attemptCount", 0) >= max_attempts:
        raise StoryError(409, "MAX_ATTEMPTS", "Đoạn này đã đạt số lần thử tối đa.")
    provider_quota = plan["provider"] == "gemini" and remaining_gemini_calls(
        int(os.environ.get("GEMINI_TTS_DAILY_CALL_LIMIT", "100"))) < (item["charCount"] + 999) // 1000
    if db.remaining_chars() < item["charCount"] or provider_quota:
        _change(scope, project_id, chapter_id, plan_id, status="BLOCKED_QUOTA")
        raise StoryError(429, "TOO_MANY_REQUESTS", "Quota chưa đủ để thử lại đoạn này.")
    current, etag = batches.get_item(scope, project_id, chapter_id, plan_id, index)
    try:
        batches.update_item(scope, project_id, chapter_id, plan_id, index, current, etag,
            status="QUEUED", jobId=None, activeAttempt=None, claimToken=None, claimUntil=0,
            retryable=False, nextRetryAt=None, errorCode=None, retryRequestedAt=time.time())
    except StoryError as error:
        if error.code != "REVISION_CONFLICT":
            raise
        latest = batches.get_item(scope, project_id, chapter_id, plan_id, index)[0]
        if latest["status"] not in {"QUEUED", "SUBMITTING", "SUBMITTED", "PROCESSING", "DONE"}:
            raise
    run = batches.get_run(scope, project_id, chapter_id, plan_id)[0]
    if run.get("desiredState", "RUNNING") == "PAUSED":
        return story_progress.result(scope, project_id, chapter_id, plan)
    transitioned = run_state.transition(scope, project_id, chapter_id, plan_id, "RUNNING", status="RUNNING")
    if transitioned.get("desiredState", "RUNNING") != "RUNNING":
        return story_progress.result(scope, project_id, chapter_id, plan)
    return story_runner.tick(scope, project_id, chapter_id, plan_id)
