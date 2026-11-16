"""Bounded, resumable assembly of an approved audiobook plan into one MP3."""

import hashlib
import json
import time

from tts_common import config, db, story_batch_store as batches, story_chapter_audio as audio
from tts_common.story_mp3 import frames
from tts_common.story_store import StoryError

import story_progress

MAX_STAGE_BYTES = 16 * 1024 * 1024
STAGE_ITEMS = 16
LEASE_SECONDS = 45  # Submit Lambda has a 30-second timeout.


def _response(record, chapter_number=None, story_title="Truyện"):
    result = {key: record.get(key) for key in ("status", "planId", "total", "processed", "createdAt", "error")}
    if record["status"] == "DONE" and audio.exists(record["outputKey"]):
        result["audioUrl"] = audio.url(record["outputKey"])
        if chapter_number is not None:
            result["downloadUrl"] = audio.download_url(record["outputKey"], chapter_number, story_title)
    elif record["status"] == "DONE":
        result.update(status="MISSING", error="MP3 chương không còn trong S3.")
    return result


def status(scope, project_id, chapter_id, plan_id):
    from tts_common import story_chapters, story_projects
    batches.get_plan(scope, project_id, chapter_id, plan_id)
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    project, _ = story_projects.get(scope, project_id)
    stored = audio.get(scope, project_id, chapter_id, plan_id)
    return _response(stored[0], chapter["chapterNumber"], project["title"]) if stored else {"status": "NOT_STARTED", "planId": plan_id}


def _entry(scope, project_id, chapter_id, plan, index):
    item = story_progress.reconcile(scope, project_id, chapter_id, plan, index)
    ref = plan["segments"][index]
    if item["status"] != "DONE" or any(item.get(key) != ref.get(key)
                                           for key in ("segmentId", "revision", "sourceHash")):
        raise StoryError(409, "CHAPTER_AUDIO_INCOMPLETE", "Chưa đủ đoạn hoàn thành để ghép chương.")
    job = db.get_job(scope, item["jobId"])
    context = (job or {}).get("storyContext") or {}
    expected = {"projectId": project_id, "chapterId": chapter_id, "planId": plan["planId"],
                "segmentId": ref["segmentId"], "index": index, "planRevision": plan["planRevision"]}
    if any(context.get(key) != value for key, value in expected.items()) or job.get("status") != "DONE":
        raise StoryError(409, "AUDIO_PLAN_MISMATCH", "Bản thu không thuộc kế hoạch đang ghép.")
    key = job.get("audioKey")
    if not key:
        raise StoryError(409, "AUDIO_MISSING", "Một đoạn chưa có MP3.")
    head = audio.exists(key)
    if not head:
        raise StoryError(409, "AUDIO_MISSING", "Một đoạn MP3 không còn trong S3.")
    if head["ContentLength"] > MAX_STAGE_BYTES:
        raise StoryError(413, "AUDIO_SEGMENT_TOO_LARGE", "Một đoạn MP3 quá lớn để ghép trong một lượt.")
    return {"jobId": item["jobId"], "audioKey": key,
            "etag": head["ETag"], "size": head["ContentLength"]}


def _stage(scope, project_id, chapter_id, plan, record):
    data, entries, profile = [], [], record.get("profile")
    size = 0
    for index in range(record["processed"], min(plan["total"], record["processed"] + STAGE_ITEMS)):
        entry = _entry(scope, project_id, chapter_id, plan, index)
        if entries and size + entry["size"] > MAX_STAGE_BYTES:
            break
        chunk, kind = frames(audio.source(scope, entry))
        if profile and list(kind) != profile:
            raise StoryError(409, "AUDIO_FORMAT_MISMATCH", "Các đoạn MP3 có định dạng khác nhau.")
        profile = list(kind)
        data.append(chunk); entries.append(entry); size += len(chunk)
    if not entries:
        raise StoryError(409, "AUDIO_MISSING", "Không có MP3 để ghép.")
    key = audio.stage_key(scope, project_id, chapter_id, plan["planId"], len(record["chunks"]))
    audio.put_stage(key, b"".join(data))
    sources = record["sources"] + entries
    chunks = record["chunks"] + [{"key": key, "size": size}]
    processed = record["processed"] + len(entries)
    changes = {"processed": processed, "sources": sources, "chunks": chunks, "profile": profile}
    if processed == plan["total"]:
        digest = hashlib.sha256(json.dumps([plan["fingerprint"], sources], sort_keys=True).encode()).hexdigest()
        changes.update(status="ASSEMBLING", outputKey=audio.output_key(scope, project_id,
                         chapter_id, plan["planId"], digest))
    return changes


