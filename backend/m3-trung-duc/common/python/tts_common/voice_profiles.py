"""Private reference-audio profiles for the experimental VieNeu provider."""

import json
import re
import time
import uuid

from . import aws, config
from .utils import USER_ID_PATTERN


PROFILE_ID = re.compile(r"^[a-f0-9]{32}$")
PREFIX = "voice-profiles"
MAX_PROFILES = 50


def _keys(user_id, profile_id):
    if not isinstance(user_id, str) or not USER_ID_PATTERN.fullmatch(user_id):
        raise ValueError("Invalid voice profile scope")
    if not isinstance(profile_id, str) or not PROFILE_ID.fullmatch(profile_id):
        raise ValueError("Invalid voice profile id")
    root = f"{config.JOBS_PREFIX}{PREFIX}/{user_id}/{profile_id}"
    return f"{root}.json", f"{root}/reference.wav"


def _read(key):
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.JOBS_BUCKET, Key=key)
    except client.exceptions.NoSuchKey:
        return None
    try:
        return json.loads(response["Body"].read())
    finally:
        response["Body"].close()


def get(user_id, profile_id):
    """Return metadata and its private S3 key; never return audio bytes."""
    metadata_key, _ = _keys(user_id, profile_id)
    return _read(metadata_key)


def list_profiles(user_id):
    """List a bounded set of profile metadata for one scope."""
    _keys(user_id, "0" * 32)
    client = aws.s3()
    prefix = f"{config.JOBS_PREFIX}{PREFIX}/{user_id}/"
    response = client.list_objects_v2(Bucket=config.JOBS_BUCKET, Prefix=prefix, MaxKeys=MAX_PROFILES * 2 + 1)
    items = []
    if response.get("IsTruncated"):
        raise RuntimeError("VOICE_PROFILE_SCAN_LIMIT")
    for item in response.get("Contents", []):
        if item["Key"].endswith(".json"):
            profile = _read(item["Key"])
            if profile and profile.get("status") == "READY":
                items.append({key: profile[key] for key in ("voiceProfileId", "name", "lang", "createdAt", "engine")})
    return sorted(items[:MAX_PROFILES], key=lambda item: item["createdAt"], reverse=True)


def create(user_id, profile_id, name, lang, audio):
    """Persist WAV first, then publish a profile record using a conditional write."""
    if len(list_profiles(user_id)) >= MAX_PROFILES:
        raise ValueError("VOICE_PROFILE_LIMIT")
    metadata_key, audio_key = _keys(user_id, profile_id)
    client = aws.s3()
    client.put_object(Bucket=config.JOBS_BUCKET, Key=audio_key, Body=audio,
                      ContentType="audio/wav", ServerSideEncryption="AES256")
    profile = {"voiceProfileId": profile_id, "userId": user_id, "name": name,
               "lang": lang, "referenceKey": audio_key, "engine": "vieneu-3.8.4-onnx-int8",
               "consentConfirmed": True, "status": "READY", "createdAt": int(time.time())}
    try:
        client.put_object(Bucket=config.JOBS_BUCKET, Key=metadata_key,
                          Body=json.dumps(profile, ensure_ascii=False).encode("utf-8"),
                          ContentType="application/json", ServerSideEncryption="AES256", IfNoneMatch="*")
    except Exception:
        client.delete_object(Bucket=config.JOBS_BUCKET, Key=audio_key)
        raise
    return {key: profile[key] for key in ("voiceProfileId", "name", "lang", "createdAt", "engine")}


def delete(user_id, profile_id):
    """Delete the private reference and metadata for a profile in the caller scope."""
    metadata_key, audio_key = _keys(user_id, profile_id)
    profile = _read(metadata_key)
    if profile is None:
        return False
    client = aws.s3()
    client.delete_object(Bucket=config.JOBS_BUCKET, Key=audio_key)
    client.delete_object(Bucket=config.JOBS_BUCKET, Key=metadata_key)
    return True


def new_id():
    return uuid.uuid4().hex
