"""S3 primitives for scoped audiobook metadata. Metadata is never a shared index."""

import hashlib
import json
import re
import uuid

from . import aws, config

ID = re.compile(r"^[a-f0-9]{32}$")
MAX_SCAN = 2000


class StoryError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def _storage_error(error):
    code = error.response.get("Error", {}).get("Code", "")
    if code == "AccessDenied":
        return StoryError(503, "STORAGE_ACCESS_DENIED", "S3 từ chối quyền truy cập dữ liệu truyện.")
    if code == "NoSuchBucket":
        return StoryError(503, "STORAGE_NOT_CONFIGURED", "Không tìm thấy kho dữ liệu truyện.")
    return StoryError(503, "STORAGE_UNAVAILABLE", "Chưa đọc hoặc ghi được dữ liệu truyện trong S3.")


def require_id(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise StoryError(400, "INVALID_ID", "Mã dự án hoặc chương không hợp lệ.")
    return value


def new_id(scope, kind, key=None):
    if key is None:
        return uuid.uuid4().hex
    if not isinstance(key, str) or not 8 <= len(key) <= 128 or not re.fullmatch(r"[A-Za-z0-9._:-]+", key):
        raise StoryError(400, "INVALID_IDEMPOTENCY_KEY", "Mã yêu cầu không hợp lệ.")
    return hashlib.sha256(f"story:{scope}:{kind}:{key}".encode()).hexdigest()[:32]


def root(scope):
    if scope != "demo":
        raise StoryError(403, "FORBIDDEN", "Không có quyền xem dữ liệu này.")
    return f"audiobooks/{scope}/"


def read(key):
    client = aws.s3()
    try:
        response = client.get_object(Bucket=config.JOBS_BUCKET, Key=key)
    except client.exceptions.NoSuchKey:
        return None
    except client.exceptions.ClientError as error:
        raise _storage_error(error) from None
    try:
        return json.loads(response["Body"].read()), response["ETag"]
    finally:
        response["Body"].close()


def write(key, value, etag=None, create=False):
    options = {"IfNoneMatch": "*"} if create else {"IfMatch": etag}
    client = aws.s3()
    try:
        return client.put_object(Bucket=config.JOBS_BUCKET, Key=key,
                                 Body=json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(),
                                 ContentType="application/json", ServerSideEncryption="AES256", **options)["ETag"]
    except client.exceptions.ClientError as error:
        if error.response.get("Error", {}).get("Code") in {"PreconditionFailed", "ConditionalRequestConflict"}:
            raise StoryError(409, "REVISION_CONFLICT", "Dữ liệu đã đổi. Tải lại trước khi lưu.") from None
        raise _storage_error(error) from None


def children(prefix):
    """List direct child prefixes without scanning upload and segment objects."""
    client, token, result = aws.s3(), None, []
    while True:
        options = {"Bucket": config.JOBS_BUCKET, "Prefix": prefix, "Delimiter": "/", "MaxKeys": 1000}
        if token:
            options["ContinuationToken"] = token
        try:
            response = client.list_objects_v2(**options)
        except client.exceptions.ClientError as error:
            raise _storage_error(error) from None
        result.extend(item["Prefix"] for item in response.get("CommonPrefixes", []))
        if len(result) > MAX_SCAN:
            raise StoryError(503, "SCAN_LIMIT", "Danh sách quá lớn; cần lưu trữ lại dữ liệu cũ.")
        if not response.get("IsTruncated"):
            return result
        token = response.get("NextContinuationToken")
        if not token:
            raise StoryError(503, "SCAN_INCOMPLETE", "Chưa đọc đủ danh sách.")


def page(items, limit, cursor=None):
    try:
        size = int(limit or 20)
        start = int(cursor or 0)
    except (ValueError, TypeError):
        raise StoryError(400, "INVALID_CURSOR", "Trang danh sách không hợp lệ.") from None
    if not 1 <= size <= 50 or start < 0 or start > len(items):
        raise StoryError(400, "INVALID_CURSOR", "Trang danh sách không hợp lệ.")
    end = min(start + size, len(items))
    return items[start:end], str(end) if end < len(items) else None
