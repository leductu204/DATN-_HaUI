import bcrypt

# bcrypt enforces a 72-byte password limit (algorithm constraint, not config).
# UserCreate.password has min_length=6 and no upper bound; passwords longer than
# 72 bytes get truncated by callers. For this project's signup flow (humans
# typing passwords), it's a non-issue in practice.

_BCRYPT_MAX_BYTES = 72


def _truncate(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_truncate(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_truncate(plain), hashed.encode("utf-8"))
    except ValueError:
        return False
