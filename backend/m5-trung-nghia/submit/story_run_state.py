"""CAS helpers for one persisted chapter run and its queue items."""

import time
import uuid

from tts_common import story_batch_store as batches, story_chapters
from tts_common.story_store import StoryError

from tts_common.story_projects import now

LEASE_SECONDS = 90


def stale(scope, project_id, chapter_id, plan):
    if plan.get("textSource") == "approved_translation":
        return False
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    return chapter["revision"] != plan["sourceChapterRevision"] or chapter["contentRevision"] != plan["contentRevision"]


def change(scope, project_id, chapter_id, plan_id, **changes):
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan_id)
        if not stored:
            raise StoryError(409, "PLAN_NOT_STARTED", "Hãy duyệt kế hoạch trước khi tạo audio.")
        try:
            return batches.update_run(scope, project_id, chapter_id, plan_id, *stored,
                                      **changes, updatedAt=now())
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Chưa cập nhật được trạng thái hàng đợi.")


def transition(scope, project_id, chapter_id, plan_id, expected, **changes):
    """Apply a run transition only while its desired state still matches."""
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan_id)
        if not stored:
            raise StoryError(409, "PLAN_NOT_STARTED", "Kế hoạch chưa được bắt đầu.")
        run, etag = stored
        if run.get("desiredState", "RUNNING") != expected:
            return run
        try:
            return batches.update_run(scope, project_id, chapter_id, plan_id, run, etag,
                                      **changes, updatedAt=now())
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Hàng đợi đang được cập nhật.")


def lease(scope, project_id, chapter_id, plan_id):
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan_id)
        if not stored:
            raise StoryError(409, "PLAN_NOT_STARTED", "Hãy duyệt kế hoạch trước khi tạo audio.")
        run, etag = stored
        if run.get("desiredState", "RUNNING") != "RUNNING":
            return None
        if (run.get("dispatchLease") or {}).get("expiresAt", 0) > time.time():
            return None
        token = uuid.uuid4().hex
        try:
            batches.update_run(scope, project_id, chapter_id, plan_id, run, etag, status="RUNNING",
                dispatchLease={"token": token, "expiresAt": int(time.time()) + LEASE_SECONDS}, updatedAt=now())
            return token
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Chưa giữ được lượt điều phối.")


def permit(scope, project_id, chapter_id, plan_id, token, index, attempt):
    stored = batches.get_run(scope, project_id, chapter_id, plan_id)
    if not stored:
        return False
    run, etag = stored
    dispatch_lease = run.get("dispatchLease") or {}
    if dispatch_lease.get("token") != token or run.get("desiredState", "RUNNING") != "RUNNING":
        return False
    try:
        batches.update_run(scope, project_id, chapter_id, plan_id, run, etag,
            dispatchLease={**dispatch_lease, "index": index, "attempt": attempt}, updatedAt=now())
        return True
    except StoryError as error:
        if error.code == "REVISION_CONFLICT":
            return False
        raise


def release_lease(scope, project_id, chapter_id, plan_id, token):
    for _ in range(6):
        stored = batches.get_run(scope, project_id, chapter_id, plan_id)
        if not stored:
            return
        run, etag = stored
        if (run.get("dispatchLease") or {}).get("token") != token:
            return
        status = "PAUSED" if run.get("desiredState") == "PAUSED" else run.get("status", "RUNNING")
        try:
            batches.update_run(scope, project_id, chapter_id, plan_id, run, etag,
                status=status, dispatchLease=None, updatedAt=now())
            return
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
