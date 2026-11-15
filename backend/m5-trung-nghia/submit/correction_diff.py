"""Bounded, reviewable typo edits; offsets address the proposed JS string."""

import re
import unicodedata

WORD = re.compile(r"\w[\w\u0300-\u036f]*", re.UNICODE)
PROTECTED = re.compile(r"(?:https?://|www\.)\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", re.I)


class UnsafeSuggestion(ValueError):
    pass


def utf16_len(value):
    return len(value.encode("utf-16-le")) // 2


def _plain(value):
    return "".join(char for char in unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
                   if not unicodedata.combining(char))


def _distance(a, b):
    row = list(range(len(b) + 1))
    for i, char in enumerate(a, 1):
        next_row = [i]
        for j, other in enumerate(b, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1,
                                row[j - 1] + (char != other)))
        row = next_row
    return row[-1]


def _safe_word(old, new):
    if not old.isalpha() or not new.isalpha():
        return False
    a, b = _plain(old), _plain(new)
    return _distance(a, b) <= min(3, max(1, (max(len(a), len(b)) + 1) // 2))


def review(original, result, max_changes):
    if not isinstance(result, dict) or set(result) != {"correctedText"}:
        raise UnsafeSuggestion("Invalid schema")
    proposed = result["correctedText"]
    if (not isinstance(proposed, str) or not proposed.strip() or
            len(proposed) > len(original) + max(24, 2 * max_changes) or
            len(proposed) < len(original) - max(24, 2 * max_changes) or
            any(unicodedata.category(char) == "Cc" and char not in "\n\r\t" for char in proposed)):
        raise UnsafeSuggestion("Invalid text")
    if [m.group() for m in PROTECTED.finditer(original)] != [m.group() for m in PROTECTED.finditer(proposed)]:
        raise UnsafeSuggestion("Protected content changed")
    before, after = list(WORD.finditer(original)), list(WORD.finditer(proposed))
    if len(before) != len(after):
        raise UnsafeSuggestion("Word count changed")
    protected = [m.span() for m in PROTECTED.finditer(original)]
    parts, changes, cursor = [], [], 0
    for source, target in zip(before, after):
        parts.append(original[cursor:source.start()])
        old, new = source.group(), target.group()
        protected_word = any(source.start() < end and source.end() > start for start, end in protected)
        if old != new and not protected_word and _safe_word(old, new) and len(changes) < max_changes:
            start = utf16_len("".join(parts))
            changes.append({"from": old, "to": new, "start": start, "end": start + utf16_len(new)})
            parts.append(new)
        else:
            parts.append(old)
        cursor = source.end()
    parts.append(original[cursor:])
    corrected = "".join(parts)
    if (proposed == corrected + "." or proposed == corrected + "?" or proposed == corrected + "!") and before:
        last = before[-1]
        if last.end() == len(original) and len(changes) < max_changes:
            punctuation = proposed[-1]
            start = utf16_len(corrected) - utf16_len(parts[-2])
            previous = changes[-1] if changes else None
            if previous and previous["start"] == start:
                previous["to"] += punctuation
                previous["end"] += 1
            else:
                changes.append({"from": last.group(), "to": last.group() + punctuation,
                                "start": start, "end": utf16_len(proposed)})
            corrected = proposed
    if proposed != original and not changes:
        raise UnsafeSuggestion("Unexplained change")
    return corrected, changes
