from .types import NodeRow, Database
from .sqlite import SqliteDatabase

__all__ = ["NodeRow", "Database", "SqliteDatabase", "open_database"]


def open_database(
    path_or_url: str, *, table_name: str = "nodes"
) -> Database:
    """Open a database. Auto-detects SQLite (file path) or Postgres (URL).

    For Postgres, install the optional extra: pip install agent-vfs[postgres]
    """
    if path_or_url.startswith(("postgres://", "postgresql://")):
        from .postgres import PostgresDatabase

        db = PostgresDatabase(path_or_url, table_name=table_name)
    else:
        db = SqliteDatabase(path_or_url, table_name=table_name)
    db.initialize()
    return db
