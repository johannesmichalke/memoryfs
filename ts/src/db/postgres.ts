import { createRequire } from "node:module";
import type { Database, NodeRow } from "./types.js";
import { getPostgresSchema, validateTableName } from "../schema.js";
import { EditConflictError } from "../fs/errors.js";

const require = createRequire(import.meta.url);

/**
 * Minimal interface for any Postgres-compatible client.
 * Works with: pg.Pool, pg.Client, @neondatabase/serverless, @vercel/postgres, etc.
 */
export interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

function rowToNode(row: Record<string, unknown>): NodeRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    path: row.path as string,
    parent_path: row.parent_path as string,
    name: row.name as string,
    is_dir: !!row.is_dir,
    content: (row.content as string) ?? null,
    version: Number(row.version),
    size: Number(row.size),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class PostgresDatabase implements Database {
  private client: PgClient;
  private table: string;

  /**
   * Pass a connection URL string or a pre-configured client/pool.
   *
   * ```ts
   * new PostgresDatabase("postgres://user:pass@host/db")
   * new PostgresDatabase(new Pool({ connectionString: "..." }))
   * new PostgresDatabase(neon(process.env.DATABASE_URL))
   * ```
   */
  constructor(urlOrClient: string | PgClient, options?: { tableName?: string }) {
    if (typeof urlOrClient === "string") {
      const pg = require("pg") as { Pool: new (config: { connectionString: string }) => PgClient };
      this.client = new pg.Pool({ connectionString: urlOrClient });
    } else {
      this.client = urlOrClient;
    }
    this.table = validateTableName(options?.tableName ?? "nodes");
  }

  async initialize(): Promise<void> {
    const schema = getPostgresSchema(this.table);
    for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean)) {
      await this.client.query(stmt);
    }
  }

  async getNode(userId: string, path: string): Promise<NodeRow | undefined> {
    const { rows } = await this.client.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND path = $2`,
      [userId, path]
    );
    return rows[0] ? rowToNode(rows[0]) : undefined;
  }

  async listChildren(userId: string, parentPath: string): Promise<NodeRow[]> {
    const { rows } = await this.client.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND parent_path = $2 ORDER BY is_dir DESC, name ASC`,
      [userId, parentPath]
    );
    return rows.map(rowToNode);
  }

  async listDescendants(userId: string, pathPrefix: string): Promise<NodeRow[]> {
    if (pathPrefix === "/") {
      const { rows } = await this.client.query(
        `SELECT * FROM ${this.table} WHERE user_id = $1 ORDER BY path ASC`,
        [userId]
      );
      return rows.map(rowToNode);
    }
    const { rows } = await this.client.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND (path = $2 OR path LIKE $3) ORDER BY path ASC`,
      [userId, pathPrefix, pathPrefix + "/%"]
    );
    return rows.map(rowToNode);
  }

  async upsertNode(node: Omit<NodeRow, "created_at" | "updated_at">): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.table} (id, user_id, path, parent_path, name, is_dir, content, version, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(user_id, path) DO UPDATE SET
         content = EXCLUDED.content,
         version = EXCLUDED.version,
         size = EXCLUDED.size,
         updated_at = NOW()`,
      [node.id, node.user_id, node.path, node.parent_path, node.name, node.is_dir, node.content, node.version, node.size]
    );
  }

  async updateContent(userId: string, path: string, content: string, size: number, version: number): Promise<void> {
    const result = await this.client.query(
      `UPDATE ${this.table} SET content = $1, size = $2, version = $3, updated_at = NOW()
       WHERE user_id = $4 AND path = $5 AND version = $6`,
      [content, size, version, userId, path, version - 1]
    );
    if (result.rowCount === 0) {
      throw new EditConflictError(`Concurrent edit detected on ${path} (expected version ${version - 1})`);
    }
  }

  async deleteNode(userId: string, path: string): Promise<void> {
    await this.client.query(
      `DELETE FROM ${this.table} WHERE user_id = $1 AND path = $2`,
      [userId, path]
    );
  }

  async deleteTree(userId: string, pathPrefix: string): Promise<void> {
    await this.client.query(
      `DELETE FROM ${this.table} WHERE user_id = $1 AND (path = $2 OR path LIKE $3)`,
      [userId, pathPrefix, pathPrefix + "/%"]
    );
  }

  async moveNode(userId: string, oldPath: string, newPath: string, newParent: string, newName: string): Promise<void> {
    await this.client.query(
      `UPDATE ${this.table} SET path = $1, parent_path = $2, name = $3, updated_at = NOW()
       WHERE user_id = $4 AND path = $5`,
      [newPath, newParent, newName, userId, oldPath]
    );
  }

  async moveTree(userId: string, oldPrefix: string, newPrefix: string): Promise<void> {
    await this.client.query(
      `UPDATE ${this.table}
       SET path = $3 || substring(path from $4),
           parent_path = $3 || substring(parent_path from $4),
           updated_at = NOW()
       WHERE user_id = $1 AND path LIKE $2`,
      [userId, oldPrefix + "/%", newPrefix, oldPrefix.length + 1]
    );
  }

  async searchContent(userId: string, likePattern: string, pathPrefix?: string): Promise<NodeRow[]> {
    if (pathPrefix && pathPrefix !== "/") {
      const { rows } = await this.client.query(
        `SELECT * FROM ${this.table} WHERE user_id = $1 AND is_dir = FALSE
         AND content LIKE $2 ESCAPE '\\'
         AND (path = $3 OR path LIKE $4)`,
        [userId, `%${likePattern}%`, pathPrefix, pathPrefix + "/%"]
      );
      return rows.map(rowToNode);
    }
    const { rows } = await this.client.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND is_dir = FALSE
       AND content LIKE $2 ESCAPE '\\'`,
      [userId, `%${likePattern}%`]
    );
    return rows.map(rowToNode);
  }

  async searchNames(userId: string, likePattern: string, pathPrefix?: string): Promise<NodeRow[]> {
    if (pathPrefix && pathPrefix !== "/") {
      const { rows } = await this.client.query(
        `SELECT * FROM ${this.table} WHERE user_id = $1 AND name LIKE $2 ESCAPE '\\'
         AND (path = $3 OR path LIKE $4)`,
        [userId, likePattern, pathPrefix, pathPrefix + "/%"]
      );
      return rows.map(rowToNode);
    }
    const { rows } = await this.client.query(
      `SELECT * FROM ${this.table} WHERE user_id = $1 AND name LIKE $2 ESCAPE '\\'`,
      [userId, likePattern]
    );
    return rows.map(rowToNode);
  }

  async close(): Promise<void> {
    if ("end" in this.client && typeof (this.client as { end: () => Promise<void> }).end === "function") {
      await (this.client as { end: () => Promise<void> }).end();
    }
  }
}
