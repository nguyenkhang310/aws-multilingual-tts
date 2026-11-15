"""Queue reconciliation and terminal state settlement for chapter runs."""

import time

from tts_common import story_batch_store as batches, story_slots
from tts_common.story_store import StoryError
from tts_common.story_projects import now

import story_progress
import story_run_state as run_state


def releasable(scope, project_id, slot):
    try:
        plan = batches.get_plan(scope, project_id, slot["chapterId"], slot["planId"])
        item = story_progress.reconcile(scope, project_id, slot["chapterId"], plan, slot["index"])
    except StoryError:
        return False
    return item["status"] in {"DONE", "FAILED", "BLOCKED_QUOTA"} or (
        item["status"] == "QUEUED" and slot["until"] <= int(time.time()))


def mark(scope, project_id, chapter_id, plan_id, index, status, job_id=None, error_code=None):
    item, etag = batches.get_item(scope, project_id, chapter_id, plan_id, index)
    if item["status"] in {"DONE", "PROCESSING"}:
        return item
    if item["status"] == "FAILED" and status in {"SUBMITTING", "SUBMITTED", "PROCESSING", "UNCERTAIN"}:
        return item
    if item["status"] == "UNCERTAIN" and status != "DONE":
        return item
    if item.get("jobId") and job_id and item["jobId"] != job_id:
        raise StoryError(409, "QUEUE_CONFLICT", "Job của đoạn đã đổi; cần đối soát.")
    attempt = item.get("activeAttempt") or item.get("attemptCount", 1)
    attempts = story_progress._attempt(item, attempt, status, jobId=job_id, errorCode=error_code)
    return batches.update_item(scope, project_id, chapter_id, plan_id, index, item, etag,
        status=status, jobId=job_id or item.get("jobId"), attempts=attempts,
        **({"errorCode": error_code, "retryable": False} if error_code else {}))


def settle_paused(scope, project_id, chapter_id, plan):
    """Settle a pause after its dispatcher lease is gone; reconcile completions first."""
    progress = story_progress.result(scope, project_id, chapter_id, plan)
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan["planId"])
        if not stored:
            return progress
        run, etag = stored
        if run.get("desiredState", "RUNNING") != "PAUSED":
            return story_progress.result(scope, project_id, chapter_id, plan)
        if (run.get("dispatchLease") or {}).get("expiresAt", 0) > time.time():
            return story_progress.result(scope, project_id, chapter_id, plan)
        if progress["done"] == progress["total"]:
            status = "COMPLETED"
        elif progress["uncertain"] or progress["failed"]:
            status = "NEEDS_ATTENTION"
        else:
            status = "PAUSED"
        try:
            batches.update_run(scope, project_id, chapter_id, plan["planId"], run, etag,
                status=status, dispatchLease=None, lastProgressAt=now(), updatedAt=now())
            return story_progress.result(scope, project_id, chapter_id, plan)
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Chưa hoàn tất đối soát trạng thái tạm dừng.")


def complete_status(scope, project_id, chapter_id, plan):
    progress = story_progress.result(scope, project_id, chapter_id, plan)
    run = batches.get_run(scope, project_id, chapter_id, plan["planId"])
    if run and run[0].get("desiredState") == "PAUSED":
        return settle_paused(scope, project_id, chapter_id, plan)
    if progress["uncertain"]:
        state = "NEEDS_ATTENTION"
    elif progress["blockedQuota"]:
        state = "BLOCKED_QUOTA"
    elif progress["queued"] or progress["claimed"] or progress["submitted"] or progress["processing"]:
        state = "RUNNING"
    elif progress["done"] == progress["total"]:
        state = "COMPLETED"
    elif progress["failed"]:
        state = "NEEDS_ATTENTION"
    else:
        state = "RUNNING"
    run_state.transition(scope, project_id, chapter_id, plan["planId"], "RUNNING",
                         status=state, lastProgressAt=now())
    return story_progress.result(scope, project_id, chapter_id, plan)
