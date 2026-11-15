"""STORY-01C pause/resume and backend-only completion-chain tests."""

from unittest import mock

from story_batch_case import StoryBatchCase, app
from tts_common import config, db, story_batch_store, story_content


class StoryOrchestrationTest(StoryBatchCase):
    def _short_plan(self):
        upload = 'c' * 32
        text = 'Một chương chỉ có một đoạn.'
        story_content.upload('demo', self.pid, self.cid, upload, 0, text)
        self.chapter = story_content.commit('demo', self.pid, self.cid, upload, 1,
                                            self.chapter['revision'])
        plan = self.plan()
        self.assertEqual(plan['total'], 1)
        return plan

    def _control(self, plan, action):
        return self.call('POST', f"/audio-plans/{plan['planId']}/{action}", {})

    def test_headless_completion_chain_finishes_eight_segments_without_client_ticks(self):
        text = 'Xin chào. ' * 8000
        upload = 'd' * 32
        parts = [text[start:start + 30000] for start in range(0, len(text), 30000)]
        for index, part in enumerate(parts):
            story_content.upload('demo', self.pid, self.cid, upload, index, part)
        self.chapter = story_content.commit('demo', self.pid, self.cid, upload, len(parts),
                                            self.chapter['revision'])
        with mock.patch.object(config, 'DAILY_CHAR_LIMIT', 100000):
            plan = self.plan()
            self.assertGreaterEqual(plan['total'], 5)
            self.start(plan)
            for index in range(plan['total']):
                self.complete(self.lambdas.events[index], deliver_destination=True)
            self.assertEqual(len(self.lambdas.events), plan['total'])
            progress = self.progress(plan)[1]
            self.assertEqual(progress['status'], 'COMPLETED')
            self.assertEqual(progress['done'], plan['total'])
            self.assertEqual(progress['queued'], 0)
            self.assertEqual(db.remaining_chars(), 100000 - len(text))
            self.assertTrue(all(item['jobId'] for item in progress['items']))
            self.assertTrue(all(item.get('audioUrl') for item in progress['items']))

    def test_pause_keeps_running_job_and_completion_does_not_dispatch_next(self):
        plan = self.plan()
        self.start(plan)
        status, paused = self._control(plan, 'pause')
        self.assertEqual(status, 200)
        self.assertEqual(paused['desiredState'], 'PAUSED')
        self.assertEqual(paused['status'], 'PAUSED')
        first_job = self.lambdas.events[0]['jobId']
        self.complete(deliver_destination=True)
        progress = self.progress(plan)[1]
        self.assertEqual(progress['done'], 1)
        self.assertEqual(progress['status'], 'PAUSED')
        self.assertEqual(db.get_job('demo', first_job)['status'], 'DONE')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_resume_is_idempotent_and_preserves_completed_segment(self):
        plan = self.plan()
        self.start(plan)
        self._control(plan, 'pause')
        self.complete(deliver_destination=True)
        status, resumed = self._control(plan, 'resume')
        self.assertEqual(status, 202)
        self.assertEqual(resumed['done'], 1)
        self.assertEqual(len(self.lambdas.events), 2)
        self._control(plan, 'resume')
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(story_batch_store.get_item('demo', self.pid, self.cid,
                         plan['planId'], 0)[0]['status'], 'DONE')

    def test_duplicate_completion_does_not_dispatch_an_extra_segment(self):
        plan = self.plan()
        self.start(plan)
        first_event = self.lambdas.events[0]
        self.complete(first_event, deliver_destination=True)
        self.assertEqual(len(self.lambdas.events), 2)
        duplicate = {'requestContext': {'condition': 'Success'},
                     'requestPayload': first_event,
                     'responsePayload': {'jobId': first_event['jobId'], 'status': 'DONE'}}
        self.assertEqual(app.handler(duplicate, None)['status'], 'RECONCILED')
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(self.progress(plan)[1]['done'], 1)

    def test_lost_completion_callback_is_recovered_by_bounded_tick_without_duplicate(self):
        plan = self.plan()
        self.start(plan)
        first = self.lambdas.events[0]
        first_job = first['jobId']
        self.complete(first)  # Simulate the worker completing while its destination callback is lost.

        progress = self.progress(plan)[1]
        self.assertEqual(progress['done'], 1)
        self.assertEqual(progress['status'], 'RUNNING')
        self.assertEqual(len(self.lambdas.events), 1)

        ticked = self.tick(plan)[1]
        self.assertEqual(ticked['submitted'], 1)
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(self.lambdas.events[0]['jobId'], first_job)
        self.assertEqual(db.get_job('demo', first_job)['status'], 'DONE')

    def test_provider_throttle_blocks_headless_chain_until_retry(self):
        plan = self.plan()
        self.start(plan)
        first_event = self.lambdas.events[0]
        db.update_job('demo', first_event['jobId'], status='FAILED', attempt=1,
                      leaseUntil=None, retryable=True, retryAfterSeconds=60,
                      errorCode='PROVIDER_BUSY')
        envelope = {'requestContext': {'condition': 'Success'},
                    'requestPayload': first_event,
                    'responsePayload': {'jobId': first_event['jobId'], 'status': 'FAILED'}}

        self.assertEqual(app.handler(envelope, None)['status'], 'RECONCILED')
        progress = self.progress(plan)[1]
        self.assertEqual(progress['failed'], 1)
        self.assertEqual(progress['status'], 'BLOCKED_QUOTA')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_persistent_provider_configuration_error_stops_dispatch(self):
        plan = self.plan()
        self.start(plan)
        event = self.lambdas.events[0]
        db.update_job('demo', event['jobId'], status='FAILED', attempt=1,
                      leaseUntil=None, retryable=False, errorCode='PROVIDER_AUTH')
        envelope = {'requestContext': {'condition': 'Success'},
                    'requestPayload': event,
                    'responsePayload': {'jobId': event['jobId'], 'status': 'FAILED'}}

        self.assertEqual(app.handler(envelope, None)['status'], 'RECONCILED')
        self.assertEqual(self.progress(plan)[1]['status'], 'NEEDS_ATTENTION')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_pause_before_first_dispatch_and_repeated_pause(self):
        plan = self.plan()
        story_batch_store.start_run('demo', self.pid, self.cid, plan['planId'], 'now')
        first = self._control(plan, 'pause')[1]
        second = self._control(plan, 'pause')[1]
        self.assertEqual(first['status'], 'PAUSED')
        self.assertEqual(second['status'], 'PAUSED')
        self.assertEqual(len(self.lambdas.events), 0)
        self._control(plan, 'resume')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_pause_completion_event_settles_pausing_only_after_dispatch_lease_expires(self):
        plan = self.plan()
        self.start(plan)
        run, etag = story_batch_store.get_run('demo', self.pid, self.cid, plan['planId'])
        story_batch_store.update_run('demo', self.pid, self.cid, plan['planId'], run, etag,
            desiredState='PAUSED', status='PAUSING',
            dispatchLease={'token': 'a' * 32, 'expiresAt': 4102444800})
        self.complete(deliver_destination=True)
        saved = story_batch_store.get_run('demo', self.pid, self.cid, plan['planId'])[0]
        self.assertEqual(saved['status'], 'PAUSING')
        self.assertEqual(len(self.lambdas.events), 1)

    def test_worker_destination_contract_has_one_bounded_worker_event_config(self):
        from pathlib import Path
        template = (Path(__file__).resolve().parents[2] / 'm2-trung-khang/infra/tts.yaml').read_text()
        self.assertEqual(template.count('Type: AWS::Lambda::EventInvokeConfig'), 1)
        self.assertIn('OnSuccess:', template)
        self.assertIn('OnFailure:', template)
        self.assertIn('MaximumRetryAttempts: !Ref MaximumRetryAttempts', template)


if __name__ == '__main__':
    import unittest
    unittest.main()
