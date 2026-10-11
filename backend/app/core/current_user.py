import uuid

# No auth yet: every request acts as this one local user. Swapping in real auth
# means changing only this dependency.
LOCAL_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def get_current_user_id() -> uuid.UUID:
    return LOCAL_USER_ID
