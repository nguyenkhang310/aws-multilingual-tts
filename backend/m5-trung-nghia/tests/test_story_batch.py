"""Chapter batch integration with the current M5 submit and M2 worker."""

from unittest import mock
from story_batch_case import StoryBatchCase
from tts_common import db, story_batch_store, story_chapters, story_content
import story_runner
import story_run_recovery as recovery
import story_run_state as run_state


class StoryBatchTest(StoryBatchCase):
    def test_plan_batch_real_worker_progress_and_repeated_start(self):
        plan = self.plan()
        self.assertGreaterEqual(plan['total'], 3)
        self.assertEqual(plan['totalChars'], len(self.text))
        self.assertEqual(self.plan()['planId'], plan['planId'])
        with mock.patch.object(run_state, 'now', side_effect=['2026-11-14T00:00:00Z'] * 20):
            self.assertEqual(self.start(plan)[0], 202)
            self.assertEqual(self.start(plan)[0], 202)
        saved = self.call('GET', f"/audio-plans/{plan['planId']}")[1]
        self.assertEqual(saved['status'], 'RUNNING')
        self.assertIsNotNone(saved['approvedAt'])
        self.assertEqual(len(self.lambdas.events), 1)
        self.assertEqual(self.tick(plan)[1]['submitted'], 1)
        self.complete()
        progress = self.tick(plan)[1]
        self.assertEqual(progress['done'], 1)
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertTrue(progress['items'][0]['audioUrl'].startswith('https://'))
        self.assertNotIn('claimToken', progress['items'][0])
        self.assertNotIn('sourceHash', progress['items'][0])
        self.assertEqual(db.get_job('demo', self.lambdas.events[0]['jobId'])['text'],
                         story_content.segment_at('demo', self.pid, self.cid, plan['contentRevision'], 0)['sourceText'])

    def test_all_segments_finish_without_duplicate_jobs(self):
        plan = self.plan(); self.start(plan)
        for index in range(plan['total']):
            self.complete(self.lambdas.events[index])
            result = self.tick(plan)[1]
            self.assertEqual(result['done'], index + 1)
        self.assertEqual(result['status'], 'COMPLETED')
        self.assertEqual(result['percentComplete'], 100)
        self.assertEqual(len(self.lambdas.events), plan['total'])
        self.tick(plan)
        self.assertEqual(len(self.lambdas.events), plan['total'])

    def test_worker_failure_is_recorded_and_other_segments_can_continue(self):
        plan = self.plan(); self.start(plan)
        first = self.lambdas.events[0]
        claim = db.claim_job('demo', first['jobId'], 60).job
        db.fail_job(claim, 'Giọng chưa sẵn sàng.')
        result = self.tick(plan)[1]
        self.assertEqual(result['failed'], 1)
        self.assertEqual(result['status'], 'RUNNING')
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(db.get_job('demo', self.lambdas.events[1]['jobId'])['storyContext']['index'], 1)
        other = self.plan()
        story_chapters.update('demo', self.pid, self.cid, {'revision': self.chapter['revision'], 'title': 'Đã sửa'})
        self.assertEqual(self.start(other)[0], 409)

    def test_later_failed_item_does_not_block_remaining_queued_item(self):
        plan = self.plan(); self.start(plan); self.complete()
        item, etag = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 2)
        story_batch_store.update_item('demo', self.pid, self.cid, plan['planId'], 2, item, etag, status='FAILED')
        result = self.tick(plan)[1]
        self.assertEqual(result['status'], 'RUNNING')
        self.assertEqual(len(self.lambdas.events), 2)

    def test_missing_audio_is_not_reported_done(self):
        plan = self.plan(); self.start(plan); self.complete()
        self.assertEqual(self.tick(plan)[1]['done'], 1)
        job = db.get_job('demo', self.lambdas.events[0]['jobId'])
        self.s3.delete_object(Bucket='audio', Key=job['audioKey'])
        result = self.tick(plan)[1]
        self.assertEqual(result['done'], 0)
        self.assertEqual(result['uncertain'], 1)
        self.assertEqual(len(self.lambdas.events), 2)

    def test_late_submit_confirmation_does_not_downgrade_done(self):
        plan = self.plan(); self.start(plan); self.complete()
        self.tick(plan)
        job_id = self.lambdas.events[0]['jobId']
        recovery.mark('demo', self.pid, self.cid, plan['planId'], 0, 'SUBMITTED', job_id)
        item = story_batch_store.get_item('demo', self.pid, self.cid, plan['planId'], 0)[0]
        self.assertEqual(item['status'], 'DONE')
