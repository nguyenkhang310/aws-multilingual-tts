"""Lambda tts-submit nhận yêu cầu tạo giọng đọc.

Router M1 gọi hàm này cho POST /synthesize và POST /text/correct. /synthesize kiểm
tra đầu vào theo registry, tạo job PENDING rồi gửi Lambda Event chỉ gồm mã cho
worker M2, không gửi văn bản. /text/correct gọi Gemini khi được cấu hình và
trả skipped nguyên bản khi không khả dụng. Module sở hữu: M5.
"""

import json
import os
import re
import time
import base64
import io
import wave

import correction
import azure_preview
import translation
import idempotency
import document
import audiobooks
import story_events

from tts_common import aws, config, db
from tts_common.errors import error_response, json_response, log_json
from tts_common.utils import get_user_id
from tts_common.voices import load_registry
from tts_common.expression import validate_style, validate_intensity
from tts_common import voice_profiles


AUTO_LANGS = {None, "", "auto"}
STORY_ID = re.compile(r"^[a-f0-9]{32}$")


class InvalidRequest(Exception):
    """Đầu vào sai; mang sẵn phản hồi lỗi cho client."""

    def __init__(self, status, code, message):
        super().__init__(code)
        self.response = error_response(status, code, message)


def _parse_body(event):
    """Đọc body JSON; không phải object thì báo lỗi đầu vào."""
    try:
        body = json.loads(event.get("body") or "")
    except (TypeError, ValueError):
        body = None
    if not isinstance(body, dict):
        raise InvalidRequest(400, "INVALID_INPUT", "Định dạng yêu cầu không hợp lệ.")
    return body


def _clean_text(body):
    """Kiểm tra văn bản; số ký tự giới hạn theo MAX_CHARS để giữ credit."""
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise InvalidRequest(400, "INVALID_INPUT", "Vui lòng nhập nội dung cần đọc.")
    if len(text) > config.MAX_CHARS:
        raise InvalidRequest(400, "TEXT_TOO_LONG", f"Nội dung tối đa {config.MAX_CHARS} ký tự.")
    return text


