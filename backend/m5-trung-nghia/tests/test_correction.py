"""Offline contract checks for the optional Gemini typo path."""

import io
import json
import os
import unittest
from unittest import mock

from test_submit import FlowTestCase, submit
from typo_cases import CASES

correction = submit.correction


class CorrectionTest(FlowTestCase):
    CFG = {"name": "/tts/dev/gemini", "model": "gemini-test", "timeout": 6,
           "maxChars": 1000, "maxChanges": 12, "dailyCalls": 10}

    def test_disabled_never_reads_key_or_calls_provider(self):
        with mock.patch.dict(os.environ, {"GEMINI_TYPO_ENABLED": "false"}), \
             mock.patch.object(correction, "_read_key") as key:
            status, body = self.post("/text/correct", text="Xin chàoo", lang="vi-VN")
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "skipped", "Xin chàoo"))
        self.assertEqual(body["reason"], "FEATURE_UNAVAILABLE")
        key.assert_not_called()
        self.assertEqual(self.s3.objects, {})

    def test_checked_typo_and_no_job_or_tts_quota(self):
        suggestion = {"correctedText": "Xin chào"}
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value=suggestion):
            status, body = self.post("/text/correct", text="Xin chàoo", lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", True))
        self.assertEqual(body["changes"], [{"from": "chàoo", "to": "chào", "start": 4, "end": 8}])
        self.assertEqual(self.events, [])
        self.assertFalse(any(key.startswith(("jobs/", "usage/")) for _, key in self.s3.objects))
        self.assertTrue(any(key.startswith("typo-usage/") for _, key in self.s3.objects))

    def test_no_typo(self):
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value={"correctedText": "Xin chào"}):
            status, body = self.post("/text/correct", text="Xin chào", lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", False))

    def test_keeps_safe_typos_when_gemini_also_changes_names_and_punctuation(self):
        original = "xin chèo, tui teen là nghia, song ơ sai gon"
        suggestion = {"correctedText": "Xin chào, tôi tên là Nghĩa, sống ở Sài Gòn."}
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value=suggestion) as provider:
            status, body = self.post("/text/correct", text=original, lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", True))
        self.assertEqual(body["correctedText"], "Xin chào, tôi tên là Nghĩa, sống ở Sài Gòn.")
        self.assertEqual([change["from"] for change in body["changes"]], ["xin", "chèo", "tui", "teen", "nghia", "song", "ơ", "sai", "gon"])
        provider.assert_called_once()
        self.assertEqual(self.events, [])

    def test_vietnamese_context_and_short_tone_marks_are_reviewable(self):
        original = "xin chèo, hom nay chún ta se ăn gì"
        suggestion = {"correctedText": "xin chào, hôm nay chúng ta sẽ ăn gì"}
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value=suggestion):
            status, body = self.post("/text/correct", text=original, lang="vi-VN")
        self.assertEqual((status, body["status"], body["hasTypos"]), (200, "checked", True))
        self.assertEqual(body["correctedText"], suggestion["correctedText"])
        self.assertEqual([item["from"] for item in body["changes"]], ["chèo", "hom", "chún", "se"])
        with self.assertRaises(correction.UnsafeSuggestion):
            correction.reviewable_suggestion("a", {"correctedText": "unrelated sentence"}, 5)

    def test_missing_key_provider_failure_and_bad_output_skip_without_leak(self):
        for failed in (ValueError("secret-example"), TimeoutError("secret-example")):
            with self.subTest(failed=type(failed).__name__), \
                 mock.patch.object(correction, "settings", return_value=self.CFG), \
                 mock.patch.object(correction, "_read_key", side_effect=failed), \
                 mock.patch("builtins.print") as printed:
                status, body = self.post("/text/correct", text="PRIVATE-TEXT", lang="vi-VN")
            self.assertEqual((status, body["status"], body["correctedText"]),
                             (200, "skipped", "PRIVATE-TEXT"))
            self.assertNotIn("secret-example", str(printed.call_args_list))
            self.assertNotIn("PRIVATE-TEXT", str(printed.call_args_list))
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", return_value={"unexpected": True}):
            self.assertEqual(self.post("/text/correct", text="Xin chào", lang="vi-VN")[1]["status"], "skipped")
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction, "_provider", side_effect=TimeoutError("secret-example")):
            result = self.post("/text/correct", text="Xin chào", lang="vi-VN")[1]
            self.assertEqual((result["status"], result["reason"]), ("skipped", "GEMINI_TIMEOUT"))

    def test_utf16_emoji_offsets_and_unsafe_edits(self):
        original = "😀 Xin chàoo"
        corrected, edits = correction.reviewable_suggestion(original, {"correctedText": "😀 Xin chào"}, 5)
        self.assertEqual((corrected, edits), ("😀 Xin chào", [
            {"from": "chàoo", "to": "chào", "start": 7, "end": 11}]))
        for proposed in ("Xin chào mọi người", "Bản dịch khác hẳn"):
            with self.subTest(proposed=proposed), self.assertRaises(correction.UnsafeSuggestion):
                correction.reviewable_suggestion(original, {"correctedText": proposed}, 5)
        protected = "Xem https://example.com/chàoo và email a@abc.com"
        with self.assertRaises(correction.UnsafeSuggestion):
            correction.reviewable_suggestion(protected, {"correctedText": protected.replace("chàoo", "chào")}, 5)
        partial, edits = correction.reviewable_suggestion(original, {"correctedText": "😀 Xin chào!"}, 5)
        self.assertEqual(partial, corrected + "!")
        self.assertEqual(edits[-1]["to"], "chào!")

    def test_daily_call_cap_is_separate_from_tts_usage(self):
        self.assertTrue(correction._reserve_call(1))
        self.assertFalse(correction._reserve_call(1))
        self.assertFalse(any(key.startswith("usage/") for _, key in self.s3.objects))

    def test_review_corpus_40_vietnamese_cases(self):
        self.assertGreaterEqual(len(CASES), 40)
        for category, original, candidate in CASES:
            with self.subTest(category=category, original=original):
                corrected, changes = correction.reviewable_suggestion(
                    original, {"correctedText": candidate}, 20)
                self.assertEqual(corrected, candidate)
                self.assertEqual(bool(changes), candidate != original)
                for change in changes:
                    self.assertEqual(corrected.encode("utf-16-le")[2*change["start"]:2*change["end"]]
                                     .decode("utf-16-le"), change["to"])

    def test_wire_contract_uses_structured_output_and_stateless_interactions(self):
        reply = {"status": "completed", "steps": [{"type": "model_output", "content": [
            {"type": "text", "text": json.dumps({"correctedText": "Xin chào"})}]}]}
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(json.dumps(reply).encode())
        with mock.patch.object(correction._opener, "open", return_value=response) as opened:
            actual = correction._provider("Xin chào", "vi-VN", {**self.CFG, "model": "gemini-3.8-flash"}, "fake-key")
        self.assertEqual(actual["correctedText"], "Xin chào")
        request = opened.call_args.args[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, correction.API_URL)
        self.assertFalse(body["store"])
        self.assertEqual(body["model"], "gemini-3.8-flash")
        self.assertEqual(body["generation_config"]["thinking_level"], "low")
        self.assertNotIn("temperature", body["generation_config"])
        self.assertEqual(body["response_format"]["mime_type"], "application/json")
        self.assertIn("missing/wrong tone marks", body["input"])
        self.assertEqual(opened.call_args.kwargs["timeout"], 6)

    def test_malformed_gemini_json_is_skipped(self):
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(b'{invalid')
        with mock.patch.object(correction, "settings", return_value=self.CFG), \
             mock.patch.object(correction, "_read_key", return_value="fake-key"), \
             mock.patch.object(correction._opener, "open", return_value=response):
            status, body = self.post("/text/correct", text="Xin chào", lang="vi-VN")
        self.assertEqual((status, body["status"], body["correctedText"]), (200, "skipped", "Xin chào"))


if __name__ == "__main__":
    unittest.main()
