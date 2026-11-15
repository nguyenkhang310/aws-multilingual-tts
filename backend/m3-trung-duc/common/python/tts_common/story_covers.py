"""Private S3 upload, verification and presigned delivery for audiobook covers."""

from datetime import datetime, timedelta, timezone
import uuid

from . import aws, config
from .story_cover_image import MAX_BYTES, MIMES, inspect
from .story_store import StoryError, require_id, root

URL_TTL = 900
POST_OVERHEAD = 64 * 1024
STAGING = "audiobook-cover-staging/"


def _paths(scope, project_id, upload_id):
    require_id(project_id)
    require_id(upload_id)
    return (f"{STAGING}{scope}/{project_id}/{upload_id}",
            f"{root(scope)}{project_id}/covers/{upload_id}")


def _owned_key(scope, project_id, key):
    return isinstance(key, str) and key.startswith(f"{root(scope)}{project_id}/covers/")


def _delete(key):
    if key:
        aws.s3().delete_object(Bucket=config.JOBS_BUCKET, Key=key)


def public_view(scope, project_id, project):
    key = project.get("coverKey")
    if not key:
        return None
    if not _owned_key(scope, project_id, key):
        raise StoryError(503, "COVER_METADATA_INVALID", "Ảnh bìa chưa thể tải.")
    now = datetime.now(timezone.utc)
    return {"url": aws.s3().generate_presigned_url("get_object",
            Params={"Bucket": config.JOBS_BUCKET, "Key": key}, ExpiresIn=URL_TTL),
            "expiresAt": (now + timedelta(seconds=URL_TTL)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "contentType": project["coverContentType"], "sizeBytes": project["coverSizeBytes"],
            "width": project["coverWidth"], "height": project["coverHeight"],
            "updatedAt": project["coverUpdatedAt"]}


def begin(scope, project_id, content_type, size_bytes, version):
    from . import story_projects
    project, _ = story_projects.get(scope, project_id)
    if type(version) is not int or version != project["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi tải ảnh.")
    if content_type not in MIMES:
        raise StoryError(400, "INVALID_COVER_TYPE", "Chỉ nhận ảnh JPEG hoặc PNG.")
    if type(size_bytes) is not int or not 1 <= size_bytes <= MAX_BYTES:
        raise StoryError(400, "INVALID_COVER_SIZE", "Ảnh bìa tối đa 5 MiB.")
    upload_id = uuid.uuid4().hex
    staging_key, cover_key = _paths(scope, project_id, upload_id)
    post = aws.s3().generate_presigned_post(Bucket=config.JOBS_BUCKET, Key=staging_key,
        Fields={"Content-Type": content_type}, Conditions=[{"key": staging_key},
        {"Content-Type": content_type}, ["content-length-range", 1, MAX_BYTES + POST_OVERHEAD]], ExpiresIn=600)
    return {"uploadId": upload_id, "url": post["url"], "fields": post["fields"],
            "version": version, "expiresIn": 600}


def commit(scope, project_id, upload_id, version):
    from . import story_projects
    staging_key, cover_key = _paths(scope, project_id, upload_id)
    project, _ = story_projects.get(scope, project_id)
    if project.get("coverKey") == cover_key:
        return story_projects.details(scope, project_id)
    if type(version) is not int or version != project["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi lưu ảnh.")
    client = aws.s3()
    try:
        head = client.head_object(Bucket=config.JOBS_BUCKET, Key=staging_key)
    except client.exceptions.ClientError as error:
        if error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            raise StoryError(404, "COVER_UPLOAD_NOT_FOUND", "Không tìm thấy ảnh tải lên; hãy chọn lại.") from None
        raise
    size = head.get("ContentLength", 0)
    if not 1 <= size <= MAX_BYTES:
        _delete(staging_key)
        raise StoryError(400, "INVALID_COVER_SIZE", "Ảnh bìa tối đa 5 MiB.")
    response = client.get_object(Bucket=config.JOBS_BUCKET, Key=staging_key)
    try:
        data = response["Body"].read(MAX_BYTES + 1)
    finally:
        response["Body"].close()
    try:
        image = inspect(data)
    except StoryError:
        _delete(staging_key)
        raise
    if head.get("ContentType") != image["contentType"]:
        _delete(staging_key)
        raise StoryError(400, "COVER_TYPE_MISMATCH", "Định dạng ảnh không khớp nội dung tệp.")
    old_key = project.get("coverKey")
    client.put_object(Bucket=config.JOBS_BUCKET, Key=cover_key, Body=data,
        ContentType=image["contentType"], ServerSideEncryption="AES256")
    try:
        result = story_projects.set_cover(scope, project_id, version, cover_key,
            {**image, "sizeBytes": size})
    except Exception:
        try:
            current, _ = story_projects.get(scope, project_id)
            if current.get("coverKey") != cover_key:
                _delete(cover_key)
        except Exception:
            pass
        raise
    for key in (staging_key, old_key):
        if key and key != cover_key and (key == staging_key or _owned_key(scope, project_id, key)):
            try:
                _delete(key)
            except Exception:
                pass
    return result


def clear(scope, project_id, version):
    from . import story_projects
    project, _ = story_projects.get(scope, project_id)
    if type(version) is not int or version != project["version"]:
        raise StoryError(409, "REVISION_CONFLICT", "Dự án đã đổi. Tải lại trước khi xóa ảnh.")
    old_key = project.get("coverKey")
    result = story_projects.clear_cover(scope, project_id, version)
    if old_key and _owned_key(scope, project_id, old_key):
        try:
            _delete(old_key)
        except Exception:
            pass
    return result
