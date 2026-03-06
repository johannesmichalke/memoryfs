import type { Database } from "./types.js";

/**
 * Open a database from a file path or connection URL.
 * Auto-detects the driver. Creates the table automatically.
 *
 * ```ts
 * const db = await openDatabase("app.db");                        // SQLite
 * const db = await openDatabase(":memory:");                      // SQLite in-memory
 * const db = await openDatabase("postgres://user:pass@host/db");  // Postgres
 * const db = await openDatabase("app.db", { tableName: "agent_files" }); // custom table
 * ```
 */
export async function openDatabase(
  pathOrUrl: string,
  options?: { tableName?: string }
): Promise<Database> {
  if (pathOrUrl.startsWith("postgres://") || pathOrUrl.startsWith("postgresql://")) {
    return createPostgresDatabase(pathOrUrl, options);
  }
  return createSqliteDatabase(pathOrUrl, options);
}

async function createSqliteDatabase(
  dbPath: string,
  options?: { tableName?: string }
): Promise<Database> {
  try {
    const { SqliteDatabase } = await import("./sqlite.js");
    const db = new SqliteDatabase(dbPath, options);
    await db.initialize();
    return db;
  } catch (e) {
    const err = e as Error;
    if (err.message.includes("Cannot find module")) {
      throw new Error(
        'SQLite driver not found. Install it with: npm install better-sqlite3'
      );
    }
    throw e;
  }
}

async function createPostgresDatabase(
  url: string,
  options?: { tableName?: string }
): Promise<Database> {
  try {
    const { PostgresDatabase } = await import("./postgres.js");
    const db = new PostgresDatabase(url, options);
    await db.initialize();
    return db;
  } catch (e) {
    const err = e as Error;
    if (err.message.includes("Cannot find module")) {
      throw new Error(
        'Postgres driver not found. Install it with: npm install pg'
      );
    }
    throw e;
  }
}

export type { Database, NodeRow } from "./types.js";
