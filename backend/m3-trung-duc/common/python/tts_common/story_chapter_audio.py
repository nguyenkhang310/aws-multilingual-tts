"""S3 storage for one assembled MP3 per immutable audiobook plan manifest."""

import re
import unicodedata
from urllib.parse import quote

from . import aws, config, story_batch_store as batches, storage
from .story_store import StoryError, read, root, write


def record_key(scope, project_id, chapter_id, plan_id):
    return batches.base(scope, project_id, chapter_id, plan_id) + "chapter-audio.json"


def output_key(scope, project_id, chapter_id, plan_id, digest):
    root(scope)
    return f"audio/{scope}/audiobooks/{project_id}/{chapter_id}/{plan_id}/{digest}.mp3"


def get(scope, project_id, chapter_id, plan_id):
    return read(record_key(scope, project_id, chapter_id, plan_id))


def save(scope, project_id, chapter_id, plan_id, value, etag=None):
    saved_etag = write(record_key(scope, project_id, chapter_id, plan_id), value, etag=etag, create=etag is None)
    return value, saved_etag


def exists(key):
    client = aws.s3()
    try:
        return client.head_object(Bucket=config.AUDIO_BUCKET, Key=key)
    except client.exceptions.ClientError as error:
        if error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey"}:
            return None
        raise


def source(scope, entry):
    key = storage.audio_key(scope, entry["jobId"])
    if key != entry["audioKey"]:
        raise StoryError(409, "AUDIO_SOURCE_CHANGED", "Khóa MP3 không khớp job.")
    response = aws.s3().get_object(Bucket=config.AUDIO_BUCKET, Key=key)
    body = response["Body"]
    try:
        if response.get("ETag") != entry["etag"]:
            raise StoryError(409, "AUDIO_SOURCE_CHANGED", "MP3 nguồn đã đổi.")
        data = body.read(16 * 1024 * 1024 + 1)
        if len(data) > 16 * 1024 * 1024 or len(data) != entry["size"]:
            raise StoryError(413, "AUDIO_SOURCE_TOO_LARGE", "Một đoạn MP3 vượt giới hạn xử lý.")
        return data
    finally:
        body.close()


def stage_key(scope, project_id, chapter_id, plan_id, index):
    return output_key(scope, project_id, chapter_id, plan_id, "staging")[:-4] + f"/{index:04d}.mp3"


def put_stage(key, data):
    aws.s3().put_object(Bucket=config.AUDIO_BUCKET, Key=key, Body=data,
                        ContentType="audio/mpeg", ServerSideEncryption="AES256")


def read_stage(key):
    response = aws.s3().get_object(Bucket=config.AUDIO_BUCKET, Key=key)
    try:
        data = response["Body"].read(16 * 1024 * 1024 + 1)
        if len(data) > 16 * 1024 * 1024:
            raise StoryError(413, "AUDIO_STAGE_TOO_LARGE", "Phần ghép chương vượt giới hạn xử lý.")
        return data
    finally:
        response["Body"].close()


def begin(key):
    return aws.s3().create_multipart_upload(Bucket=config.AUDIO_BUCKET, Key=key,
        ContentType="audio/mpeg", ServerSideEncryption="AES256")["UploadId"]


def part(key, upload_id, number, data):
    return aws.s3().upload_part(Bucket=config.AUDIO_BUCKET, Key=key, UploadId=upload_id,
                                PartNumber=number, Body=data)["ETag"]


def finish(key, upload_id, parts):
    return aws.s3().complete_multipart_upload(Bucket=config.AUDIO_BUCKET, Key=key,
        UploadId=upload_id, MultipartUpload={"Parts": parts})


def single(key, data):
    aws.s3().put_object(Bucket=config.AUDIO_BUCKET, Key=key, Body=data,
                        ContentType="audio/mpeg", ServerSideEncryption="AES256", IfNoneMatch="*")


def url(key):
    return storage.get_audio_url(key)


def download_disposition(chapter_number, story_title):
    title = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", story_title).strip().rstrip(".") or "truyen"
    title = re.sub(r"\s+", " ", title)[:100]
    stem = f"chuong {chapter_number:02d} - {title}"
    fallback = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode()
    fallback = re.sub(r"[^A-Za-z0-9 ._-]+", "", fallback).strip().replace(" ", "-") or f"chuong-{chapter_number:02d}"
    return f"attachment; filename=\"{fallback}.mp3\"; filename*=UTF-8''{quote(stem)}.mp3"


def download_url(key, chapter_number, story_title):
    return aws.s3().generate_presigned_url("get_object", Params={
        "Bucket": config.AUDIO_BUCKET, "Key": key,
        "ResponseContentDisposition": download_disposition(chapter_number, story_title)},
        ExpiresIn=config.PRESIGN_TTL_SECONDS)
