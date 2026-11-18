"""Local upload/read bridge for covers stored by Moto in the API process."""

from email import policy
from email.parser import BytesParser
import hashlib
import hmac
import re
import time
from urllib.parse import urlencode

MAX_BYTES = 5 * 1024 * 1024
ID = re.compile(r"^[a-f0-9]{32}$")


def _signature(secret, *parts):
    return hmac.new(secret, ":".join(map(str, parts)).encode(), hashlib.sha256).hexdigest()


def upload_ticket(secret, public_url, project_id, ticket, content_type, size_bytes):
    expires = int(time.time()) + ticket["expiresIn"]
    fields = {"projectId": project_id, "uploadId": ticket["uploadId"], "contentType": content_type,
              "sizeBytes": str(size_bytes), "version": str(ticket["version"]), "expires": str(expires)}
    fields["signature"] = _signature(secret, "upload", *(fields[key] for key in
        ("projectId", "uploadId", "contentType", "sizeBytes", "version", "expires")))
    return {**ticket, "url": f"{public_url}/local/story-cover-upload", "fields": fields}


def public_view(secret, public_url, project_id, project):
    if not project.get("coverKey"):
        return None
    expires = int(time.time()) + 900
    signature = _signature(secret, "view", project_id, project["coverUpdatedAt"], expires)
    return {"url": f"{public_url}/local/story-cover/{project_id}?{urlencode({'expires': expires, 'signature': signature})}",
            "expiresAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires)),
            "contentType": project["coverContentType"], "sizeBytes": project["coverSizeBytes"],
            "width": project["coverWidth"], "height": project["coverHeight"],
            "updatedAt": project["coverUpdatedAt"]}


def accept_upload(body, content_type, secret, s3, bucket):
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body)
    if not message.is_multipart():
        raise ValueError("Invalid multipart upload")
    fields, image = {}, None
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name == "file":
            if image is not None:
                raise ValueError("Duplicate image")
            image = part.get_payload(decode=True)
        elif name and name not in fields:
            fields[name] = part.get_content()
        else:
            raise ValueError("Invalid upload fields")
    required = {"projectId", "uploadId", "contentType", "sizeBytes", "version", "expires", "signature"}
    if set(fields) != required or image is None:
        raise ValueError("Invalid upload fields")
    project_id, upload_id = fields["projectId"], fields["uploadId"]
    if not ID.fullmatch(project_id) or not ID.fullmatch(upload_id) or fields["contentType"] not in {"image/jpeg", "image/png"}:
        raise ValueError("Invalid upload ticket")
    try:
        size, version, expires = int(fields["sizeBytes"]), int(fields["version"]), int(fields["expires"])
    except ValueError as error:
        raise ValueError("Invalid upload ticket") from error
    expected = _signature(secret, "upload", project_id, upload_id, fields["contentType"], size, version, expires)
    if (expires < time.time() or size != len(image) or not 1 <= size <= MAX_BYTES or
            not hmac.compare_digest(expected, fields["signature"])):
        raise ValueError("Invalid upload ticket")
    s3.put_object(Bucket=bucket, Key=f"audiobook-cover-staging/demo/{project_id}/{upload_id}",
                  Body=image, ContentType=fields["contentType"], ServerSideEncryption="AES256")


def valid_view(secret, project_id, updated_at, expires, signature):
    try:
        expires = int(expires)
    except (TypeError, ValueError):
        return False
    expected = _signature(secret, "view", project_id, updated_at, expires)
    return expires >= time.time() and hmac.compare_digest(expected, str(signature))
