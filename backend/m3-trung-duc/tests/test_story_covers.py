import struct
import sys
import unittest
import zlib
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "backend/m3-trung-duc/common/python"), str(Path(__file__).parent)]
from fake_s3 import FakeS3  # noqa: E402
from tts_common import aws, config, story_covers, story_projects  # noqa: E402
from tts_common.story_store import StoryError  # noqa: E402


def png(width=2, height=2):
    def chunk(name, payload):
        body = name + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    pixels = b"".join(b"\0" + b"\xff\0\0\xff" * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


class StoryCoverTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        for patcher in (mock.patch.object(aws, "s3", return_value=self.s3),
                        mock.patch.object(config, "JOBS_BUCKET", "jobs")):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.project = story_projects.create("demo", {"title": "Truyện", "sourceLang": "vi-VN", "targetLang": "vi-VN"})
        self.pid = self.project["projectId"]

    def begin(self, content_type="image/png", size=None, version=None, scope="demo"):
        return story_covers.begin(scope, self.pid, content_type, size or len(png()),
                                  self.project["version"] if version is None else version)

    def test_private_upload_commit_reload_and_expiring_url(self):
        ticket = self.begin()
        request = self.s3.posts[0]
        self.assertTrue(request["Key"].startswith("audiobook-cover-staging/demo/"))
        self.assertIn(["content-length-range", 1, story_covers.MAX_BYTES + story_covers.POST_OVERHEAD], request["Conditions"])
        self.s3.seed("jobs", request["Key"], png(), "image/png")
        saved = story_covers.commit("demo", self.pid, ticket["uploadId"], ticket["version"])
        self.assertEqual(saved["cover"]["contentType"], "image/png")
        self.assertEqual((saved["cover"]["width"], saved["cover"]["height"]), (2, 2))
        self.assertTrue(self.s3.signed_urls[-1][1]["Key"].startswith(f"audiobooks/demo/{self.pid}/covers/"))
        self.assertEqual(saved["version"], 2)
        self.assertNotIn("coverKey", saved)
        self.assertNotIn(request["Key"], self.s3.objects)
        reloaded = story_projects.details("demo", self.pid)
        self.assertEqual(reloaded["cover"]["url"], saved["cover"]["url"])
        refreshed = story_covers.public_view("demo", self.pid, story_projects.get("demo", self.pid)[0])
        self.assertEqual(refreshed["expiresAt"], saved["cover"]["expiresAt"])

    def test_replace_then_remove_keeps_project_metadata(self):
        first = self.begin()
        key = self.s3.posts[-1]["Key"]
        self.s3.seed("jobs", key, png(), "image/png")
        saved = story_covers.commit("demo", self.pid, first["uploadId"], first["version"])
        old_cover = saved["cover"]["url"].split("?")[0].replace("https://signed.test/", "")
        second = story_covers.begin("demo", self.pid, "image/png", len(png()), saved["version"])
        stage = self.s3.posts[-1]["Key"]
        self.s3.seed("jobs", stage, png(3, 2), "image/png")
        saved = story_covers.commit("demo", self.pid, second["uploadId"], second["version"])
        self.assertNotIn(("jobs", old_cover), self.s3.objects)
        cleared = story_covers.clear("demo", self.pid, saved["version"])
        self.assertIsNone(cleared["cover"])
        self.assertEqual(cleared["version"], saved["version"] + 1)

    def test_invalid_type_size_magic_dimensions_and_scope_are_rejected(self):
        with self.assertRaises(StoryError):
            self.begin(content_type="image/svg+xml")
        with self.assertRaises(StoryError):
            self.begin(size=story_covers.MAX_BYTES + 1)
        with self.assertRaises(StoryError) as error:
            story_covers.begin("other", self.pid, "image/png", len(png()), self.project["version"])
        self.assertEqual(error.exception.status, 403)
        ticket = self.begin()
        stage = self.s3.posts[-1]["Key"]
        self.s3.seed("jobs", stage, b"<svg onload='alert(1)'>", "image/png")
        with self.assertRaises(StoryError):
            story_covers.commit("demo", self.pid, ticket["uploadId"], ticket["version"])
        ticket = self.begin()
        stage = self.s3.posts[-1]["Key"]
        self.s3.seed("jobs", stage, png(5000, 5000), "image/png")
        with self.assertRaises(StoryError) as error:
            story_covers.commit("demo", self.pid, ticket["uploadId"], ticket["version"])
        self.assertEqual(error.exception.code, "COVER_DIMENSIONS_TOO_LARGE")

    def test_stale_version_missing_upload_and_s3_failure(self):
        with self.assertRaises(StoryError) as error:
            self.begin(version=99)
        self.assertEqual(error.exception.code, "REVISION_CONFLICT")
        ticket = self.begin()
        with self.assertRaises(StoryError) as error:
            story_covers.commit("demo", self.pid, ticket["uploadId"], ticket["version"])
        self.assertEqual(error.exception.status, 404)
        ticket = self.begin()
        self.s3.seed("jobs", self.s3.posts[-1]["Key"], png(), "image/png")
        self.s3.before_put = lambda: (_ for _ in ()).throw(RuntimeError("S3 unavailable"))
        with self.assertRaises(RuntimeError):
            story_covers.commit("demo", self.pid, ticket["uploadId"], ticket["version"])
        self.assertIsNone(story_projects.details("demo", self.pid)["cover"])


if __name__ == "__main__":
    unittest.main()
