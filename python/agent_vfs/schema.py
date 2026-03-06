import re


def validate_table_name(name: str) -> str:
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
        raise ValueError(
            f'Invalid table name: "{name}". Must contain only letters, numbers, '
            "and underscores, and start with a letter or underscore."
        )
    return name


def get_sqlite_schema(table_name: str = "nodes") -> str:
    t = validate_table_name(table_name)
    return f"""\
CREATE TABLE IF NOT EXISTS {t} (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  path        TEXT NOT NULL,
  parent_path TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_dir      INTEGER DEFAULT 0,
  content     TEXT,
  version     INTEGER DEFAULT 1,
  size        INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, path)
);
CREATE INDEX IF NOT EXISTS idx_{t}_ls ON {t}(user_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_{t}_name ON {t}(user_id, name);"""


def get_postgres_schema(table_name: str = "nodes") -> str:
    t = validate_table_name(table_name)
    return f"""\
CREATE TABLE IF NOT EXISTS {t} (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  path        TEXT NOT NULL,
  parent_path TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_dir      BOOLEAN DEFAULT FALSE,
  content     TEXT,
  version     INTEGER DEFAULT 1,
  size        INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, path)
);
CREATE INDEX IF NOT EXISTS idx_{t}_ls ON {t}(user_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_{t}_name ON {t}(user_id, name);"""


sqlite_schema = get_sqlite_schema()
postgres_schema = get_postgres_schema()
