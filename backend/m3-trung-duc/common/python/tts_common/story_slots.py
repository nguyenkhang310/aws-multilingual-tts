"""Project-wide CAS slots prevent two chapter dispatchers exceeding concurrency."""

import time
import uuid

from .story_store import StoryError, read, root, require_id, write

LEASE_SECONDS = 75


def key(scope, project_id):
    return f"{root(scope)}{require_id(project_id)}/audio-dispatch.json"


def acquire(scope, project_id, chapter_id, plan_id, index, limit, releasable):
    """Reserve one slot; caller must CAS-claim its item before submitting."""
    target = {"chapterId": require_id(chapter_id), "planId": require_id(plan_id), "index": index}
    for _ in range(8):
        stored = read(key(scope, project_id))
        data, etag = stored if stored else ({"active": []}, None)
        active = [slot for slot in data.get("active", []) if not releasable(slot)]
        if any(slot["planId"] == plan_id and slot["index"] == index for slot in active):
            return None
        if len(active) >= limit:
            if len(active) != len(data.get("active", [])):
                try:
                    write(key(scope, project_id), {"active": active}, etag=etag)
                except StoryError as error:
                    if error.code != "REVISION_CONFLICT":
                        raise
            return None
        token = uuid.uuid4().hex
        slot = {**target, "token": token, "until": int(time.time()) + LEASE_SECONDS}
        try:
            write(key(scope, project_id), {"active": [*active, slot]}, etag=etag, create=not stored)
            return token
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Hàng đợi đang được cập nhật; hãy thử lại.")


def release(scope, project_id, token):
    for _ in range(8):
        stored = read(key(scope, project_id))
        if not stored:
            return
        data, etag = stored
        active = [slot for slot in data.get("active", []) if slot.get("token") != token]
        if len(active) == len(data.get("active", [])):
            return
        try:
            write(key(scope, project_id), {"active": active}, etag=etag)
            return
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
    raise StoryError(503, "QUEUE_BUSY", "Chưa giải phóng được lượt điều phối.")
