from pydantic import BaseModel


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, object] = {}


class ErrorResponse(BaseModel):
    error: ErrorDetail