def _assemble(record):
    if audio.exists(record["outputKey"]):
        return {"status": "DONE"}
    chunks = record["chunks"]
    if len(chunks) == 1:
        data = audio.read_stage(chunks[0]["key"])
        audio.single(record["outputKey"], data)
        return {"status": "DONE"}
    if not record.get("uploadId"):
        return {"uploadId": audio.begin(record["outputKey"]), "nextChunk": 0, "parts": []}
    start, buffer = record["nextChunk"], []
    size, index = 0, start
    while index < len(chunks) and (size < 5 * 1024 * 1024 or index == start):
        data = audio.read_stage(chunks[index]["key"])
        if len(data) != chunks[index]["size"]:
            raise StoryError(409, "AUDIO_STAGE_CHANGED", "Dữ liệu ghép chương đã đổi.")
        buffer.append(data); size += len(data); index += 1
    number = len(record["parts"]) + 1
    etag = audio.part(record["outputKey"], record["uploadId"], number, b"".join(buffer))
    parts = record["parts"] + [{"PartNumber": number, "ETag": etag}]
    if index == len(chunks):
        audio.finish(record["outputKey"], record["uploadId"], parts)
        return {"status": "DONE", "nextChunk": index, "parts": parts}
    return {"nextChunk": index, "parts": parts}


def advance(scope, project_id, chapter_id, plan_id):
    from tts_common import story_chapters, story_projects
    plan = batches.get_plan(scope, project_id, chapter_id, plan_id)
    chapter, _ = story_chapters.get(scope, project_id, chapter_id)
    project, _ = story_projects.get(scope, project_id)
    stored = audio.get(scope, project_id, chapter_id, plan_id)
    if not stored:
        record = {"status": "STAGING", "planId": plan_id, "total": plan["total"],
                  "processed": 0, "createdAt": int(time.time()), "chunks": [], "sources": [],
                  "leaseUntil": 0}
        try:
            stored = audio.save(scope, project_id, chapter_id, plan_id, record)
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
            stored = audio.get(scope, project_id, chapter_id, plan_id)
    record, etag = stored
    if record["status"] == "DONE":
        if audio.exists(record["outputKey"]):
            return _response(record, chapter["chapterNumber"], project["title"])
        restored = {**record, "status": "STAGING", "processed": 0, "chunks": [],
                    "sources": [], "profile": None, "uploadId": None,
                    "nextChunk": 0, "parts": [], "leaseUntil": 0}
        try:
            record, etag = audio.save(scope, project_id, chapter_id, plan_id, restored, etag)
        except StoryError as error:
            if error.code != "REVISION_CONFLICT":
                raise
            return status(scope, project_id, chapter_id, plan_id)
    if record.get("leaseUntil", 0) > time.time():
        return _response(record, chapter["chapterNumber"], project["title"])
    leased = {**record, "leaseUntil": time.time() + LEASE_SECONDS}
    try:
        current, etag = audio.save(scope, project_id, chapter_id, plan_id, leased, etag)
    except StoryError as error:
        if error.code != "REVISION_CONFLICT":
            raise
        return status(scope, project_id, chapter_id, plan_id)
    try:
        changes = (_stage(scope, project_id, chapter_id, plan, current)
                   if current["status"] == "STAGING" else _assemble(current))
        saved, _ = audio.save(scope, project_id, chapter_id, plan_id,
                              {**current, **changes, "leaseUntil": 0}, etag)
        return _response(saved, chapter["chapterNumber"], project["title"])
    except Exception:
        # The lease expires after a failed invocation; a retry overwrites the same part number.
        try:
            audio.save(scope, project_id, chapter_id, plan_id, {**current, "leaseUntil": 0}, etag)
        except StoryError:
            pass
        raise
