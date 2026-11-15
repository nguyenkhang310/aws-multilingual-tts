"""STORY-01C bounded retries, failure destinations and CAS race checks."""

from unittest import mock

from story_batch_case import StoryBatchCase, app
from tts_common import db, story_batch_store, story_chapters, story_content
import story_control
import story_events


class StoryRecoveryControlsTest(StoryBatchCase):
    def _short_plan(self):
        upload, text = 'e' * 32, 'Một câu để thử retry.'
        story_content.upload('demo', self.pid, self.cid, upload, 0, text)
        self.chapter = story_content.commit('demo', self.pid, self.cid, upload, 1,
                                            self.chapter['revision'])
        return self.plan()

    def _retry(self, plan, segment_id):
        return self.call('POST', f"/audio-plans/{plan['planId']}/segments/{segment_id}/retry", {})

    def test_safe_retry_uses_new_attempt_key_and_cannot_double_submit(self):
        plan = self._short_plan()
        self.start(plan)
        first_event = self.lambdas.events[0]
        first_id = first_event['jobId']
        db.update_job('demo', first_id, status='FAILED', attempt=1, leaseUntil=None,
                      retryable=True, retryAfterSeconds=1, errorCode='PROVIDER_BUSY')
        self.assertEqual(app.handler({'requestContext': {'condition': 'Success'},
            'requestPayload': first_event, 'responsePayload': {'status': 'FAILED'}}, None)['status'], 'RECONCILED')
        item = self.progress(plan)[1]['items'][0]
        with mock.patch.object(story_control.time, 'time', return_value=(item['nextRetryAt'] or 0) + 1):
            status, progress = self._retry(plan, item['segmentId'])
        self.assertEqual(status, 202)
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertNotEqual(self.lambdas.events[1]['jobId'], first_id)
        self.assertEqual(progress['items'][0]['attemptCount'], 2)
        self.assertEqual(self._retry(plan, item['segmentId'])[0], 409)
        self.assertEqual(len(self.lambdas.events), 2)
        stale = {'requestContext': {'condition': 'Success'},
                 'requestPayload': first_event,
                 'responsePayload': {'jobId': first_id, 'status': 'FAILED'}}
        self.assertEqual(app.handler(stale, None)['status'], 'STALE_EVENT')
        current = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 0)[0]
        self.assertEqual(current['jobId'], self.lambdas.events[1]['jobId'])
        self.assertEqual(len(self.lambdas.events), 2)

    def test_uncertain_submit_is_never_retryable(self):
        plan = self._short_plan()
        self.lambdas.fail = True
        progress = self.start(plan)[1]
        self.assertEqual(progress['uncertain'], 1)
        self.assertEqual(self._retry(plan, progress['items'][0]['segmentId'])[0], 409)
        self.assertEqual(len(self.lambdas.events), 1)

    def test_max_attempts_and_quota_block_resume_without_provider_invocation(self):
        plan = self.plan()
        self.start(plan)
        item, etag = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 0)
        story_batch_store.update_item('demo', self.pid, self.cid, plan['planId'], 0, item, etag,
            status='FAILED', attemptCount=3, activeAttempt=None, retryable=True, nextRetryAt=0)
        run, run_etag = story_batch_store.get_run('demo', self.pid, self.cid, plan['planId'])
        story_batch_store.update_run('demo', self.pid, self.cid, plan['planId'], run, run_etag,
            status='PAUSED', desiredState='PAUSED')
        self.assertEqual(self._retry(plan, item['segmentId'])[1]['error']['code'], 'MAX_ATTEMPTS')
        before = len(self.lambdas.events)
        with mock.patch.object(story_control.db, 'remaining_chars', return_value=0):
            status, body = self.call('POST', f"/audio-plans/{plan['planId']}/resume", {})
        self.assertEqual(status, 429)
        self.assertEqual(body['error']['code'], 'TOO_MANY_REQUESTS')
        self.assertEqual(len(self.lambdas.events), before)

    def test_stale_plan_resume_is_rejected(self):
        plan = self.plan()
        self.start(plan)
        self._control_pause(plan)
        story_chapters.update('demo', self.pid, self.cid,
                              {'revision': self.chapter['revision'], 'title': 'Đã đổi'})
        status, body = self.call('POST', f"/audio-plans/{plan['planId']}/resume", {})
        self.assertEqual((status, body['error']['code']), (409, 'PLAN_STALE'))
        self.assertEqual(len(self.lambdas.events), 1)

    def test_resume_cas_does_not_overwrite_a_newer_pause(self):
        plan = self.plan()
        self.start(plan)
        self._control_pause(plan)
        original = story_batch_store.update_run
        changed = False

        def race(scope, project_id, chapter_id, plan_id, run, etag, **changes):
            nonlocal changed
            if changes.get('desiredState') == 'RUNNING' and not changed:
                changed = True
                original(scope, project_id, chapter_id, plan_id, run, etag,
                         desiredState='RUNNING', status='RUNNING')
                story_control.pause(scope, project_id, chapter_id, plan_id)
            return original(scope, project_id, chapter_id, plan_id, run, etag, **changes)

        with mock.patch.object(story_batch_store, 'update_run', side_effect=race):
            status, body = self.call('POST', f"/audio-plans/{plan['planId']}/resume", {})
        self.assertEqual((status, body['error']['code']), (409, 'RUN_CHANGED'))
        saved = story_batch_store.get_run('demo', self.pid, self.cid, plan['planId'])[0]
        self.assertEqual(saved['desiredState'], 'PAUSED')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_failure_destination_redrives_an_unclaimed_job_once_then_marks_uncertain(self):
        plan = self._short_plan()
        self.start(plan)
        event = self.lambdas.events[0]
        envelope = {'version': '1.0', 'requestContext': {'condition': 'RetriesExhausted'},
                    'requestPayload': event, 'responseContext': {'functionError': 'Unhandled'}}
        self.assertEqual(app.handler(envelope, None)['status'], 'REQUEUED_UNCLAIMED_JOB')
        self.assertEqual(len(self.lambdas.events), 2)
        job = db.get_job('demo', event['jobId'])
        item = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 0)[0]
        with mock.patch.object(story_events.time, 'time', return_value=item['redriveRequestedAt'] + 61):
            result = app.handler(envelope, None)
        self.assertEqual(result['status'], 'NEEDS_ATTENTION')
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(db.get_job('demo', event['jobId'])['status'], 'PENDING')
        current = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 0)[0]
        self.assertEqual((current['status'], current['recoveryReason']), ('UNCERTAIN', 'WORKER_EVENT_FAILED'))

    def _control_pause(self, plan):
        return self.call('POST', f"/audio-plans/{plan['planId']}/pause", {})


if __name__ == '__main__':
    import unittest
    unittest.main()
