"""Validate MP3 frames and return audio frames for bounded chapter assembly."""

from .story_store import StoryError


def frames(data):
    if not isinstance(data, bytes) or not data:
        raise StoryError(409, "INVALID_AUDIO", "Đoạn MP3 rỗng hoặc không hợp lệ.")
    offset, result, profile = 0, [], None
    while offset < len(data):
        if data[offset:offset + 3] == b"ID3":
            tag = data[offset:offset + 10]
            if len(tag) < 10 or any(byte & 128 for byte in tag[6:10]):
                raise StoryError(409, "INVALID_AUDIO", "Nhãn MP3 không hợp lệ.")
            size = sum(byte << (7 * (3 - index)) for index, byte in enumerate(tag[6:10]))
            offset += 10 + size + (10 if tag[3] == 4 and tag[5] & 16 else 0)
            if offset > len(data):
                raise StoryError(409, "INVALID_AUDIO", "Nhãn MP3 bị cắt.")
            continue
        if len(data) - offset == 128 and data[offset:offset + 3] == b"TAG":
            break
        word = int.from_bytes(data[offset:offset + 4], "big")
        version, layer = (word >> 19) & 3, (word >> 17) & 3
        rate_index, bit_index = (word >> 10) & 3, (word >> 12) & 15
        if word >> 21 != 2047 or version == 1 or layer != 1 or rate_index == 3 or bit_index in {0, 15}:
            raise StoryError(409, "INVALID_AUDIO", "Dữ liệu không phải MP3 hợp lệ.")
        rate = (44100, 48000, 32000)[rate_index] // (1 if version == 3 else 2 if version == 2 else 4)
        rates = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320) if version == 3 else (
            0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
        length = (144000 if version == 3 else 72000) * rates[bit_index] // rate + ((word >> 9) & 1)
        if length < 4 or offset + length > len(data):
            raise StoryError(409, "INVALID_AUDIO", "Khung MP3 bị cắt.")
        mono = (word >> 6) & 3 == 3
        kind = (version, rate, mono)
        if profile is not None and kind != profile:
            raise StoryError(409, "AUDIO_FORMAT_MISMATCH", "Các khung MP3 không cùng định dạng.")
        profile = kind
        tag_offset = 4 + (0 if (word >> 16) & 1 else 2) + ((17 if mono else 32) if version == 3 else (9 if mono else 17))
        frame = data[offset:offset + length]
        if frame[tag_offset:tag_offset + 4] not in {b"Xing", b"Info"}:
            result.append(frame)
        offset += length
    if not result:
        raise StoryError(409, "INVALID_AUDIO", "Đoạn MP3 không có âm thanh.")
    return b"".join(result), profile
