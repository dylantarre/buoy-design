# @ahoybuoy/db

SQLite persistence layer for Buoy using Drizzle ORM.

## Installation

```bash
npm install @ahoybuoy/db
```

## Usage

```typescript
import { createDatabase } from '@ahoybuoy/db';

const db = createDatabase('./buoy.db');
await db.saveComponents(components);
await db.saveDriftSignals(drifts);
```

## Links

- [Buoy CLI](https://www.npmjs.com/package/@ahoybuoy/cli)
- [Documentation](https://buoy.design/docs)
