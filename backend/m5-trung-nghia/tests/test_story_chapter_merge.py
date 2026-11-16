"""Chapter MP3 export uses finished jobs and never invokes TTS again."""

import unittest
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest import mock

from story_batch_case import StoryBatchCase
from tts_common import db, storage, story_chapter_audio as audio


FRAME = b"\xff\xf3\xa4\xc0" + bytes(284)


class ChapterMergeTest(StoryBatchCase):
    def test_progress_is_completed_without_waiting_for_last_callback(self):
        plan = self.plan(); self.start(plan)
        for index in range(plan['total']):
            self.complete(self.lambdas.events[index])
            if index + 1 < plan['total']:
                self.tick(plan)
        status, result = self.progress(plan)
        self.assertEqual(status, 200, result)
        self.assertEqual(result['done'], result['total'])
        self.assertEqual(result['status'], 'COMPLETED')
        self.assertEqual(result['percentComplete'], 100)

    def completed_plan(self, count=3, payload=FRAME):
        plan = self.plan(); self.start(plan)
        for index in range(count):
            event = self.lambdas.events[index]
            self.complete(event)
            key = storage.audio_key('demo', event['jobId'])
            self.s3.seed('audio', key, payload)
            self.tick(plan)
        return plan

    def route(self, plan):
        return f"/audio-plans/{plan['planId']}/chapter-audio"

    def finish(self, plan):
        result = None
        for _ in range(20):
            status, result = self.call('POST', self.route(plan), {})
            self.assertEqual(status, 202, result)
            if result['status'] == 'DONE':
                return result
        self.fail(f"Ghép chưa hoàn tất: {result}")

    def test_three_segments_order_replay_and_fresh_url(self):
        plan = self.completed_plan()
        before = len(self.lambdas.events)
        result = self.finish(plan)
        self.assertEqual(result['processed'], 3)
        key = audio.get('demo', self.pid, self.cid, plan['planId'])[0]['outputKey']
        self.assertEqual(self.s3.objects['audio', key][0], FRAME * 3)
        self.assertEqual(self.call('GET', self.route(plan))[1]['status'], 'DONE')
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['status'], 'DONE')
        self.assertEqual(len(self.lambdas.events), before)
        self.assertEqual(len([item for item in self.s3.puts if item['Key'] == key]), 1)
        self.assertGreaterEqual(len(self.s3.signed_urls), 3)
        self.assertIn('downloadUrl', result)
        disposition = next(params['ResponseContentDisposition'] for operation, params, _ in self.s3.signed_urls
                           if params.get('ResponseContentDisposition'))
        self.assertIn('filename="chuong-01---Truyen.mp3"', disposition)
        self.assertIn("filename*=UTF-8''chuong%2001%20-%20Truy%E1%BB%87n.mp3", disposition)
        self.s3.delete_object(Bucket='audio', Key=key)
        self.assertEqual(self.call('GET', self.route(plan))[1]['status'], 'MISSING')
        self.assertEqual(self.finish(plan)['status'], 'DONE')

    def test_missing_failed_or_wrong_plan_is_rejected(self):
        plan = self.plan()
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['error']['code'], 'CHAPTER_AUDIO_INCOMPLETE')
        self.start(plan); self.complete()
        self.tick(plan)
        self.assertEqual(self.call('POST', self.route(plan), {})[0], 409)
        for index in range(1, plan['total']):
            self.complete(self.lambdas.events[index]); self.tick(plan)
        first = self.lambdas.events[0]
        job = db.get_job('demo', first['jobId'])
        self.s3.delete_object(Bucket='audio', Key=job['audioKey'])
        self.assertEqual(self.call('POST', self.route(plan), {})[0], 409)
        self.s3.seed('audio', job['audioKey'], FRAME)
        job['storyContext']['planId'] = 'f' * 32
        key = next(key for bucket, key in self.s3.objects if bucket == 'jobs' and key.endswith(first['jobId'] + '.json'))
        self.s3.seed('jobs', key, json.dumps(job).encode(), 'application/json')
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['error']['code'], 'AUDIO_PLAN_MISMATCH')

    def test_large_audio_uses_multipart_and_resume(self):
        payload = FRAME * 21000  # Roughly 6 MiB per segment, >16 MiB in total.
        plan = self.completed_plan(payload=payload)
        first = self.call('POST', self.route(plan), {})[1]
        self.assertEqual(first['status'], 'STAGING')
        self.assertEqual(first['processed'], 2)
        result = self.finish(plan)
        key = audio.get('demo', self.pid, self.cid, plan['planId'])[0]['outputKey']
        self.assertEqual(len(self.s3.objects['audio', key][0]), len(payload) * 3)
        self.assertEqual(result['status'], 'DONE')
        self.assertFalse(self.s3.uploads)

    def test_failed_multipart_step_retries_without_duplicate_audio(self):
        payload = FRAME * 21000
        plan = self.completed_plan(payload=payload)
        for _ in range(3):
            self.call('POST', self.route(plan), {})  # Two staging steps, then begin upload.
        original = self.s3.upload_part
        with mock.patch.object(self.s3, 'upload_part', side_effect=RuntimeError('temporary')):
            self.assertEqual(self.call('POST', self.route(plan), {})[0], 503)
        self.s3.upload_part = original
        self.finish(plan)
        key = audio.get('demo', self.pid, self.cid, plan['planId'])[0]['outputKey']
        self.assertEqual(self.s3.objects['audio', key][0], payload * 3)

    def test_mismatched_or_invalid_mp3_does_not_publish(self):
        plan = self.completed_plan()
        second = self.lambdas.events[1]
        self.s3.seed('audio', storage.audio_key('demo', second['jobId']),
                     b'\xff\xfb\x90\xc0' + bytes(413))
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['error']['code'], 'AUDIO_FORMAT_MISMATCH')
        self.s3.seed('audio', storage.audio_key('demo', second['jobId']), b'not an mp3')
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['error']['code'], 'INVALID_AUDIO')
        self.assertFalse(any(key.endswith('.mp3') and '/audiobooks/' in key
                             for bucket, key in self.s3.objects if bucket == 'audio'))

    def test_concurrent_lease_and_cas_conflict_do_not_duplicate(self):
        plan = self.completed_plan()
        self.call('POST', self.route(plan), {})
        record, etag = audio.get('demo', self.pid, self.cid, plan['planId'])
        audio.save('demo', self.pid, self.cid, plan['planId'], {**record, 'leaseUntil': 9999999999}, etag)
        before = len(self.s3.puts)
        self.assertEqual(self.call('POST', self.route(plan), {})[1]['status'], 'ASSEMBLING')
        self.assertEqual(len(self.s3.puts), before)
        with self.assertRaises(Exception):
            audio.save('demo', self.pid, self.cid, plan['planId'], record, etag)

    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Cần FFmpeg để kiểm file thật')
    def test_result_decodes_as_real_mp3(self):
        plan = self.completed_plan()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index, event in enumerate(self.lambdas.events[:3]):
                path = root / f'{index}.mp3'
                subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i',
                    f'sine=frequency={440 + index * 100}:duration=0.5', '-ar', '24000',
                    '-ac', '1', '-b:a', '96k', str(path)], check=True, capture_output=True)
                self.s3.seed('audio', storage.audio_key('demo', event['jobId']), path.read_bytes())
            self.finish(plan)
            key = audio.get('demo', self.pid, self.cid, plan['planId'])[0]['outputKey']
            path = root / 'chapter.mp3'
            path.write_bytes(self.s3.objects['audio', key][0])
            duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error',
                '-show_entries', 'format=duration', '-of', 'json', str(path)]))['format']['duration'])
            self.assertAlmostEqual(duration, 1.5, delta=0.2)
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', '-'],
                           check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
