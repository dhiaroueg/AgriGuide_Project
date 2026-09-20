import os
from contextlib import contextmanager
from typing import Iterator

import psycopg2.extras
from psycopg2 import pool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://agriadvisor:changeme@localhost:5434/agriadvisor")
_pool: pool.SimpleConnectionPool | None = None

def _connection_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL, connect_timeout=5)
    return _pool

@contextmanager
def get_cursor() -> Iterator[psycopg2.extras.RealDictCursor]:
    conn = _connection_pool().getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _connection_pool().putconn(conn)
