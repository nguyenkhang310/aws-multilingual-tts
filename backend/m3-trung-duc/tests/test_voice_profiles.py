import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'common/python'))
from fake_s3 import FakeS3
from tts_common import aws, config, voice_profiles, story_chapter_audio
from tts_common.story_store import StoryError


class VoiceProfilesTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (mock.patch.object(aws, 's3', return_value=self.s3),
                        mock.patch.object(config, 'JOBS_BUCKET', 'jobs'),
                        mock.patch.object(config, 'JOBS_PREFIX', 'jobs/')):
            patcher.start(); self.addCleanup(patcher.stop)

    def test_fifty_profiles_include_both_metadata_and_wav_in_s3_listing(self):
        for index in range(50):
            voice_profiles.create('demo', f'{index:032x}', f'Mẫu {index}', 'vi-VN', b'fake-wav')
        original = self.s3.list_objects_v2
        def bounded(**kwargs):
            result = original(**kwargs)
            items = result['Contents']
            return {**result, 'Contents': items[:kwargs['MaxKeys']], 'IsTruncated': len(items) > kwargs['MaxKeys']}
        with mock.patch.object(self.s3, 'list_objects_v2', side_effect=bounded):
            self.assertEqual(len(voice_profiles.list_profiles('demo')), 50)
            with self.assertRaisesRegex(ValueError, 'VOICE_PROFILE_LIMIT'):
                voice_profiles.create('demo', 'f' * 32, 'Thêm', 'vi-VN', b'fake-wav')

    def test_chapter_audio_save_returns_its_own_etag_under_competing_write(self):
        scope, project, chapter, plan = 'demo', '1' * 32, '2' * 32, '3' * 32
        record, first = story_chapter_audio.save(scope, project, chapter, plan, {'leaseUntil': 0})
        key = story_chapter_audio.record_key(scope, project, chapter, plan)
        # A reader must not adopt a different writer's lease/ETag after its own write.
        with mock.patch.object(story_chapter_audio, 'get', side_effect=AssertionError('reread')):
            saved, etag = story_chapter_audio.save(scope, project, chapter, plan, {'leaseUntil': 45}, first)
        self.s3.seed('jobs', key, json.dumps({'leaseUntil': 99}).encode())
        self.assertEqual(saved['leaseUntil'], 45)
        with self.assertRaises(StoryError):
            story_chapter_audio.save(scope, project, chapter, plan, {**saved, 'leaseUntil': 0}, etag)
