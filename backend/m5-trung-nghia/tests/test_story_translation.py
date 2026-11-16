"""End-to-end local Story-02 storage, glossary, Azure bridge and approved audio."""

import io
import json
import os
import unittest
from unittest import mock

from story_batch_case import StoryBatchCase
from tts_common import aws, db, story_chapters, story_content, story_projects, story_translation_store as store
from story_translation_text import split, protect, restore, MAX_BYTES, MAX_UNITS


class Translator:
    def __init__(self):
        self.calls = []

    def invoke(self, **kwargs):
        event = json.loads(kwargs["Payload"])
        self.calls.append(event)
        result = {"sourceLang": event["sourceLang"], "targetLang": event["targetLang"],
                  "translatedText": event["text"].replace("你好", "xin chào").replace("说", "nói").replace("。", ".")}
        return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(result).encode())}


class StoryTranslationTest(StoryBatchCase):
    def setUp(self):
        super().setUp()
        self.translator = Translator()
        self.patch = mock.patch.object(aws, "lambda_client", return_value=self.translator)
        self.patch.start(); self.addCleanup(self.patch.stop)
        self.env = mock.patch.dict(os.environ, {"TRANSLATOR_API_PARAMETER_NAME": "/test/translator",
                                             "STORY_TRANSLATION_DAILY_CHARS": "100000"})
        self.env.start(); self.addCleanup(self.env.stop)
        project = story_projects.create("demo", {"title": "Tiểu thuyết", "sourceLang": "cmn-CN", "targetLang": "vi-VN"})
        self.pid = project["projectId"]
        chapter = story_chapters.create("demo", self.pid, {"chapterNumber": 1, "title": "Chương 1"})
        self.cid = chapter["chapterId"]
        self.chapter_path = f"/audiobooks/{self.pid}/chapters/{self.cid}"
        source = "林风说你好。" * 300
        story_content.upload("demo", self.pid, self.cid, "c" * 32, 0, source)
        self.chapter = story_content.commit("demo", self.pid, self.cid, "c" * 32, 1, 1)

    def create(self):
        status, plan = self.call("POST", "/translation-plans", {"chapterRevision": self.chapter["revision"]})
        self.assertEqual(status, 201, plan)
        return plan

    def test_approval_keeps_translated_parts_from_running_words_together(self):
        plan = self.create()
        progress = self.call("POST", f"/translation-plans/{plan['planId']}/start", {})[1]
        while progress["status"] == "RUNNING":
            progress = self.call("POST", f"/translation-plans/{plan['planId']}/tick", {})[1]
        texts = [f"Phần thứ {index + 1}." for index in range(plan["total"])]
        for index, text in enumerate(texts):
            path = f"/translation-plans/{plan['planId']}/chunks/{index}"
            chunk = self.call("GET", path)[1]
            self.assertEqual(self.call("PUT", path, {"translatedText": text, "version": chunk["version"]})[0], 200)
        approved = self.call("POST", f"/translation-plans/{plan['planId']}/approve", {"version": 0})[1]
        content = "".join(store.approved_segment("demo", self.pid, self.cid, approved["revision"], index)["text"]
                          for index in range(approved["segmentCount"]))
        self.assertEqual(content, "\n\n".join(texts))

    def test_glossary_pause_resume_approve_and_audio(self):
        path = f"/audiobooks/{self.pid}/glossary"
        glossary = store.save_glossary("demo", self.pid, 0, [{"source": "林风", "target": "Lâm Phong"}])
        self.assertEqual(glossary["revision"], 1)
        plan = self.create()
        self.assertEqual(self.create()["planId"], plan["planId"])
        self.assertGreater(plan["total"], 1)
        self.assertEqual(self.call("POST", f"/translation-plans/{plan['planId']}/pause", {})[0], 409)
        first = self.call("POST", f"/translation-plans/{plan['planId']}/start", {})[1]
        self.assertEqual(first["counts"]["DONE"], 1)
        self.assertEqual(len(self.translator.calls), 1)
        self.call("POST", f"/translation-plans/{plan['planId']}/pause", {})
        self.call("POST", f"/translation-plans/{plan['planId']}/tick", {})
        self.assertEqual(len(self.translator.calls), 1)
        self.call("POST", f"/translation-plans/{plan['planId']}/resume", {})
        while True:
            progress = self.call("POST", f"/translation-plans/{plan['planId']}/tick", {})[1]
            if progress["counts"]["DONE"] == plan["total"]:
                break
        self.assertEqual(len(self.translator.calls), plan["total"])
        first_chunk = self.call("GET", f"/translation-plans/{plan['planId']}/chunks/0")[1]
        self.assertIn("Lâm Phong", first_chunk["translatedText"])
        approved = self.call("POST", f"/translation-plans/{plan['planId']}/approve", {"version": 0})[1]
        self.assertEqual(approved["targetLang"], "vi-VN")
        self.assertEqual(self.call("GET", "/source")[1]["text"].startswith("林风"), True)
        status, audio = self.call("POST", "/audio-plans", {"chapterRevision": self.chapter["revision"],
            "textSource": "approved_translation", "provider": "azure", "voice": "voice-fixture",
            "speed": 0.9, "style": "neutral", "styleIntensity": 1})
        self.assertEqual(status, 201, plan)
        self.assertEqual(audio["translationRevision"], approved["revision"])
        self.assertIsNone(audio["translateTo"])
        self.assertEqual(audio["language"], "vi-VN")
        with mock.patch.object(aws, "lambda_client", return_value=self.lambdas):
            self.call("POST", f"/audio-plans/{audio['planId']}/start", {})
        job = db.get_job("demo", self.lambdas.events[0]["jobId"])
        self.assertIn("Lâm Phong", job["text"])
        self.assertNotIn("林风", job["text"])
        self.assertIsNone(job["translateTo"])

    def test_no_approval_before_finished_and_no_cross_scope(self):
        plan = self.create()
        self.assertEqual(self.call("POST", f"/translation-plans/{plan['planId']}/approve", {"version": 0})[0], 409)
        self.assertEqual(self.call("GET", f"/translation-plans/{plan['planId']}/progress", scope="other")[0], 403)
        self.call("POST", f"/translation-plans/{plan['planId']}/start", {})
        self.assertEqual(self.call("POST", f"/translation-plans/{plan['planId']}/chunks/0/retry", {})[0], 409)

    def test_large_unicode_chapter_is_lossless_and_bounded(self):
        source = ("林风说你好。😀\n" * 30000)
        chunks = split(source)
        self.assertGreater(len(source), 200000)
        self.assertEqual("".join(chunks), source)
        self.assertTrue(all(len(item.encode()) <= MAX_BYTES and len(item.encode("utf-16-le")) // 2 <= MAX_UNITS
                            for item in chunks))

    def test_restored_draft_is_idle_reviewable_and_approves_without_translating(self):
        import story_translation_text
        source_text = self.call("GET", "/source")[1]["text"]
        source_chunks = story_translation_text.split(source_text)
        store.restore_glossary("demo", self.pid, 8, [{"source": "你好", "target": "xin chào"}])
        draft_id = "d" * 32
        draft_path = f"/translation-drafts/import/{draft_id}"
        translated = [f"Đã dịch phần {index}." for index in range(len(source_chunks))]
        for index, text in enumerate(translated):
            status, _ = self.call("PUT", f"{draft_path}/{index}",
                                  {"sourceText": source_chunks[index], "translated": True,
                                   "translatedText": text, "reviewState": "DONE"})
            self.assertEqual(status, 200)
        reference = {"sourceRevision": 7, "contentRevision": "e" * 32, "glossaryRevision": 3}
        before = len(self.translator.calls)
        with mock.patch.object(store, "reserve_translation_chars") as reserve:
            status, plan = self.call("POST", f"{draft_path}/commit", {"count": len(source_chunks),
                "targetLang": "vi-VN", "sourceReference": reference})
            reserve.assert_not_called()
        self.assertEqual(status, 201, plan)
        self.assertEqual(len(self.translator.calls), before)
        self.assertEqual(plan["restoredFrom"], reference)
        self.assertEqual(plan["glossaryRevision"], 8)
        self.assertIsNone(store.get_run("demo", self.pid, self.cid, draft_id))
        progress = self.call("GET", f"/translation-plans/{draft_id}/progress")[1]
        self.assertEqual(progress["status"], "DRAFT")
        self.assertEqual(progress["counts"]["EDITED"], len(source_chunks))
        first = store.get_chunk("demo", self.pid, self.cid, draft_id, 0)[0]
        store.edit_chunk("demo", self.pid, self.cid, draft_id, 0, "Bản người dùng đã sửa", first["version"])
        self.assertEqual(self.call("POST", f"{draft_path}/commit", {"count": len(source_chunks),
            "targetLang": "vi-VN", "sourceReference": reference})[1]["planId"], draft_id)
        self.assertEqual(store.get_chunk("demo", self.pid, self.cid, draft_id, 0)[0]["translatedText"],
                         "Bản người dùng đã sửa")
        approved = self.call("POST", f"/translation-plans/{draft_id}/approve", {"version": 0})[1]
        self.assertEqual(approved["targetLang"], "vi-VN")
        audio_status, audio = self.call("POST", "/audio-plans", {"chapterRevision": self.chapter["revision"],
            "textSource": "approved_translation", "provider": "azure", "voice": "voice-fixture",
            "speed": 0.9, "style": "neutral", "styleIntensity": 1})
        self.assertEqual(audio_status, 201)
        self.assertEqual(audio["translationRevision"], approved["revision"])
        self.assertEqual(len(self.translator.calls), before)

    def test_restored_draft_rejects_incomplete_upload_without_azure(self):
        draft_id = "f" * 32
        path = f"/translation-drafts/import/{draft_id}"
        self.call("PUT", f"{path}/0", {"sourceText": "Xin chào.", "translated": True,
                                        "translatedText": "Bản dịch", "reviewState": "DONE"})
        status, result = self.call("POST", f"{path}/commit", {"count": 2, "targetLang": "en-US",
            "sourceReference": {"sourceRevision": 1, "contentRevision": "a" * 32, "glossaryRevision": 0}})
        self.assertEqual(status, 409)
        self.assertEqual(result["error"]["code"], "IMPORT_INCOMPLETE")
        self.assertEqual(self.translator.calls, [])

    def test_restored_uncertain_chunk_never_becomes_queued_for_automatic_retry(self):
        import story_translation_text
        path = f"/translation-drafts/import/{'9' * 32}"
        source = self.call("GET", "/source")[1]["text"]
        chunks = story_translation_text.split(source)
        for index, chunk in enumerate(chunks):
            self.call("PUT", f"{path}/{index}", {"sourceText": chunk, "translated": False,
                "translatedText": None, "reviewState": "UNCERTAIN" if index == 0 else "QUEUED"})
        status, plan = self.call("POST", path + "/commit", {"count": len(chunks), "targetLang": "vi-VN",
            "sourceReference": {"sourceRevision": 1, "contentRevision": "b" * 32, "glossaryRevision": 0}})
        self.assertEqual(status, 201, plan)
        chunk = store.get_chunk("demo", self.pid, self.cid, plan["planId"], 0)[0]
        self.assertEqual(chunk["status"], "UNCERTAIN")
        self.assertEqual(self.translator.calls, [])

    def test_glossary_overlap_and_latin_substring(self):
        entries = [{"source": "林", "target": "Lâm"}, {"source": "林风", "target": "Lâm Phong"},
                   {"source": "Ann", "target": "An"}]
        text, mapping = protect("林风 gặp Ann và Joanne", entries)
        self.assertEqual(restore(text, mapping), "Lâm Phong gặp An và Joanne")
        with self.assertRaises(Exception):
            restore("Azure đã đổi placeholder", mapping)

    def test_uncertain_glossary_result_can_be_replaced_by_reviewed_text(self):
        store.save_glossary("demo", self.pid, 0, [{"source": "林风", "target": "Lâm Phong"}])
        plan = self.create()
        with mock.patch.object(self.translator, "invoke", return_value={"StatusCode": 200,
                "Payload": io.BytesIO(json.dumps({"sourceLang": "cmn-CN", "targetLang": "vi-VN",
                    "translatedText": "Azure bỏ mất mã thuật ngữ"}).encode())}):
            result = self.call("POST", f"/translation-plans/{plan['planId']}/start", {})[1]
        self.assertEqual(result["counts"]["UNCERTAIN"], 1)
        path = f"/translation-plans/{plan['planId']}/chunks/0"
        item = self.call("GET", path)[1]
        status, edited = self.call("PUT", path, {"version": item["version"],
            "translatedText": "Lâm Phong nói xin chào."})
        self.assertEqual(status, 200)
        self.assertEqual(edited["status"], "EDITED")
        self.assertEqual(self.call("POST", f"/translation-plans/{plan['planId']}/resume", {})[0], 202)

    def test_retry_while_paused_stays_paused(self):
        plan = self.create()
        self.call("POST", f"/translation-plans/{plan['planId']}/start", {})
        self.call("POST", f"/translation-plans/{plan['planId']}/pause", {})
        store.update_chunk("demo", self.pid, self.cid, plan["planId"], 1,
                           {"status": "FAILED", "attempts": 1})
        status, result = self.call("POST", f"/translation-plans/{plan['planId']}/chunks/1/retry", {})
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "PAUSED")
        self.assertEqual(store.get_run("demo", self.pid, self.cid, plan["planId"])[0]["desiredState"], "PAUSED")

    def test_expired_run_lease_marks_inflight_provider_call_uncertain(self):
        import story_translation_run as runs
        plan = self.create()
        store.start_run("demo", self.pid, self.cid, plan["planId"])
        store.update_chunk("demo", self.pid, self.cid, plan["planId"], 0,
                           {"status": "RUNNING", "attempts": 1})
        store.update_run("demo", self.pid, self.cid, plan["planId"], {"leaseUntil": 0})
        with mock.patch.object(runs.time, "time", return_value=1000):
            result = runs.tick("demo", self.pid, self.cid, plan["planId"])
        chunk = store.get_chunk("demo", self.pid, self.cid, plan["planId"], 0)[0]
        self.assertEqual(chunk["status"], "UNCERTAIN")
        self.assertEqual(result["status"], "NEEDS_ATTENTION")
        self.assertEqual(len(self.translator.calls), 0)

    def test_active_translation_lease_allows_only_one_tick_owner(self):
        import story_translation_run as runs
        plan = self.create()
        store.start_run("demo", self.pid, self.cid, plan["planId"])
        first = runs._claim("demo", self.pid, self.cid, plan["planId"])
        second = runs._claim("demo", self.pid, self.cid, plan["planId"])
        self.assertIsNotNone(first)
        self.assertIsNone(second)

    def test_late_provider_response_cannot_overwrite_reconciled_chunk(self):
        import story_translation_run as runs
        plan = self.create()

        def late_result(text, _source, _target):
            running = store.get_chunk("demo", self.pid, self.cid, plan["planId"], 0)[0]
            store.update_chunk("demo", self.pid, self.cid, plan["planId"], 0,
                               {"status": "UNCERTAIN", "errorCode": "TRANSLATION_UNCERTAIN"},
                               running["version"])
            return "late translation"

        with mock.patch.object(runs, "_worker", side_effect=late_result):
            with self.assertRaises(Exception):
                runs.control("demo", self.pid, self.cid, plan["planId"], "start")
        chunk = store.get_chunk("demo", self.pid, self.cid, plan["planId"], 0)[0]
        self.assertEqual(chunk["status"], "UNCERTAIN")
        self.assertIsNone(chunk["translatedText"])


if __name__ == "__main__":
    unittest.main()
