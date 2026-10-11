import re

from app.core.errors import RangeNotSatisfiableError

_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$", re.IGNORECASE)


def parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Turn an HTTP ``Range`` header into inclusive ``(start, end)`` byte offsets.

    Returns None when there is no usable range (absent, malformed or multi-range;
    RFC 9110 lets a server ignore those and send the whole file). Raises
    ``RangeNotSatisfiableError`` for well-formed ranges outside the file.
    """
    if header is None:
        return None
    match = _RANGE.match(header.strip())
    if match is None:
        return None
    first, last = match.groups()
    if not first and not last:
        return None

    if not first:  # suffix: the last N bytes
        suffix = int(last)
        if suffix == 0 or size == 0:
            raise RangeNotSatisfiableError("Unsatisfiable range", details={"size": size})
        return max(size - suffix, 0), size - 1

    start = int(first)
    end = int(last) if last else size - 1
    if start >= size or end < start:
        raise RangeNotSatisfiableError("Unsatisfiable range", details={"size": size})
    return start, min(end, size - 1)
