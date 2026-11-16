"""Rotate Gemini keys only in the local development runtime."""

from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request


MAX_KEYS = 5
GEMINI_HOST = "generativelanguage.googleapis.com"


def parse_keys(value):
    keys = tuple(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))
    if not 1 <= len(keys) <= MAX_KEYS:
        raise ValueError("GEMINI_API_KEY accepts one to five comma-separated keys.")
    return keys


def install(opener, keys):
    """Patch one local opener; return cleanup callback for Runtime ExitStack."""
    original = opener.open

    def open_request(request, *args, **kwargs):
        if len(keys) == 1 or urlsplit(request.full_url).hostname != GEMINI_HOST:
            return original(request, *args, **kwargs)
        headers = {key.lower(): value for key, value in request.header_items()}
        headers.pop("x-goog-api-key", None)
        for index, key in enumerate(keys):
            rotated = Request(request.full_url, data=request.data, headers={**headers, "x-goog-api-key": key},
                              method=request.get_method())
            try:
                return original(rotated, *args, **kwargs)
            except HTTPError as error:
                if error.code != 429 or index == len(keys) - 1:
                    raise
                error.close()
        raise RuntimeError("Gemini key rotation ended without a response")

    opener.open = open_request
    return lambda: setattr(opener, "open", original)
