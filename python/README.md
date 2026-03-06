# agent-vfs (Python)

Persistent virtual filesystem for AI agents, backed by SQLite or Postgres.

```bash
pip install agent-vfs
```

```python
from agent_vfs import FileSystem, open_database

db = open_database("memory.db")  # SQLite, auto-creates table
fs = FileSystem(db, "agent-1")

fs.write("/notes.md", "# Meeting Notes\n- Ship agent-vfs")
content = fs.read("/notes.md")
```

For full documentation, see the [main README](../README.md).
