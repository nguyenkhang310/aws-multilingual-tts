import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'backend/m3-trung-duc/common/python'), str(Path(__file__).parent)]
from fake_s3 import FakeS3  # noqa: E402
from tts_common import aws, config, story_slots  # noqa: E402


class SlotTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (mock.patch.object(aws, 's3', return_value=self.s3),
                        mock.patch.object(config, 'JOBS_BUCKET', 'jobs')):
            patcher.start(); self.addCleanup(patcher.stop)
        self.pid = 'a' * 32

    def test_project_cap_applies_across_chapters(self):
        first = story_slots.acquire('demo', self.pid, 'b' * 32, 'c' * 32, 0, 1, lambda _: False)
        self.assertIsNotNone(first)
        self.assertIsNone(story_slots.acquire('demo', self.pid, 'd' * 32, 'e' * 32, 0, 1, lambda _: False))
        story_slots.release('demo', self.pid, first)
        self.assertIsNotNone(story_slots.acquire('demo', self.pid, 'd' * 32, 'e' * 32, 0, 1, lambda _: False))

    def test_two_concurrent_claims_one_slot(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            tokens = list(pool.map(lambda index: story_slots.acquire('demo', self.pid,
                f'{index + 1:032x}', f'{index + 3:032x}', 0, 1, lambda _: False), range(2)))
        self.assertEqual(sum(token is not None for token in tokens), 1)


if __name__ == '__main__':
    unittest.main()
