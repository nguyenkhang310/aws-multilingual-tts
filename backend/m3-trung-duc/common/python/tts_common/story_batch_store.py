"""Durable, scoped audiobook plans and per-segment queue records."""

from concurrent.futures import ThreadPoolExecutor

from . import story_chapters as chapters
from .story_store import StoryError, children, read, require_id, write

MAX_ITEMS = 2000


def base(scope, project_id, chapter_id, plan_id):
    return f"{chapters.prefix(scope, project_id, chapter_id)}audio-plans/{require_id(plan_id)}/"


def plan_key(scope, project_id, chapter_id, plan_id):
    return base(scope, project_id, chapter_id, plan_id) + "plan.json"


def item_key(scope, project_id, chapter_id, plan_id, index):
    if type(index) is not int or not 0 <= index < MAX_ITEMS:
        raise StoryError(400, "INVALID_ITEM", "Số đoạn không hợp lệ.")
    return base(scope, project_id, chapter_id, plan_id) + f"items/{index:04d}.json"


def once(key, value):
    try:
        write(key, value, create=True)
    except StoryError as error:
        stored = read(key)
        if error.code != "REVISION_CONFLICT" or not stored or stored[0] != value:
            raise


def get_plan(scope, project_id, chapter_id, plan_id):
    chapters.get(scope, project_id, chapter_id)
    stored = read(plan_key(scope, project_id, chapter_id, plan_id))
    if not stored:
        raise StoryError(404, "PLAN_NOT_FOUND", "Không tìm thấy kế hoạch audio.")
    if stored[0].get("schemaVersion") != 1:
        raise StoryError(503, "SCHEMA_UNSUPPORTED", "Phiên bản kế hoạch chưa được hỗ trợ.")
    return stored[0]


def create_plan(scope, project_id, chapter_id, plan, items):
    if not 1 <= len(items) <= MAX_ITEMS or len(items) != plan["total"]:
        raise StoryError(400, "INVALID_PLAN", "Số đoạn trong kế hoạch không hợp lệ.")
    plan_id = plan["planId"]
    existing = read(plan_key(scope, project_id, chapter_id, plan_id))
    if existing:
        if existing[0].get("fingerprint") != plan["fingerprint"]:
            raise StoryError(409, "PLAN_CONFLICT", "Kế hoạch đã có nội dung khác.")
        return existing[0]
    def save(pair):
        index, item = pair
        once(item_key(scope, project_id, chapter_id, plan_id, index), item)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(save, enumerate(items)))
    try:
        write(plan_key(scope, project_id, chapter_id, plan_id), plan, create=True)
    except StoryError as error:
        existing = read(plan_key(scope, project_id, chapter_id, plan_id))
        if error.code != "REVISION_CONFLICT" or not existing or existing[0].get("fingerprint") != plan["fingerprint"]:
            raise
    return get_plan(scope, project_id, chapter_id, plan_id)


def list_plans(scope, project_id, chapter_id):
    chapters.get(scope, project_id, chapter_id)
    prefix = chapters.prefix(scope, project_id, chapter_id) + "audio-plans/"
    result = []
    for child in children(prefix):
        stored = read(child + "plan.json")
        if stored and stored[0].get("schemaVersion") == 1:
            result.append(stored[0])
    return sorted(result, key=lambda item: (item["createdAt"], item["planId"]), reverse=True)


def get_item(scope, project_id, chapter_id, plan_id, index):
    stored = read(item_key(scope, project_id, chapter_id, plan_id, index))
    if not stored:
        raise StoryError(503, "QUEUE_INCOMPLETE", "Hàng đợi chưa đọc được đầy đủ.")
    return stored


def update_item(scope, project_id, chapter_id, plan_id, index, item, etag, **changes):
    value = {**item, **changes}
    write(item_key(scope, project_id, chapter_id, plan_id, index), value, etag=etag)
    return value


def run_key(scope, project_id, chapter_id, plan_id):
    return base(scope, project_id, chapter_id, plan_id) + "run.json"


def get_run(scope, project_id, chapter_id, plan_id):
    return read(run_key(scope, project_id, chapter_id, plan_id))


def start_run(scope, project_id, chapter_id, plan_id, timestamp):
    value = {"startedAt": timestamp, "approvedAt": timestamp, "status": "RUNNING",
             "desiredState": "RUNNING", "dispatchLease": None, "lastProgressAt": timestamp}
    key = run_key(scope, project_id, chapter_id, plan_id)
    if read(key):
        return get_run(scope, project_id, chapter_id, plan_id)
    try:
        write(key, value, create=True)
    except StoryError as error:
        if error.code != "REVISION_CONFLICT" or not read(key):
            raise
    return get_run(scope, project_id, chapter_id, plan_id)


def update_run(scope, project_id, chapter_id, plan_id, run, etag, **changes):
    value = {**run, **changes}
    write(run_key(scope, project_id, chapter_id, plan_id), value, etag=etag)
    return value