def _find_entry(lang, provider=None):
    """Tìm ngôn ngữ trong registry đã kiểm chứng."""
    if lang is None or (isinstance(lang, str) and lang in AUTO_LANGS):
        raise InvalidRequest(400, "LANG_REQUIRED", "Vui lòng chọn ngôn ngữ trước khi chuyển giọng.")
    try:
        registry = load_registry(provider=provider) if provider else load_registry()
    except (OSError, ValueError) as error:
        if str(error) == "GEMINI_TTS_NOT_CONFIGURED":
            raise InvalidRequest(503, "GEMINI_TTS_NOT_CONFIGURED", "Chưa bật Gemini TTS ở máy chủ.") from None
        raise InvalidRequest(503, "VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.") from None
    entry = registry.get(lang) if isinstance(lang, str) and not lang.startswith("_") else None
    if not entry or not entry.get("voices"):
        raise InvalidRequest(400, "LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    return entry


def _pick_voice(entry, voice):
    """Dùng giọng được chọn; không chọn thì lấy giọng đầu trong registry."""
    if voice is None:
        return entry["voices"][0]["id"]
    if not any(item.get("id") == voice for item in entry["voices"]):
        raise InvalidRequest(400, "LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    return voice


def _pick_speed(entry, speed):
    """Kiểm tra tốc độ theo dải đã đo; không gửi thì dùng mặc định."""
    if speed is None:
        speed = config.DEFAULT_SPEED
    low, high = entry.get("speedRange", [speed, speed])
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not low <= speed <= high:
        raise InvalidRequest(400, "UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
    return float(speed)


def _dispatch(user_id, job_id):
    """Gửi event chỉ gồm mã cho worker; job xử lý bất đồng bộ."""
    return aws.lambda_client().invoke(
        FunctionName=config.SYNTH_FUNCTION_NAME,
        InvocationType="Event",
        Payload=json.dumps({"userId": user_id, "jobId": job_id}).encode("utf-8"),
    )


def _story_context(event):
    value = event.get("storyContext")
    if value is None:
        return None
    if not isinstance(value, dict) or any(not STORY_ID.fullmatch(str(value.get(key, "")))
        for key in ("projectId", "chapterId", "planId", "segmentId")):
        raise InvalidRequest(400, "INVALID_INPUT", "Tham chiếu audio truyện không hợp lệ.")
    for name, low, high in (("index", 0, 1999), ("attempt", 1, 3), ("planRevision", 1, 1000000)):
        item = value.get(name)
        if type(item) is not int or not low <= item <= high:
            raise InvalidRequest(400, "INVALID_INPUT", "Tham chiếu audio truyện không hợp lệ.")
    return {key: value[key] for key in ("projectId", "chapterId", "planId", "segmentId", "index", "attempt", "planRevision")}


def _synthesize(event):
    """Kiểm tra đầu vào, tạo job rồi gửi cho worker."""
    body = _parse_body(event)
    text = _clean_text(body)
    try:
        request_key = idempotency.key_from_event(event)
    except ValueError:
        raise InvalidRequest(400, "INVALID_INPUT", "Idempotency-Key không hợp lệ.") from None
    user_id = get_user_id(event)
    story_context = _story_context(event)
    if request_key is not None:
        request_fingerprint = idempotency.fingerprint(body, story_context)
        try:
            replay = idempotency.replay_if_present(user_id, request_key, request_fingerprint)
        except Exception as error:
            log_json(module="M5", operation="idempotent_lookup", status="UNCERTAIN", errorCode=type(error).__name__)
            return error_response(503, "SUBMIT_UNCERTAIN", idempotency.UNCERTAIN_MESSAGE)
        if replay is not None:
            return replay
    provider = body.get("provider")
    if provider is not None and (not isinstance(provider, str) or provider not in {"azure", "elevenlabs", "gemini", "vieneu"}):
        raise InvalidRequest(400, "INVALID_PROVIDER", "Nguồn giọng đọc không hợp lệ.")
    voice_profile_id, voice_clone = _clone_request(body, provider)
    if provider == "vieneu":
        if os.environ.get("VOICE_CLONE_ENABLED") != "true":
            raise InvalidRequest(503, "VOICE_CLONE_NOT_CONFIGURED", "Chưa bật VieNeu ở máy chủ.")
        profile = voice_profiles.get(user_id, voice_profile_id)
        if not profile or profile.get("status") != "READY" or profile.get("lang") != body.get("lang"):
            raise InvalidRequest(400, "VOICE_PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ giọng cho ngôn ngữ đã chọn.")
        if body.get("voice") != voice_profile_id:
            raise InvalidRequest(400, "INVALID_INPUT", "Hãy chọn đúng hồ sơ giọng đã đăng ký.")
        entry = {"provider": "vieneu", "engine": profile["engine"], "voices": [{"id": voice_profile_id}],
                 "speedRange": [0.7, 1.2]}
    else:
        if body.get("voiceProfileId") is not None or body.get("voiceClone") is not None:
            raise InvalidRequest(400, "INVALID_INPUT", "Cài đặt giọng clone chỉ dùng với VieNeu.")
        entry = _find_entry(body.get("lang"), provider)
    target = body.get("translateTo")
    if target is not None:
        if provider == "vieneu":
            raise InvalidRequest(400, "UNSUPPORTED_LANGUAGE", "VieNeu hiện chỉ đọc trực tiếp tiếng Việt, không dịch trong job.")
        entry = _find_entry(target, provider)
        if target == body["lang"]:
            raise InvalidRequest(400, "INVALID_INPUT", "Hãy chọn ngôn ngữ đích khác ngôn ngữ gốc.")
        if not os.environ.get("TRANSLATOR_API_PARAMETER_NAME"):
            raise InvalidRequest(503, "TRANSLATION_NOT_CONFIGURED", "Chưa kết nối dịch vụ dịch. Nhờ quản trị viên cấu hình Azure Translator.")
    voice = _pick_voice(entry, body.get("voice"))
    speed = _pick_speed(entry, body.get("speed"))
    style = body.get("style", "neutral")
    if provider == "vieneu" and (style != "neutral" or body.get("styleIntensity", 1.0) != 1.0):
        raise InvalidRequest(400, "UNSUPPORTED_STYLE", "VieNeu chưa hỗ trợ sắc thái hoặc cường độ cảm xúc.")
    try:
        validate_style(entry, voice, style)
        style_intensity = validate_intensity(style, body.get("styleIntensity", 1.0))
    except ValueError as error:
        code = str(error)
        raise InvalidRequest(503 if code == "EMOTION_NOT_CONFIGURED" else 400, code,
                             "Chưa bật nhận diện cảm xúc bằng Gemini ở máy chủ." if code == "EMOTION_NOT_CONFIGURED"
                             else "Cường độ cần từ 0,1 đến 2,0 và cần chọn sắc thái." if code == "UNSUPPORTED_STYLE_INTENSITY"
                             else "Giọng đã chọn chưa hỗ trợ sắc thái này.") from None

    if request_key is not None:
        return idempotency.submit_first(
            user_id, request_key, request_fingerprint, text, body["lang"], voice, speed,
            entry.get("provider"), entry.get("engine"), _dispatch, translate_to=target, style=style, style_intensity=style_intensity,
            story_context=story_context, voice_profile_id=voice_profile_id, voice_clone=voice_clone,
        )

    if not db.reserve_chars(len(text)):
        return error_response(429, "TOO_MANY_REQUESTS", "Hôm nay đã dùng hết hạn mức, vui lòng thử lại vào ngày mai.")
    try:
        job = db.create_job(
            user_id, text, body["lang"], voice, speed, translate_to=target,
            provider=entry.get("provider"), engine=entry.get("engine"), style=style,
            style_intensity=style_intensity, story_context=story_context,
            voice_profile_id=voice_profile_id, voice_clone=voice_clone
        )
    except Exception as error:
        # S3 can persist the job before a connection error hides the response.
        log_json(module="M5", operation="create_job", status="UNCERTAIN", errorCode=type(error).__name__)
        return error_response(503, "SUBMIT_UNCERTAIN", idempotency.UNCERTAIN_MESSAGE)
    job_id = job["jobId"]
    try:
        response = _dispatch(user_id, job_id)
        if not isinstance(response, dict) or response.get("StatusCode") != 202:
            raise RuntimeError("Lambda Event acceptance not confirmed")
    except Exception as error:
        log_json(module="M5", operation="dispatch", status="UNCERTAIN", jobId=job_id, errorCode=type(error).__name__)
        return error_response(503, "SUBMIT_UNCERTAIN", idempotency.UNCERTAIN_MESSAGE)
    log_json(module="M5", operation="submit", status="ACCEPTED", jobId=job_id, charCount=len(text))
    return json_response(202, {"jobId": job_id, "status": "PENDING", "audioUrl": None, "cached": False})


def _correct(event):
    """Suggest typos only; this path never creates a TTS job or consumes TTS quota."""
    body = _parse_body(event)
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise InvalidRequest(400, "INVALID_INPUT", "Vui lòng nhập nội dung cần kiểm tra.")
    if len(text) > config.MAX_CHARS:
        raise InvalidRequest(400, "TEXT_TOO_LONG", "Nội dung kiểm tra quá dài.")
    lang = body.get("lang")
    if lang is not None and not isinstance(lang, str):
        raise InvalidRequest(400, "INVALID_INPUT", "Ngôn ngữ không hợp lệ.")
    payload = {
        "status": "skipped",
        "language": lang if isinstance(lang, str) and lang not in AUTO_LANGS else "und",
        "hasTypos": False,
        "originalText": text,
        "correctedText": text,
        "changes": [],
    }
    cfg = correction.settings()
    if cfg is None or lang not in {"vi-VN", "en-US", "ja-JP"}:
        payload["reason"] = "FEATURE_UNAVAILABLE" if cfg is None else "UNSUPPORTED_LANGUAGE"
        return json_response(200, payload)
    if len(text) > cfg["maxChars"]:
        raise InvalidRequest(400, "TEXT_TOO_LONG", "Nội dung kiểm tra quá dài.")
    started = time.monotonic()
    try:
        corrected, changes = correction.suggest(text, lang, cfg)
    except Exception as error:
        failure = correction.provider_failure(error)
        log_json(module="M5", operation="correct", status="SKIPPED", errorCode=failure["code"],
                 durationMs=int((time.monotonic() - started) * 1000),
                 **({"providerStatus": failure["httpStatus"]} if "httpStatus" in failure else {}))
        payload["reason"] = failure["code"]
        return json_response(200, payload)
    log_json(module="M5", operation="correct", status="CHECKED",
             durationMs=int((time.monotonic() - started) * 1000))
    payload.update(status="checked", hasTypos=bool(changes), correctedText=corrected, changes=changes)
    return json_response(200, payload)


def _translate(event):
    """Translate a bounded passage; the client keeps the source document and reviews the result."""
    body = _parse_body(event)
    try:
        text, source, target, context = translation.validate_input(body)
    except ValueError as error:
        code = str(error)
        message = "Đoạn dịch tối đa 2.000 ký tự." if code == "TEXT_TOO_LONG" else "Nội dung hoặc ngôn ngữ dịch không hợp lệ."
        raise InvalidRequest(400, code, message) from None
    cfg = translation.settings()
    if cfg is None:
        return error_response(503, "FEATURE_NOT_ENABLED", "Tính năng dịch chưa được bật.")
    try:
        translated = translation.translate(text, source, target, context, cfg)
    except Exception as error:
        failure = correction.provider_failure(error)
        log_json(module="M5", operation="translate", status="UNAVAILABLE", errorCode=failure["code"],
                 **({"providerStatus": failure["httpStatus"]} if "httpStatus" in failure else {}))
        return error_response(503, "TRANSLATION_UNAVAILABLE", failure["message"])
    return json_response(200, {"sourceLang": source, "targetLang": target, "translatedText": translated})


def _preview_translation(event):
    """Preview Azure via the existing M2 adapter; no job, quota, or audio is created."""
    body = _parse_body(event)
    text = _clean_text(body)
    source, target = body.get("sourceLang"), body.get("targetLang")
    if not isinstance(source, str) or not isinstance(target, str) or source == target:
        raise InvalidRequest(400, "INVALID_INPUT", "Hãy chọn ngôn ngữ gốc và đích khác nhau.")
    return azure_preview.preview(text, source, target)


def _clone_request(body, provider):
    if provider != "vieneu":
        return None, None
    profile_id, options = body.get("voiceProfileId"), body.get("voiceClone", {})
    if not isinstance(profile_id, str) or not re.fullmatch(r"[a-f0-9]{32}", profile_id) or not isinstance(options, dict):
        raise InvalidRequest(400, "INVALID_INPUT", "Hồ sơ hoặc cài đặt VieNeu không hợp lệ.")
    if set(options) - {"denoise", "useRefCodes", "temperature"}:
        raise InvalidRequest(400, "INVALID_INPUT", "Cài đặt VieNeu không hợp lệ.")
    denoise, ref_codes = options.get("denoise", True), options.get("useRefCodes", True)
    temperature = options.get("temperature", 0.8)
    if type(denoise) is not bool or type(ref_codes) is not bool or type(temperature) not in (int, float) or not 0.4 <= temperature <= 1.0:
        raise InvalidRequest(400, "INVALID_INPUT", "Cài đặt VieNeu nằm ngoài giới hạn.")
    return profile_id, {"denoise": denoise, "useRefCodes": ref_codes, "temperature": float(temperature)}


def _voice_profiles(event):
    if os.environ.get("VOICE_CLONE_ENABLED") != "true":
        return error_response(503, "VOICE_CLONE_NOT_CONFIGURED", "Chưa bật quản lý hồ sơ giọng ở máy chủ.")
    user_id = get_user_id(event)
    method = event.get("httpMethod", "GET").upper()
    if method == "GET":
        return json_response(200, {"items": voice_profiles.list_profiles(user_id)})
    body = _parse_body(event)
    name, encoded = body.get("name"), body.get("audioBase64")
    if body.get("consent") is not True:
        raise InvalidRequest(400, "CONSENT_REQUIRED", "Hãy xác nhận bạn có quyền sử dụng mẫu giọng này.")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 40 or body.get("lang") != "vi-VN":
        raise InvalidRequest(400, "INVALID_INPUT", "Tên hồ sơ tối đa 40 ký tự; hiện chỉ hỗ trợ tiếng Việt.")
    try:
        if not isinstance(encoded, str) or len(encoded) > 2_800_000:
            raise ValueError
        audio = base64.b64decode(encoded, validate=True)
        if len(audio) > 2 * 1024 * 1024:
            raise ValueError
        with wave.open(io.BytesIO(audio), "rb") as sample:
            duration = sample.getnframes() / sample.getframerate()
            if sample.getcomptype() != "NONE" or sample.getsampwidth() != 2 or sample.getnchannels() not in (1, 2) or not 3 <= duration <= 8:
                raise ValueError
    except (ValueError, wave.Error, ZeroDivisionError):
        raise InvalidRequest(400, "INVALID_REFERENCE_AUDIO", "Cần WAV PCM 16-bit, mono hoặc stereo, dài 3–8 giây và tối đa 2 MiB.") from None
    try:
        profile = voice_profiles.create(user_id, voice_profiles.new_id(), name.strip(), "vi-VN", audio)
    except ValueError as error:
        if str(error) == "VOICE_PROFILE_LIMIT":
            raise InvalidRequest(409, "VOICE_PROFILE_LIMIT", "Đã đủ 50 hồ sơ giọng. Hãy xóa hồ sơ cũ trước khi thêm mới.") from None
        raise
    return json_response(201, profile)


def _delete_voice_profile(event):
    if os.environ.get("VOICE_CLONE_ENABLED") != "true":
        return error_response(503, "VOICE_CLONE_NOT_CONFIGURED", "Chưa bật quản lý hồ sơ giọng ở máy chủ.")
    profile_id = (event.get("pathParameters") or {}).get("id")
    if not voice_profiles.delete(get_user_id(event), profile_id):
        return error_response(404, "VOICE_PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ giọng.")
    return json_response(200, {"deleted": True})


def handler(event, context):
    """Chọn thao tác theo path; lỗi không lường trước trả 500 đã làm sạch."""
    if isinstance(event, dict) and (event.get("operation") in {"storyCompletion", "storyWorkerFailure"} or
                                    (isinstance(event.get("requestPayload"), dict) and
                                     isinstance(event.get("requestContext"), dict))):
        return story_events.handle(event)
    try:
        if event.get("path", "").startswith("/audiobooks"):
            return audiobooks.handler(event, context)
        if event.get("path") == "/documents/recognize":
            return _recognize_document(event)
        if event.get("path") == "/voice-profiles":
            return _voice_profiles(event)
        if event.get("path", "").startswith("/voice-profiles/"):
            return _delete_voice_profile(event)
        if event.get("path") == "/text/correct":
            return _correct(event)
        if event.get("path") == "/text/translate":
            return _translate(event)
        if event.get("path") == "/text/preview-translation":
            return _preview_translation(event)
        return _synthesize(event)
    except InvalidRequest as error:
        return error.response
    except Exception as error:
        log_json(module="M5", operation="submit", status="ERROR", errorCode=type(error).__name__)
        return error_response(500, "INTERNAL", "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.")


def _recognize_document(event):
    cfg = document.settings()
    if cfg is None:
        return error_response(503, "OCR_NOT_CONFIGURED", "Chưa bật đọc tài liệu bằng Gemini ở máy chủ. Cần GEMINI_OCR_ENABLED và API key backend.")
    try:
        encoded, mime = document.validate_input(_parse_body(event))
    except ValueError as error:
        code = str(error)
        return error_response(400, code, "Ảnh mỗi trang tối đa 2 MB." if code == "IMAGE_TOO_LARGE" else "Ảnh không hợp lệ. Hỗ trợ JPG, PNG và WebP.")
    try:
        result = document.recognize(encoded, mime, cfg)
    except Exception as error:
        failure = correction.provider_failure(error)
        log_json(module="M5", operation="document_ocr", status="UNAVAILABLE", errorCode=failure["code"])
        message = {"GEMINI_AUTH": "Gemini chưa xác thực được. Kiểm tra key và quyền dự án.",
                   "GEMINI_MODEL": "Model đọc ảnh chưa dùng được với key này. Kiểm tra GEMINI_OCR_MODEL.",
                   "GEMINI_QUOTA": "Gemini hết quota hoặc đang giới hạn lượt gọi.",
                   "GEMINI_BUSY": "Gemini đang bận. Chờ một lát rồi thử lại; bản nháp được giữ nguyên.",
                   "GEMINI_DAILY_LIMIT": "Đã hết lượt đọc tài liệu hôm nay trong bản demo.",
                   "GEMINI_TIMEOUT": "Gemini đọc trang này quá lâu. Thử chụp gần hơn hoặc chia trang thành các phần.",
                   "GEMINI_CONNECTION": "Không kết nối được Gemini. Kiểm tra mạng của máy chủ."}.get(failure["code"], "Chưa đọc được đầy đủ trang tài liệu. Hãy thử lại; bản nháp được giữ nguyên.")
        return error_response(503, failure["code"], message)
    if not result["text"]:
        return error_response(422, "NO_TEXT_FOUND", "Không tìm được chữ trong trang này. Hãy kiểm tra lại ảnh.")
    return json_response(200, result)
