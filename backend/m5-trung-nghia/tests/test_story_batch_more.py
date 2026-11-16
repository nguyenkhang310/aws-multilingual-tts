"""Chapter batch quota, race and large input checks."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from unittest import mock
from story_batch_case import StoryBatchCase
from tts_common import config, db, story_chapters, story_content, story_batch_store
import story_runner
import story_run_recovery as recovery
import story_dispatch
import story_progress


class StoryBatchMoreTest(StoryBatchCase):
    def test_one_queue_segment_exposes_worker_chunk_progress(self):
        item = {'status': 'PROCESSING', 'jobId': 'job-progress'}
        job = {'status': 'PROCESSING', 'chunkCount': 5, 'chunksDone': 2}
        with mock.patch.object(story_progress.db, 'get_job', return_value=job):
            self.assertEqual(story_progress._audio_fraction('demo', item), 0.4)

    def test_auto_style_is_one_style_per_segment(self):
        body = {'chapterRevision': self.chapter['revision'], 'provider': 'azure',
                'voice': 'voice-fixture', 'speed': 0.9, 'style': 'auto', 'styleIntensity': 1}
        self.assertEqual(self.call('POST', '/audio-plans', body)[1]['error']['code'], 'EMOTION_NOT_CONFIGURED')
        with mock.patch.dict(os.environ, {'GEMINI_EMOTION_ENABLED': 'true',
                                          'GEMINI_API_PARAMETER_NAME': '/test/gemini',
                                          'GEMINI_MODEL': 'gemini-3.6-flash'}):
            status, plan = self.call('POST', '/audio-plans', body)
        self.assertEqual(status, 201)
        self.assertEqual(plan['style'], 'auto')

    def test_target_voice_plan_uses_existing_translator_path(self):
        body = {'chapterRevision': self.chapter['revision'], 'provider': 'azure',
                'voice': 'voice-fixture', 'speed': 0.9, 'style': 'neutral',
                'styleIntensity': 1, 'translateTo': 'en-US'}
        self.assertEqual(self.call('POST', '/audio-plans', body)[1]['error']['code'], 'TRANSLATION_NOT_CONFIGURED')
        with mock.patch.dict(os.environ, {'TRANSLATOR_API_PARAMETER_NAME': '/test/translator'}):
            status, plan = self.call('POST', '/audio-plans', body)
        self.assertEqual(status, 201)
        self.assertEqual(plan['translateTo'], 'en-US')
        stored = story_batch_store.get_plan('demo', self.pid, self.cid, plan['planId'])
        captured = []
        def synthesize(event):
            captured.append(json.loads(event['body']))
            return {'statusCode': 202, 'body': '{"jobId":"test"}'}
        with mock.patch('app._synthesize', side_effect=synthesize):
            story_dispatch.submit('demo', stored, stored['segments'][0], 'Xin chào')
        self.assertEqual(captured[0]['lang'], 'vi-VN')
        self.assertEqual(captured[0]['translateTo'], 'en-US')

    def test_quota_stops_without_losing_done_and_stale_plan(self):
        plan = self.plan()
        with mock.patch.object(config, 'DAILY_CHAR_LIMIT', 12000):
            self.start(plan); self.complete()
            result = self.tick(plan)[1]
            self.assertEqual(result['done'], 1)
            self.assertGreater(result['blockedQuota'], 0)
            self.assertEqual(len(self.lambdas.events), 1)
        story_chapters.update('demo', self.pid, self.cid, {'revision': self.chapter['revision'], 'title': 'Đã sửa'})
        self.assertEqual(self.tick(plan)[1]['status'], 'STALE')

    def test_uncertain_response_and_lost_queue_update_never_resubmit(self):
        plan = self.plan()
        self.lambdas.fail = True
        result = self.start(plan)[1]
        self.assertGreater(result['uncertain'], 0)
        self.tick(plan)
        self.assertEqual(len(self.lambdas.events), 1)

    def test_queue_update_failure_reconciles_mapping_without_second_invoke(self):
        plan = self.plan()
        original = recovery.mark
        failed = False
        def fail_once(*args):
            nonlocal failed
            if not failed:
                failed = True
                raise RuntimeError('S3 response lost')
            return original(*args)
        with mock.patch.object(recovery, 'mark', side_effect=fail_once):
            self.assertEqual(self.start(plan)[0], 503)
        self.assertEqual(self.tick(plan)[1]['submitted'], 1)
        self.assertEqual(len(self.lambdas.events), 1)

    def test_concurrent_tick_and_scope(self):
        plan = self.plan(); self.start(plan); self.complete()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.tick(plan)[0], range(2)))
        self.assertEqual(results, [200, 200])
        self.assertEqual(len(self.lambdas.events), 2)
        self.assertEqual(self.call('GET', f"/audio-plans/{plan['planId']}", scope='other')[0], 403)

    def test_two_active_jobs_are_project_limited(self):
        plan = self.plan()
        with mock.patch.dict(os.environ, {'STORY_MAX_ACTIVE': '2'}):
            self.start(plan); self.tick(plan); self.tick(plan)
            self.assertEqual(len(self.lambdas.events), 2)
            self.complete(self.lambdas.events[0])
            self.tick(plan)
            self.assertEqual(len(self.lambdas.events), 3)

    def test_gemini_quota_estimate_blocks_before_submit(self):
        status, plan = self.call('POST', '/audio-plans', {'chapterRevision': self.chapter['revision'],
            'provider': 'gemini', 'voice': 'voice-fixture', 'speed': 0.9,
            'style': 'neutral', 'styleIntensity': 1})
        self.assertEqual(status, 201)
        with mock.patch.object(story_runner, 'remaining_gemini_calls', return_value=0):
            result = self.start(plan)[1]
        self.assertEqual(result['status'], 'BLOCKED_QUOTA')
        self.assertEqual(len(self.lambdas.events), 0)
        self.assertEqual(db.remaining_chars(), 30000)

    def test_large_chapter_plan_uses_stored_segments_without_provider_calls(self):
        text = 'Xin chào 日本語 한글 中文 😊\n' * 11000
        self.assertGreater(len(text), 200000)
        upload = 'b' * 32
        parts = [text[start:start + 30000] for start in range(0, len(text), 30000)]
        for index, part in enumerate(parts):
            story_content.upload('demo', self.pid, self.cid, upload, index, part)
        self.chapter = story_content.commit('demo', self.pid, self.cid, upload, len(parts), self.chapter['revision'])
        self.text = text
        plan = self.plan()
        self.assertEqual(plan['totalChars'], len(text))
        self.assertGreater(plan['total'], 20)
        self.assertEqual(len(self.lambdas.events), 0)
