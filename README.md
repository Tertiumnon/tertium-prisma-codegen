# @tertium/prisma-codegen

Universal code generation library for Prisma schemas. Reads your Prisma schema at runtime and generates:
- **REST API handlers** with CRUD operations
- **GraphQL resolvers** with filtering, search, pagination
- **TypeScript types** for all entities
- **Client-side generators** for frontend apps

Single source of truth: your Prisma schema. Everything else is auto-generated.

## Why use this?

- ✅ **Zero manual CRUD code** — all handlers generated from schema
- ✅ **Single definition** — Prisma schema drives everything
- ✅ **Metadata-driven** — filtering, search, relations inferred automatically
- ✅ **Frontend/backend sync** — shared EntityMeta contract
- ✅ **Universal** — no project-specific names or patterns hardcoded

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

## Installation

```bash
npm install @tertium/prisma-codegen
```

## Quick start

### 1. Copy script templates

Copy the two generation scripts into your project:

```bash
cp node_modules/@tertium/prisma-codegen/scripts/generate-server.ts scripts/generate-server.ts
cp node_modules/@tertium/prisma-codegen/scripts/generate-client.ts scripts/generate-client.ts
```

### 2. Generate backend code

Edit `scripts/generate-server.ts` and set your paths:

```ts
const PRISMA_CLIENT_IMPORT  = './generated/prisma/client';
const PRISMA_SINGLETON_PATH = '../db/prisma';
const GRAPHQL_CONTEXT_PATH  = './graphql.context';
const ENTITIES_DIR          = 'src/entities';
const REST_ROUTER_OUT       = 'src/core/rest.router.auto.ts';
const GRAPHQL_RESOLVERS_OUT = 'src/core/graphql.resolvers.auto.ts';

// Customize filtering/search behavior:
const SEARCHABLE_PATTERNS: RegExp[] = [/name/i, /title/i];
const ENUM_INT_PATTERNS:   RegExp[] = [];
const SKIP_FILTERABLE:     string[] = [];
```

Then run:

```bash
bun scripts/generate-server.ts
```

### 3. Expose `/entities` endpoint

Add this to your backend to serve entity metadata:

```ts
import { PrismaClient } from './generated/prisma/client';
import { dmmfToEntityMeta } from '@tertium/prisma-codegen/dmmf/dmmf.utils';

const pc = new PrismaClient();
const runtime = (pc as any)._runtimeDataModel;

const dmmfModels = Object.entries(runtime.models).map(([name, m]: any) =>
  ({ name, dbName: m.dbName, fields: m.fields }));
const dmmfEnums = Object.entries(runtime.enums).map(([name, e]: any) =>
  ({ name, values: e.values }));

const { entities, enums } = dmmfToEntityMeta(dmmfModels, dmmfEnums);

// Return from GET /entities endpoint
```

### 4. Generate frontend code

Edit `scripts/generate-client.ts` and set your paths:

```ts
const ENTITIES_DIR        = 'src/entities';
const ENTITY_IMPORT_BASE  = '../../entities';
const GRAPHQL_REQUEST_IMPORT = '../../core/graphql/graphql.client';
const API_TYPES_IMPORT    = '../../core/graphql/graphql.types.auto';
const TABLE_SCHEMA_IMPORT = '../../core/rest/rest.types';
const OPTIONS_SERVICE_IMPORT = '../../core/graphql/graphql.service';
const SKIP_FIELDS         = ['id', 'createdAt', 'updatedAt'];
```

Then run:

```bash
bun scripts/generate-client.ts --api http://localhost:8080
```

## Library structure

The library uses **direct imports only** — no central barrel files.

```
@tertium/prisma-codegen/
├── dmmf/
│   ├── dmmf.types.ts          # DMMF + EntityMeta types
│   └── dmmf.utils.ts          # Utilities + dmmfToEntityMeta()
├── server/
│   ├── server.types.ts        # Config types
│   ├── server.ts              # Generators
│   └── server.test.ts         # Tests (36 tests)
├── client/
│   ├── client.types.ts        # Config types
│   ├── client.ts              # Generators
│   └── client.test.ts         # Tests (12 tests)
└── scripts/
    ├── generate-server.ts
    └── generate-client.ts
```

## Imports

Import directly from the files you need:

```ts
// Types
import type { DMMFModel, EntityMeta, FieldMeta, EnumMeta } 
  from '@tertium/prisma-codegen/dmmf/dmmf.types';

// Utilities
import { dmmfToEntityMeta, toCamelCase, toKebabCase } 
  from '@tertium/prisma-codegen/dmmf/dmmf.utils';

// Backend generators
import { parsePrismaModels, inferEntityMetadata, generateEntityTypesContent } 
  from '@tertium/prisma-codegen/server/server';

// Frontend generators
import { generateClientTypesContent, generateClientSchemaContent } 
  from '@tertium/prisma-codegen/client/client';
```

## API reference

### `dmmf/dmmf.types.ts` — DMMF and EntityMeta types

| Export | Purpose |
|---|---|
| `DMMFModel`, `DMMFField`, `DMMFEnum` | Prisma runtime data model types |
| `FilterMode` | `'contains' \| 'equals'` for filtering |
| `EntityMeta`, `FieldMeta`, `EnumMeta` | Shared frontend/backend contract |

### `dmmf/dmmf.utils.ts` — Utilities

| Export | Purpose |
|---|---|
| `dmmfToEntityMeta(models, enums)` | Convert DMMF to EntityMeta (for `/entities` endpoint) |
| `toCamelCase(str)` | `PascalCase` → `camelCase` |
| `toKebabCase(str)` | `PascalCase` → `kebab-case` |
| `toDisplayName(str)` | `PascalCase` → `Pascal Case` |

### `server/server.ts` — Backend generators

| Export | Purpose |
|---|---|
| `parsePrismaModels(dmmfModels)` | Parse DMMF models into internal representation |
| `inferEntityMetadata(dmmfModels, options)` | Infer filtering/search/relation metadata |
| `generateEntityTypesContent(model)` | Generate `*.types.auto.ts` |
| `generateRestHandlerContent(name, meta, config)` | Generate `*.rest.auto.ts` (5 CRUD functions) |
| `generateRestRouterContent(models, config)` | Generate REST router dispatching all entities |
| `generateGraphQLResolversContent(meta, dmmfModels, config)` | Generate GraphQL resolvers |

### `client/client.ts` — Frontend generators

| Export | Purpose |
|---|---|
| `generateClientTypesContent(entity, allEntities, enums, config)` | Generate `*.types.auto.ts` |
| `generateClientSchemaContent(entity, config)` | Generate `*.schema.auto.ts` (TableSchema) |
| `generateGraphQLClientContent(entity, config)` | Generate `*.client.auto.ts` (GraphQL CRUD) |
| `generateClientBarrelContent(entities, config)` | Generate client barrel (re-exports all) |
| `generateTypesBarrelContent(entities, enums, config)` | Generate types barrel |
| `generateSchemasBarrelContent(entities, config)` | Generate schemas barrel |
| `generateEnumsContent(enums)` | Generate enum declarations |

## Testing

Run all 48 tests:

```bash
bun test
```

- **server.test.ts** — 36 tests for backend generators
- **client.test.ts** — 12 tests for frontend generators

All tests use generic fixtures (no project-specific names).

## Release

Release scripts use semantic versioning:

```bash
npm run release:patch   # 0.1.0 → 0.1.1
npm run release:minor   # 0.1.0 → 0.2.0
npm run release:major   # 0.1.0 → 1.0.0
```

Each bumps version and publishes to npm.

## License

ISC
