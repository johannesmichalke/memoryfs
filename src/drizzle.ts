import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Create a Drizzle table definition for agent-vfs with a custom table name.
 *
 * ```ts
 * import { createNodesTable } from "agent-vfs/drizzle";
 * export const agentFiles = createNodesTable("agent_files");
 * ```
 */
export function createNodesTable(tableName: string = "nodes") {
  return pgTable(
    tableName,
    {
      id: text("id").primaryKey(),
      userId: text("user_id").notNull(),
      path: text("path").notNull(),
      parentPath: text("parent_path").notNull(),
      name: text("name").notNull(),
      isDir: boolean("is_dir").default(false).notNull(),
      content: text("content"),
      version: integer("version").default(1).notNull(),
      size: integer("size").default(0).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
      uniqueIndex(`idx_${tableName}_user_path`).on(table.userId, table.path),
      index(`idx_${tableName}_ls`).on(table.userId, table.parentPath),
      index(`idx_${tableName}_name`).on(table.userId, table.name),
    ]
  );
}

/**
 * Default Drizzle table definition using the `nodes` table name.
 *
 * Import this into your Drizzle schema so `drizzle-kit` picks it up:
 *
 * ```ts
 * // schema.ts
 * import { nodesTable } from "agent-vfs/drizzle";
 * export { nodesTable };
 * // ...your own tables
 * ```
 *
 * Then run your normal migration:
 * ```bash
 * npx drizzle-kit generate
 * npx drizzle-kit migrate
 * ```
 */
export const nodesTable = createNodesTable();
