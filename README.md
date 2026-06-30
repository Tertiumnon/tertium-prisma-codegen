# @tertium/prisma-codegen

A code generation library that reads your Prisma schema at runtime and writes TypeScript files. You run it as a script — it outputs `.auto.ts` files that become part of your project. Nothing runs at request time.

---

## How it works

```
Prisma schema
      │
      ▼
  [generate-server.ts]  ──uses──▶  @tertium/prisma-codegen/server
      │
      ├── writes: src/entities/*.types.auto.ts
      ├── writes: src/entities/*.rest.auto.ts
      ├── writes: src/core/rest.router.auto.ts
      ├── writes: src/core/graphql.resolvers.auto.ts
      └── exposes: GET /entities  (EntityMeta JSON)
                        │
                        ▼
              [generate-client.ts]  ──uses──▶  @tertium/prisma-codegen/client
                        │
                        ├── writes: src/entities/*.types.auto.ts
                        ├── writes: src/entities/*.schema.auto.ts
                        └── writes: src/entities/*.client.auto.ts
```

---

## Getting started

Copy the two script templates from this package into your project, then fill in the **Config section** at the top of each file.

```
node_modules/@tertium/prisma-codegen/scripts/generate-server.ts  →  scripts/generate-server.ts
node_modules/@tertium/prisma-codegen/scripts/generate-client.ts  →  scripts/generate-client.ts
```

### Backend

```bash
bun scripts/generate-server.ts
```

Open [scripts/generate-server.ts](./scripts/generate-server.ts) — the config block at the top looks like this:

```ts
const PRISMA_CLIENT_IMPORT  = './generated/prisma/client';
const PRISMA_SINGLETON_PATH = '../db/prisma';
const GRAPHQL_CONTEXT_PATH  = './graphql.context';
const ENTITIES_DIR          = 'src/entities';
const REST_ROUTER_OUT       = 'src/core/rest.router.auto.ts';
const GRAPHQL_RESOLVERS_OUT = 'src/core/graphql.resolvers.auto.ts';
const SEARCHABLE_PATTERNS: RegExp[] = [/name/i, /title/i];
const ENUM_INT_PATTERNS:   RegExp[] = [];
const SKIP_FILTERABLE:     string[] = [];
```

### Frontend

```bash
bun scripts/generate-client.ts --api http://localhost:8080
```

Open [scripts/generate-client.ts](./scripts/generate-client.ts) — the config block at the top looks like this:

```ts
const ENTITIES_DIR        = 'src/entities';
const ENTITY_IMPORT_BASE  = '../../entities';
const GRAPHQL_REQUEST_IMPORT = '../../core/graphql/graphql.client';
const API_TYPES_IMPORT    = '../../core/graphql/graphql.types.auto';
const TABLE_SCHEMA_IMPORT = '../../core/rest/rest.types';
const OPTIONS_SERVICE_IMPORT = '../../core/graphql/graphql.service';
const SKIP_FIELDS         = ['id', 'createdAt', 'updatedAt'];
const LARGE_TEXT_FIELDS:  string[] = [];
// ... output file paths
```

---

## Exposing `/entities` from the backend

The frontend script fetches `EntityMeta` from a running backend endpoint. Add this to your server:

```ts
import { PrismaClient } from './generated/prisma/client';
import { dmmfToEntityMeta } from '@tertium/prisma-codegen/dmmf';

const pc = new PrismaClient();
const runtime = (pc as any)._runtimeDataModel;

const dmmfModels = Object.entries(runtime.models).map(([name, m]: any) =>
  ({ name, dbName: m.dbName, fields: m.fields }));
const dmmfEnums = Object.entries(runtime.enums).map(([name, e]: any) =>
  ({ name, values: e.values }));

const { entities, enums } = dmmfToEntityMeta(dmmfModels, dmmfEnums);

// Return { entities, enums } from GET /entities
```

---

## API reference

### `@tertium/prisma-codegen/dmmf` — types + utilities

**Types:**
| Export | Purpose |
|---|---|
| `DMMFModel`, `DMMFField`, `DMMFEnum`, `FilterMode` | Input types matching `PrismaClient._runtimeDataModel` |
| `EntityMeta`, `FieldMeta`, `EnumMeta` | Shared contract between `/entities` endpoint and frontend script |

**Utilities:**
| Export | Purpose |
|---|---|
| `dmmfToEntityMeta(models, enums)` | Converts DMMF → EntityMeta (use in `/entities` endpoint) |
| `toCamelCase`, `toKebabCase`, `toDisplayName` | String utilities |

### `@tertium/prisma-codegen/server` — backend generators

| Export | Generates |
|---|---|
| `parsePrismaModels(dmmfModels)` | `Model[]` for use with the generators below |
| `inferEntityMetadata(dmmfModels, options)` | Filterable / searchable / relation metadata per model |
| `generateEntityTypesContent(model)` | `*.types.auto.ts` — TypeScript interfaces |
| `generateRestHandlerContent(name, meta, config)` | `*.rest.auto.ts` — 5 CRUD handler functions |
| `generateRestRouterContent(models, config)` | Single router dispatching to all entity handlers |
| `generateGraphQLResolversContent(meta, dmmfModels, config)` | All Query + Mutation resolvers |
| `toKebabCase`, `toCamelCase`, `prismaToTsType` | String utilities |

### `@tertium/prisma-codegen/client` — frontend generators

| Export | Generates |
|---|---|
| `generateClientTypesContent(entity, allEntities, enums, config)` | `*.types.auto.ts` — typed entity interface |
| `generateClientSchemaContent(entity, config)` | `*.schema.auto.ts` — TableSchema for forms |
| `generateGraphQLClientContent(entity, config)` | `*.client.auto.ts` — typed GraphQL CRUD functions |
| `generateClientBarrelContent(entities, config)` | Client barrel (re-exports all CRUD functions) |
| `generateTypesBarrelContent(entities, enums, config)` | Types barrel (utility types + all entity interfaces) |
| `generateSchemasBarrelContent(entities, config)` | Schemas barrel (re-exports all TableSchema instances) |
| `generateEnumsContent(enums)` | Enum declarations from Prisma enum metadata |
