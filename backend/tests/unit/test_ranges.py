import pytest

from app.api.ranges import parse_range
from app.core.errors import RangeNotSatisfiableError

SIZE = 1000


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, None),
        ("bytes=0-99", (0, 99)),
        ("bytes=100-", (100, 999)),
        ("bytes=-50", (950, 999)),
        ("bytes=-5000", (0, 999)),  # suffix longer than the file: whole file
        ("bytes=990-5000", (990, 999)),  # end clamped
        ("bytes=999-999", (999, 999)),
        ("BYTES=0-9", (0, 9)),
    ],
)
def test_valid_ranges(header: str | None, expected: tuple[int, int] | None) -> None:
    assert parse_range(header, SIZE) == expected


@pytest.mark.parametrize(
    "header",
    ["bytes=1000-", "bytes=5000-6000", "bytes=-0", "bytes=50-10"],
)
def test_unsatisfiable_ranges_raise(header: str) -> None:
    with pytest.raises(RangeNotSatisfiableError):
        parse_range(header, SIZE)


@pytest.mark.parametrize(
    "header",
    ["", "garbage", "items=0-5", "bytes=", "bytes=a-b", "bytes=0-1,5-6", "bytes=--5"],
)
def test_malformed_or_multi_ranges_are_ignored(header: str) -> None:
    assert parse_range(header, SIZE) is None
