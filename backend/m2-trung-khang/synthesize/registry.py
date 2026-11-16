"""Tra cứu registry giọng cho worker."""

import os

from providers.base import PermanentProviderError
from tts_common import voice_profiles
from tts_common.voices import load_registry


def find_entry(lang, voice: str, speed: float, provider=None, *, user_id=None) -> dict:
    """Kiểm tra ngôn ngữ, giọng, tốc độ trước khi tốn credit gọi provider."""
    if provider == "vieneu":
        if os.environ.get("VOICE_CLONE_ENABLED") != "true":
            raise PermanentProviderError("VOICE_CLONE_NOT_CONFIGURED", "Chưa bật VieNeu ở máy chủ.")
        profile = voice_profiles.get(user_id, voice)
        if not profile or profile.get("status") != "READY" or profile.get("lang") != lang:
            raise PermanentProviderError("VOICE_PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ giọng đã chọn.")
        if not 0.7 <= speed <= 1.2:
            raise PermanentProviderError("UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
        return {"provider": provider, "engine": profile["engine"], "voices": [{"id": voice}]}
    try:
        registry = load_registry(provider=provider) if provider else load_registry()
    except (OSError, ValueError):
        raise PermanentProviderError("VOICES_UNAVAILABLE", "Danh sách giọng đọc chưa sẵn sàng.") from None
    entry = registry.get(lang) if isinstance(lang, str) and not lang.startswith("_") else None
    if not entry or not any(item.get("id") == voice for item in entry.get("voices", [])):
        raise PermanentProviderError("LANG_NOT_SUPPORTED", "Ngôn ngữ hoặc giọng đọc không được hỗ trợ.")
    speed_range = entry.get("speedRange")
    if speed_range and not speed_range[0] <= speed <= speed_range[1]:
        raise PermanentProviderError("UNSUPPORTED_SPEED", "Giọng đọc không hỗ trợ tốc độ này.")
    return entry
