# agent-vfs

Persistent virtual filesystem for AI agents, backed by SQLite or Postgres.

Agents use familiar file operations (`read`, `write`, `ls`, `grep`) while data lives in your database. Multi-tenant, zero config with SQLite, works with any AI SDK.

## Languages

| Language | Package | Install |
|----------|---------|---------|
| TypeScript | [npm](https://www.npmjs.com/package/agent-vfs) | `npm install agent-vfs` |
| Python | [PyPI](https://pypi.org/project/agent-vfs/) | `pip install agent-vfs` |

Both packages share the same database schema, tool definitions, and API design.

## Quick start

**TypeScript**

```ts
import { FileSystem, openDatabase } from "agent-vfs";

const db = await openDatabase("memory.db");
const fs = new FileSystem(db, "agent-1");

await fs.write("/notes.md", "# Meeting Notes\n- Ship agent-vfs");
const content = await fs.read("/notes.md");
```

**Python**

```python
from agent_vfs import FileSystem, open_database

db = open_database("memory.db")
fs = FileSystem(db, "agent-1")

fs.write("/notes.md", "# Meeting Notes\n- Ship agent-vfs")
content = fs.read("/notes.md")
```

## Documentation

- [TypeScript README](ts/README.md) — full API docs, SDK integrations, production setup
- [Python README](python/README.md)
- [Tool Reference](ts/docs/tools.md) — all 11 tool schemas

## License

MIT
