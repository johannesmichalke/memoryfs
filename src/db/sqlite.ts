import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";
import type { Database, NodeRow } from "./types.js";
import { getSqliteSchema, validateTableName } from "../schema.js";
import { EditConflictError } from "../fs/errors.js";

const require = createRequire(import.meta.url);

interface SqliteRow {
  id: string;
  user_id: string;
  path: string;
  parent_path: string;
  name: string;
  is_dir: number;
  content: string | null;
  version: number;
  size: number;
  created_at: string;
  updated_at: string;
}

function rowToNode(row: SqliteRow): NodeRow {
  return {
    id: row.id,
    user_id: row.user_id,
    path: row.path,
    parent_path: row.parent_path,
    name: row.name,
    is_dir: row.is_dir === 1,
    content: row.content,
    version: row.version,
    size: row.size,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SqliteDatabase implements Database {
  private db: BetterSqlite3.Database;
  private table: string;

  constructor(dbPath: string, options?: { tableName?: string }) {
    const Database = require("better-sqlite3") as typeof BetterSqlite3;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.table = validateTableName(options?.tableName ?? "nodes");
  }

  async initialize(): Promise<void> {
    this.db.exec(getSqliteSchema(this.table));
  }

  async getNode(userId: string, path: string): Promise<NodeRow | undefined> {
    const row = this.db
      .prepare(`SELECT * FROM ${this.table} WHERE user_id = ? AND path = ?`)
      .get(userId, path) as SqliteRow | undefined;
    return row ? rowToNode(row) : undefined;
  }

  async listChildren(userId: string, parentPath: string): Promise<NodeRow[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE user_id = ? AND parent_path = ? ORDER BY is_dir DESC, name ASC`
      )
      .all(userId, parentPath) as SqliteRow[];
    return rows.map(rowToNode);
  }

  async listDescendants(userId: string, pathPrefix: string): Promise<NodeRow[]> {
    if (pathPrefix === "/") {
      const rows = this.db
        .prepare(`SELECT * FROM ${this.table} WHERE user_id = ? ORDER BY path ASC`)
        .all(userId) as SqliteRow[];
      return rows.map(rowToNode);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE user_id = ? AND (path = ? OR path LIKE ?) ORDER BY path ASC`
      )
      .all(userId, pathPrefix, pathPrefix + "/%") as SqliteRow[];
    return rows.map(rowToNode);
  }

  async upsertNode(node: Omit<NodeRow, "created_at" | "updated_at">): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ${this.table} (id, user_id, path, parent_path, name, is_dir, content, version, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, path) DO UPDATE SET
           content = excluded.content,
           version = excluded.version,
           size = excluded.size,
           updated_at = datetime('now')`
      )
      .run(
        node.id,
        node.user_id,
        node.path,
        node.parent_path,
        node.name,
        node.is_dir ? 1 : 0,
        node.content,
        node.version,
        node.size
      );
  }

  async updateContent(
    userId: string,
    path: string,
    content: string,
    size: number,
    version: number
  ): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE ${this.table} SET content = ?, size = ?, version = ?, updated_at = datetime('now')
         WHERE user_id = ? AND path = ? AND version = ?`
      )
      .run(content, size, version, userId, path, version - 1);
    if (result.changes === 0) {
      throw new EditConflictError(`Concurrent edit detected on ${path} (expected version ${version - 1})`);
    }
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM ${this.table} WHERE user_id = ? AND path = ?`)
      .run(userId, path);
  }

  async deleteTree(userId: string, pathPrefix: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM ${this.table} WHERE user_id = ? AND (path = ? OR path LIKE ?)`
      )
      .run(userId, pathPrefix, pathPrefix + "/%");
  }

  async moveNode(
    userId: string,
    oldPath: string,
    newPath: string,
    newParent: string,
    newName: string
  ): Promise<void> {
    this.db
      .prepare(
        `UPDATE ${this.table} SET path = ?, parent_path = ?, name = ?, updated_at = datetime('now')
         WHERE user_id = ? AND path = ?`
      )
      .run(newPath, newParent, newName, userId, oldPath);
  }

  async moveTree(userId: string, oldPrefix: string, newPrefix: string): Promise<void> {
    const rows = this.db
      .prepare(
        `SELECT path, parent_path FROM ${this.table} WHERE user_id = ? AND path LIKE ?`
      )
      .all(userId, oldPrefix + "/%") as Array<{
      path: string;
      parent_path: string;
    }>;

    const update = this.db.prepare(
      `UPDATE ${this.table} SET path = ?, parent_path = ?, updated_at = datetime('now')
       WHERE user_id = ? AND path = ?`
    );

    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        const newPath = newPrefix + row.path.slice(oldPrefix.length);
        const newParentPath =
          newPrefix + row.parent_path.slice(oldPrefix.length);
        update.run(newPath, newParentPath, userId, row.path);
      }
    });
    transaction();
  }

  async searchContent(
    userId: string,
    likePattern: string,
    pathPrefix?: string
  ): Promise<NodeRow[]> {
    if (pathPrefix && pathPrefix !== "/") {
      const rows = this.db
        .prepare(
          `SELECT * FROM ${this.table} WHERE user_id = ? AND is_dir = 0
           AND content LIKE ? ESCAPE '\\'
           AND (path = ? OR path LIKE ?)`
        )
        .all(userId, `%${likePattern}%`, pathPrefix, pathPrefix + "/%") as SqliteRow[];
      return rows.map(rowToNode);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE user_id = ? AND is_dir = 0
         AND content LIKE ? ESCAPE '\\'`
      )
      .all(userId, `%${likePattern}%`) as SqliteRow[];
    return rows.map(rowToNode);
  }

  async searchNames(
    userId: string,
    likePattern: string,
    pathPrefix?: string
  ): Promise<NodeRow[]> {
    if (pathPrefix && pathPrefix !== "/") {
      const rows = this.db
        .prepare(
          `SELECT * FROM ${this.table} WHERE user_id = ? AND name LIKE ? ESCAPE '\\'
           AND (path = ? OR path LIKE ?)`
        )
        .all(userId, likePattern, pathPrefix, pathPrefix + "/%") as SqliteRow[];
      return rows.map(rowToNode);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE user_id = ? AND name LIKE ? ESCAPE '\\'`
      )
      .all(userId, likePattern) as SqliteRow[];
    return rows.map(rowToNode);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
