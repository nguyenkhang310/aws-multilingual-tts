"""Private Lambda completion/failure events for headless chapter progress."""

import json
import os
import re
import time

from tts_common import aws, config, db, story_batch_store as batches
from tts_common.story_store import StoryError
from tts_common.utils import are_valid_ids

import story_progress
import story_run_state as run_state
import story_run_recovery as recovery
import story_runner

ID = re.compile(r"^[a-f0-9]{32}$")
REDRIVE_LIMIT = 1
REDRIVE_REVIEW_SECONDS = 60


def _context(event):
    payload = event.get("requestPayload") if isinstance(event.get("requestPayload"), dict) else event
    job_id, scope = payload.get("jobId"), payload.get("userId")
    if scope != "demo" or not are_valid_ids(scope, job_id):
        return None, None
    return scope, db.get_job(scope, job_id)


def _plan(job):
    context = job.get("storyContext")
    if not isinstance(context, dict) or not all(ID.fullmatch(str(context.get(key, "")))
            for key in ("projectId", "chapterId", "planId", "segmentId")):
        return None, None
    plan = batches.get_plan("demo", context["projectId"], context["chapterId"], context["planId"])
    if (context.get("planRevision") != plan.get("planRevision") or
            type(context.get("index")) is not int or not 0 <= context["index"] < plan["total"] or
            type(context.get("attempt")) is not int or not 1 <= context["attempt"] <= 3):
        return None, None
    return context, plan


def _reconcile(scope, job, context, plan):
    item = story_progress.reconcile(scope, context["projectId"], context["chapterId"],
                                    plan, context["index"])
    if item.get("jobId") != job["jobId"] or item.get("activeAttempt") not in {None, context["attempt"]}:
        return None
    return item


def _complete(scope, job):
    if job.get("status") not in {"DONE", "FAILED"}:
        return {"status": "NOT_TERMINAL"}
    context, plan = _plan(job)
    if not context:
        return {"status": "IGNORED"}
    if _reconcile(scope, job, context, plan) is None:
        return {"status": "STALE_EVENT"}
    run = batches.get_run(scope, context["projectId"], context["chapterId"], context["planId"])
    if not run:
        return {"status": "RUN_MISSING"}
    if run[0].get("desiredState", "RUNNING") == "PAUSED":
        recovery.settle_paused(scope, context["projectId"], context["chapterId"], plan)
    elif os.environ.get("STORY_HEADLESS_ENABLED", "true").lower() == "true":
        story_runner.tick(scope, context["projectId"], context["chapterId"], context["planId"])
    return {"status": "RECONCILED"}


def _uncertain(scope, context, plan, job_id, reason):
    item, etag = batches.get_item(scope, context["projectId"], context["chapterId"],
                                  context["planId"], context["index"])
    if item.get("jobId") not in {None, job_id}:
        return {"status": "STALE_EVENT"}
    if item["status"] == "DONE":
        return {"status": "ALREADY_DONE"}
    try:
        batches.update_item(scope, context["projectId"], context["chapterId"], context["planId"],
            context["index"], item, etag, status="UNCERTAIN", jobId=job_id,
            recoveryReason=reason, retryable=False)
    except StoryError as error:
        if error.code != "REVISION_CONFLICT":
            raise
        latest = batches.get_item(scope, context["projectId"], context["chapterId"],
                                  context["planId"], context["index"])[0]
        if latest.get("jobId") != job_id or latest["status"] == "DONE":
            return {"status": "STATE_CHANGED"}
    run_state.change(scope, context["projectId"], context["chapterId"], context["planId"],
                     status="NEEDS_ATTENTION", recoveryReason=reason)
    return {"status": "NEEDS_ATTENTION"}


def _redrive_unclaimed(scope, job, context, plan, item):
    if os.environ.get("STORY_HEADLESS_ENABLED", "true").lower() != "true":
        return _uncertain(scope, context, plan, job["jobId"], "HEADLESS_DISABLED")
    requested = item.get("redriveRequestedAt")
    if item.get("workerRedriveCount", 0) >= REDRIVE_LIMIT:
        if time.time() - (requested or time.time()) < REDRIVE_REVIEW_SECONDS:
            return {"status": "REDRIVE_PENDING"}
        return _uncertain(scope, context, plan, job["jobId"], "WORKER_EVENT_FAILED")
    current, etag = batches.get_item(scope, context["projectId"], context["chapterId"],
                                     context["planId"], context["index"])
    if current.get("jobId") != job["jobId"] or current.get("status") not in {"SUBMITTED", "SUBMITTING"}:
        return {"status": "STATE_CHANGED"}
    try:
        batches.update_item(scope, context["projectId"], context["chapterId"], context["planId"],
            context["index"], current, etag, workerRedriveCount=1, redriveRequestedAt=int(time.time()))
    except StoryError as error:
        if error.code == "REVISION_CONFLICT":
            return {"status": "REDRIVE_PENDING"}
        raise
    payload = json.dumps({"userId": scope, "jobId": job["jobId"]}).encode()
    try:
        response = aws.lambda_client().invoke(FunctionName=config.SYNTH_FUNCTION_NAME,
            InvocationType="Event", Payload=payload)
    except Exception:
        return _uncertain(scope, context, plan, job["jobId"], "WORKER_REDRIVE_UNCERTAIN")
    if response.get("StatusCode") != 202:
        return _uncertain(scope, context, plan, job["jobId"], "WORKER_REDRIVE_UNCERTAIN")
    return {"status": "REQUEUED_UNCLAIMED_JOB"}


def _failed(scope, job):
    context, plan = _plan(job)
    if not context:
        return {"status": "IGNORED"}
    if job.get("status") in {"DONE", "FAILED"}:
        return _complete(scope, job)
    item = _reconcile(scope, job, context, plan)
    if item is None:
        return {"status": "STALE_EVENT"}
    if (job.get("status") == "PENDING" and job.get("attempt", 0) == 0 and
            not job.get("leaseUntil")):
        return _redrive_unclaimed(scope, job, context, plan, item)
    return _uncertain(scope, context, plan, job["jobId"], "WORKER_EVENT_FAILED")


def handle(event):
    operation = event.get("operation")
    scope, job = _context(event)
    if not job:
        return {"status": "IGNORED"}
    if operation == "storyCompletion":
        return _complete(scope, job)
    if operation == "storyWorkerFailure":
        return _failed(scope, job)
    condition = (event.get("requestContext") or {}).get("condition")
    if condition == "Success":
        return _complete(scope, job)
    if condition in {"RetriesExhausted", "EventAgeExceeded"}:
        return _failed(scope, job)
    return {"status": "IGNORED"}
