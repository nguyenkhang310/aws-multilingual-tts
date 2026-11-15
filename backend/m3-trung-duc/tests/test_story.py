import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m3-trung-duc/common/python"), str(Path(__file__).parent)]
from fake_s3 import FakeS3  # noqa: E402
from tts_common import aws, config, story_chapters as chapters, story_content as content, story_projects as projects  # noqa: E402
from tts_common.story_store import StoryError  # noqa: E402


class StoryTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (mock.patch.object(aws, "s3", return_value=self.s3),
                        mock.patch.object(config, "JOBS_BUCKET", "jobs")):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.project = projects.create("demo", {"title": "Truyện", "sourceLang": "vi-VN", "targetLang": "en-US"})
        self.chapter = chapters.create("demo", self.project["projectId"],
                                       {"title": "Chương 1", "chapterNumber": 1}, "chapter-request")
        self.pid, self.cid = self.project["projectId"], self.chapter["chapterId"]

    def save(self, text, upload="a" * 32, revision=1):
        for index, start in enumerate(range(0, len(text), 32000)):
            content.upload("demo", self.pid, self.cid, upload, index, text[start:start + 32000])
        return content.commit("demo", self.pid, self.cid, upload, (len(text) + 31999) // 32000, revision)

    def test_long_unicode_round_trip_and_pages(self):
        text = ("Xin chào. 日本語 한글 中文 😊\n\n" * 20000)[:500000]
        saved = self.save(text)
        self.assertGreater(saved["textLength"], 200000)
        pieces, cursor = [], None
        while True:
            page = content.source_page("demo", self.pid, self.cid, cursor)
            pieces.append(page["text"])
            cursor = page["nextCursor"]
            if cursor is None:
                break
        self.assertEqual("".join(pieces), text)
        segments, cursor = [], None
        while True:
            page = content.segments_page("demo", self.pid, self.cid, 17, cursor)
            segments.extend(page["items"])
            cursor = page["nextCursor"]
            if cursor is None:
                break
        self.assertEqual("".join(item["sourceText"] for item in segments), text)
        self.assertEqual([item["order"] for item in segments], list(range(len(segments))))

    def test_cas_replay_scope_and_soft_delete(self):
        self.save("Nội dung cũ.")
        with self.assertRaises(StoryError):
            projects.update("demo", self.pid, {"version": True, "title": "Sai kiểu"})
        self.assertEqual(chapters.create("demo", self.pid, {"title": "Chương 1", "chapterNumber": 1},
                                         "chapter-request")["chapterId"], self.cid)
        chapters.update("demo", self.pid, self.cid, {"revision": 2, "title": "Tên mới"})
        self.assertEqual(chapters.create("demo", self.pid, {"title": "Chương 1", "chapterNumber": 1},
                                         "chapter-request")["chapterId"], self.cid)
        with self.assertRaises(StoryError):
            chapters.update("demo", self.pid, self.cid, {"revision": 2, "title": "Mới"})
        with self.assertRaises(StoryError):
            chapters.get("other", self.pid, self.cid)
        other = chapters.create("demo", self.pid, {"title": "Chương 2", "chapterNumber": 2})
        chapters.delete("demo", self.pid, self.cid, 3)
        self.assertEqual([item["chapterId"] for item in chapters.list_all("demo", self.pid)], [other["chapterId"]])
        self.assertEqual(projects.details("demo", self.pid)["chapterCount"], 1)

    def test_incomplete_write_never_publishes_manifest_and_retry(self):
        text = "Một đoạn. " * 1200
        upload = "b" * 32
        content.upload("demo", self.pid, self.cid, upload, 0, text)
        original = content.write
        def fail_page(key, value, **kwargs):
            if "/segments/" in key:
                raise RuntimeError("S3 unavailable")
            return original(key, value, **kwargs)
        with mock.patch.object(content, "write", side_effect=fail_page):
            with self.assertRaises(RuntimeError):
                content.commit("demo", self.pid, self.cid, upload, 1, 1)
        self.assertIsNone(chapters.get("demo", self.pid, self.cid)[0]["contentRevision"])
        self.assertEqual(content.commit("demo", self.pid, self.cid, upload, 1, 1)["status"], "READY")
        self.assertEqual(content.commit("demo", self.pid, self.cid, upload, 1, 1)["revision"], 2)

    def test_concurrent_commits_one_wins(self):
        uploads = [("c" * 32, "Bản một."), ("d" * 32, "Bản hai.")]
        for upload, text in uploads:
            content.upload("demo", self.pid, self.cid, upload, 0, text)
        barrier, original = threading.Barrier(2), content.write
        def synchronized(key, value, **kwargs):
            if key.endswith("/metadata.json"):
                barrier.wait(timeout=3)
            return original(key, value, **kwargs)
        with mock.patch.object(content, "write", side_effect=synchronized), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(content.commit, "demo", self.pid, self.cid, upload, 1, 1)
                       for upload, _ in uploads]
            outcomes = []
            for future in futures:
                try:
                    outcomes.append(future.result())
                except StoryError as error:
                    outcomes.append(error.code)
        self.assertEqual(sum(isinstance(item, dict) for item in outcomes), 1)
        self.assertIn("REVISION_CONFLICT", outcomes)
        self.assertIn(content.source_page("demo", self.pid, self.cid)["text"], [text for _, text in uploads])

    def test_backup_boundaries_are_restored_exactly(self):
        upload = "e" * 32
        content.upload("demo", self.pid, self.cid, upload, 0, "Xin 😊 chào.")
        saved = content.commit("demo", self.pid, self.cid, upload, 1, 1, [6, 6])
        segments = content.segments_page("demo", self.pid, self.cid)["items"]
        self.assertEqual([item["sourceText"] for item in segments], ["Xin 😊", " chào."])
        self.assertEqual(saved["segmentCount"], 2)
        with self.assertRaises(StoryError):
            content.commit("demo", self.pid, self.cid, upload, 1, 1, [12])

    def test_story_segment_keeps_sentence_when_worker_chunks_are_smaller(self):
        text = ("Một câu ngắn. " * 750) + "Nó lại đổ xuống vũng nước trong veo."
        saved = self.save(text)
        pieces = content.segments_page("demo", self.pid, self.cid)["items"]
        self.assertEqual("".join(piece["sourceText"] for piece in pieces), text)
        self.assertTrue(all(piece["textLength"] <= config.MAX_CHARS for piece in pieces))
        self.assertTrue(pieces[0]["sourceText"].rstrip().endswith("."))
        self.assertGreater(saved["segmentCount"], 1)


if __name__ == "__main__":
    unittest.main()

