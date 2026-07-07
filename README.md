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

## What is DMMF?

DMMF (Data Model Meta Format) is Prisma's internal runtime representation of your schema. It is available at runtime without a database connection via `PrismaClient._runtimeDataModel` and contains every model, field, relation, and enum from your `schema.prisma`.

This library reads DMMF instead of parsing `.prisma` files directly — which means it works with the already-compiled Prisma client and never touches the schema file at runtime.

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

## Import Rule

**Always use explicit subpath imports.** No default export.

- `@tertium/prisma-codegen/dmmf` → types
- `@tertium/prisma-codegen/dmmf/dmmf.utils` → utilities  
- `@tertium/prisma-codegen/server` → backend generators
- `@tertium/prisma-codegen/client` → frontend generators

This makes imports clear and prevents ambiguity.

## Imports

Use package subpath exports — one import per module:

```ts
// DMMF + EntityMeta types
import type { DMMFModel, DMMFField, DMMFEnum, EntityMeta, FieldMeta, EnumMeta, FilterMode }
  from '@tertium/prisma-codegen/dmmf';

// DMMF utilities
import { dmmfToEntityMeta, toCamelCase, toKebabCase, toDisplayName }
  from '@tertium/prisma-codegen/dmmf/dmmf.utils';

// Backend generators
import { parsePrismaModels, inferEntityMetadata, generateEntityTypesContent,
         generateRestHandlerContent, generateRestRouterContent,
         generateGraphQLResolversContent, generateGraphQLMetadataFileContent,
         generateGraphQLContextTypesContent }
  from '@tertium/prisma-codegen/server';

// Backend config types
import type { GraphQLResolverConfig, RestHandlerConfig, RestRouterConfig,
              MetadataInferrerOptions, LocalizationConfig }
  from '@tertium/prisma-codegen/server/server.types';

// Frontend generators
import { generateClientTypesContent, generateClientSchemaContent,
         generateGraphQLClientContent, generateClientBarrelContent,
         generateTypesBarrelContent, generateSchemasBarrelContent,
         generateEnumsContent }
  from '@tertium/prisma-codegen/client';

// Frontend config types
import type { ClientTypesConfig, ClientSchemaConfig, GraphQLClientConfig,
              ClientBarrelConfig, TypesBarrelConfig, SchemasBarrelConfig }
  from '@tertium/prisma-codegen/client/client.types';
```

## API reference

### `@tertium/prisma-codegen/dmmf` — DMMF and EntityMeta types

| Export | Purpose |
|---|---|
| `DMMFModel`, `DMMFField`, `DMMFEnum` | Prisma runtime data model input types |
| `FilterMode` | `'contains' \| 'equals'` |
| `EntityMeta`, `FieldMeta`, `EnumMeta` | Shared frontend/backend contract (served by `/entities`) |

### `@tertium/prisma-codegen/dmmf/dmmf.utils` — Utilities

| Export | Purpose |
|---|---|
| `dmmfToEntityMeta(models, enums)` | Convert DMMF to `{ entities, enums }` (for `/entities` endpoint) |
| `toCamelCase(str)` | `PascalCase` → `camelCase` |
| `toKebabCase(str)` | `PascalCase` → `kebab-case` |
| `toDisplayName(str)` | `PascalCase` → `Pascal Case` |
| `scalarTsType(prismaType, required)` | Map Prisma scalar type to TypeScript type string |
| `scalarFormType(prismaType, fieldName)` | Map Prisma scalar type to form field type string |
| `mapField(field, fkRelationMap)` | Convert a `DMMFField` to `FieldMeta` |
| `buildFkRelationMap(model)` | Build foreign-key → relation-model map for a model |

### `@tertium/prisma-codegen/server` — Backend generators

| Export | Purpose |
|---|---|
| `parsePrismaModels(dmmfModels)` | Parse DMMF models into internal `Model[]` |
| `parseForeignKeys(dmmfModel)` | Extract foreign key fields from a model |
| `inferEntityMetadata(dmmfModels, options)` | Infer filterable/searchable/relation metadata |
| `generateEntityTypesContent(model, options?)` | Generate `*.types.auto.ts` |
| `generateRestHandlerContent(name, meta, config)` | Generate `*.rest.auto.ts` (5 CRUD handlers) |
| `generateRestRouterContent(models, config)` | Generate REST router dispatching all entities |
| `generateGraphQLResolversContent(meta, dmmfModels, config)` | Generate GraphQL resolvers |
| `generateGraphQLMetadataFileContent(metadata)` | Generate `GRAPHQL_ENTITY_METADATA` constants file |
| `generateGraphQLContextTypesContent(extraFields?)` | Generate GraphQL context type interface |

### `@tertium/prisma-codegen/server/server.types` — Backend config types

| Export | Purpose |
|---|---|
| `MetadataInferrerOptions` | Options for `inferEntityMetadata()` |
| `LocalizationConfig` | Localization import/export paths |
| `GraphQLResolverConfig` | Config for `generateGraphQLResolversContent()` |
| `RestHandlerConfig` | Config for `generateRestHandlerContent()` |
| `RestRouterConfig` | Config for `generateRestRouterContent()` |
| `EntityMetadata` | Internal metadata shape (filterable, searchable, relations) |
| `Field`, `Model`, `ForeignKeyField` | Internal parsed model types |

### `@tertium/prisma-codegen/client` — Frontend generators

| Export | Purpose |
|---|---|
| `generateClientTypesContent(entity, allEntities, enums, config)` | Generate `*.types.auto.ts` |
| `generateClientSchemaContent(entity, config)` | Generate `*.schema.auto.ts` (TableSchema) |
| `generateGraphQLClientContent(entity, config)` | Generate `*.client.auto.ts` (GraphQL CRUD) |
| `generateClientBarrelContent(entities, config)` | Generate client barrel |
| `generateTypesBarrelContent(entities, enums, config)` | Generate types barrel |
| `generateSchemasBarrelContent(entities, config)` | Generate schemas barrel |
| `generateEnumsContent(enums)` | Generate enum declarations |

### `@tertium/prisma-codegen/client/client.types` — Frontend config types

| Export | Purpose |
|---|---|
| `ClientTypesConfig` | Config for `generateClientTypesContent()` |
| `ClientSchemaConfig` | Config for `generateClientSchemaContent()` |
| `GraphQLClientConfig` | Config for `generateGraphQLClientContent()` |
| `ClientBarrelConfig` | Config for `generateClientBarrelContent()` |
| `TypesBarrelConfig` | Config for `generateTypesBarrelContent()` |
| `SchemasBarrelConfig` | Config for `generateSchemasBarrelContent()` |

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
