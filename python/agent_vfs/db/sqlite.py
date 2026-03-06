from __future__ import annotations

import sqlite3

from ..errors import EditConflictError
from ..schema import get_sqlite_schema, validate_table_name
from .types import NodeRow


def _row_to_node(row: sqlite3.Row) -> NodeRow:
    return NodeRow(
        id=row["id"],
        user_id=row["user_id"],
        path=row["path"],
        parent_path=row["parent_path"],
        name=row["name"],
        is_dir=bool(row["is_dir"]),
        content=row["content"],
        version=row["version"],
        size=row["size"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class SqliteDatabase:
    def __init__(self, db_path: str, *, table_name: str = "nodes"):
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._table = validate_table_name(table_name)

    def initialize(self) -> None:
        schema = get_sqlite_schema(self._table)
        for stmt in schema.split(";"):
            stmt = stmt.strip()
            if stmt:
                self._conn.execute(stmt)
        self._conn.commit()

    def get_node(self, user_id: str, path: str) -> NodeRow | None:
        cur = self._conn.execute(
            f"SELECT * FROM {self._table} WHERE user_id = ? AND path = ?",
            (user_id, path),
        )
        row = cur.fetchone()
        return _row_to_node(row) if row else None

    def list_children(self, user_id: str, parent_path: str) -> list[NodeRow]:
        cur = self._conn.execute(
            f"SELECT * FROM {self._table} WHERE user_id = ? AND parent_path = ? "
            "ORDER BY is_dir DESC, name ASC",
            (user_id, parent_path),
        )
        return [_row_to_node(r) for r in cur.fetchall()]

    def list_descendants(self, user_id: str, path_prefix: str) -> list[NodeRow]:
        if path_prefix == "/":
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? ORDER BY path ASC",
                (user_id,),
            )
        else:
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? "
                "AND (path = ? OR path LIKE ?) ORDER BY path ASC",
                (user_id, path_prefix, path_prefix + "/%"),
            )
        return [_row_to_node(r) for r in cur.fetchall()]

    def upsert_node(self, node: NodeRow) -> None:
        self._conn.execute(
            f"INSERT INTO {self._table} "
            "(id, user_id, path, parent_path, name, is_dir, content, version, size) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id, path) DO UPDATE SET "
            "content = excluded.content, version = excluded.version, "
            "size = excluded.size, updated_at = datetime('now')",
            (
                node["id"],
                node["user_id"],
                node["path"],
                node["parent_path"],
                node["name"],
                1 if node["is_dir"] else 0,
                node["content"],
                node["version"],
                node["size"],
            ),
        )
        self._conn.commit()

    def update_content(
        self,
        user_id: str,
        path: str,
        content: str,
        size: int,
        version: int,
    ) -> None:
        cur = self._conn.execute(
            f"UPDATE {self._table} SET content = ?, size = ?, version = ?, "
            "updated_at = datetime('now') "
            "WHERE user_id = ? AND path = ? AND version = ?",
            (content, size, version, user_id, path, version - 1),
        )
        if cur.rowcount == 0:
            self._conn.rollback()
            raise EditConflictError(
                f"Concurrent edit detected on {path} (expected version {version - 1})"
            )
        self._conn.commit()

    def delete_node(self, user_id: str, path: str) -> None:
        self._conn.execute(
            f"DELETE FROM {self._table} WHERE user_id = ? AND path = ?",
            (user_id, path),
        )
        self._conn.commit()

    def delete_tree(self, user_id: str, path_prefix: str) -> None:
        self._conn.execute(
            f"DELETE FROM {self._table} WHERE user_id = ? AND (path = ? OR path LIKE ?)",
            (user_id, path_prefix, path_prefix + "/%"),
        )
        self._conn.commit()

    def move_node(
        self,
        user_id: str,
        old_path: str,
        new_path: str,
        new_parent: str,
        new_name: str,
    ) -> None:
        self._conn.execute(
            f"UPDATE {self._table} SET path = ?, parent_path = ?, name = ?, "
            "updated_at = datetime('now') WHERE user_id = ? AND path = ?",
            (new_path, new_parent, new_name, user_id, old_path),
        )
        self._conn.commit()

    def move_tree(
        self, user_id: str, old_prefix: str, new_prefix: str
    ) -> None:
        cur = self._conn.execute(
            f"SELECT path, parent_path FROM {self._table} "
            "WHERE user_id = ? AND path LIKE ?",
            (user_id, old_prefix + "/%"),
        )
        rows = cur.fetchall()
        for row in rows:
            new_path = new_prefix + row["path"][len(old_prefix) :]
            new_parent_path = new_prefix + row["parent_path"][len(old_prefix) :]
            self._conn.execute(
                f"UPDATE {self._table} SET path = ?, parent_path = ?, "
                "updated_at = datetime('now') WHERE user_id = ? AND path = ?",
                (new_path, new_parent_path, user_id, row["path"]),
            )
        self._conn.commit()

    def search_content(
        self,
        user_id: str,
        like_pattern: str,
        path_prefix: str | None = None,
    ) -> list[NodeRow]:
        if path_prefix and path_prefix != "/":
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? AND is_dir = 0 "
                "AND content LIKE ? ESCAPE '\\' "
                "AND (path = ? OR path LIKE ?)",
                (user_id, f"%{like_pattern}%", path_prefix, path_prefix + "/%"),
            )
        else:
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? AND is_dir = 0 "
                "AND content LIKE ? ESCAPE '\\'",
                (user_id, f"%{like_pattern}%"),
            )
        return [_row_to_node(r) for r in cur.fetchall()]

    def search_names(
        self,
        user_id: str,
        like_pattern: str,
        path_prefix: str | None = None,
    ) -> list[NodeRow]:
        if path_prefix and path_prefix != "/":
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? "
                "AND name LIKE ? ESCAPE '\\' "
                "AND (path = ? OR path LIKE ?)",
                (user_id, like_pattern, path_prefix, path_prefix + "/%"),
            )
        else:
            cur = self._conn.execute(
                f"SELECT * FROM {self._table} WHERE user_id = ? "
                "AND name LIKE ? ESCAPE '\\'",
                (user_id, like_pattern),
            )
        return [_row_to_node(r) for r in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()
