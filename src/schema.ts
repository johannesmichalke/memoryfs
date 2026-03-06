/**
 * Raw SQL schemas for the memoryfs nodes table.
 *
 * Use `getSqliteSchema()` / `getPostgresSchema()` with a custom table name,
 * or import the default `sqliteSchema` / `postgresSchema` constants.
 */

/** Validates that a table name is a safe SQL identifier. */
export function validateTableName(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid table name: "${name}". Must contain only letters, numbers, and underscores, and start with a letter or underscore.`
    );
  }
  return name;
}

export function getSqliteSchema(tableName: string = "nodes"): string {
  const t = validateTableName(tableName);
  return `
CREATE TABLE IF NOT EXISTS ${t} (
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
CREATE INDEX IF NOT EXISTS idx_${t}_ls ON ${t}(user_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_${t}_name ON ${t}(user_id, name);
`.trim();
}

export function getPostgresSchema(tableName: string = "nodes"): string {
  const t = validateTableName(tableName);
  return `
CREATE TABLE IF NOT EXISTS ${t} (
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
CREATE INDEX IF NOT EXISTS idx_${t}_ls ON ${t}(user_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_${t}_name ON ${t}(user_id, name);
`.trim();
}

/** Default SQLite schema using the `nodes` table name. */
export const sqliteSchema = getSqliteSchema();

/** Default Postgres schema using the `nodes` table name. */
export const postgresSchema = getPostgresSchema();
