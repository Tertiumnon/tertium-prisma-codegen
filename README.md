# @tertium/prisma-codegen

Generates TypeScript types, GraphQL resolvers, REST API handlers, and frontend client code from Prisma's runtime data model. Pure string output — no I/O, no framework dependencies.

## Three imports

```ts
import type { DMMFModel, EntityMeta }   from '@tertium/prisma-codegen';        // shared types
import { inferEntityMetadata, ... }     from '@tertium/prisma-codegen/server';  // backend generators
import { generateClientTypesContent, ... } from '@tertium/prisma-codegen/client'; // frontend generators
```

---

## Getting DMMF models

All generators take Prisma's runtime data model as input. No DB connection is opened — `_runtimeDataModel` is populated from the generated client bundle at construction time.

```ts
import { PrismaClient } from './generated/prisma/client';
import type { DMMFModel } from '@tertium/prisma-codegen';

function getDMMFModels(): DMMFModel[] {
  const pc = new PrismaClient();
  const runtime = (pc as any)._runtimeDataModel;
  return Object.entries(runtime.models as Record<string, { fields: any[]; dbName?: string | null }>)
    .map(([name, m]) => ({ name, dbName: m.dbName, fields: m.fields }));
}
```

---

## `@tertium/prisma-codegen` — shared types

```ts
import type { DMMFModel, DMMFField, DMMFEnum } from '@tertium/prisma-codegen';
import type { EntityMeta, FieldMeta, EnumMeta } from '@tertium/prisma-codegen';
import { dmmfToEntityMeta } from '@tertium/prisma-codegen';
```

### `dmmfToEntityMeta(dmmfModels, dmmfEnums)`

Converts Prisma's runtime model data into `EntityMeta[]` and `EnumMeta[]`. Used by the backend `/entities` endpoint to serve metadata to the frontend generator.

```ts
const { entities, enums } = dmmfToEntityMeta(dmmfModels, dmmfEnums);
```

`EntityMeta` fields: `name`, `camel`, `kebab`, `displayName`, `fields: FieldMeta[]`

`FieldMeta` fields: `name`, `prismaType`, `tsType`, `formType`, `required`, `isPrimary`, `isRelation`, `isArray`, `relationModel`

---

## `@tertium/prisma-codegen/server` — backend generators

```ts
import {
  // Schema parsing
  parsePrismaModels, parseForeignKeys, toKebabCase, toCamelCase, prismaToTsType,
  // Metadata
  inferEntityMetadata,
  // Generators
  generateEntityTypesContent,
  generateGraphQLMetadataFileContent, generateGraphQLContextTypesContent,
  generateGraphQLResolversContent,
  generateRestHandlerContent, generateRestRouterContent,
} from '@tertium/prisma-codegen/server';
```

### Typical backend generation script

```ts
import { writeFileSync } from 'fs';
import { PrismaClient } from './generated/prisma/client';
import type { DMMFModel } from '@tertium/prisma-codegen';
import {
  parsePrismaModels, toKebabCase,
  inferEntityMetadata,
  generateEntityTypesContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  generateGraphQLResolversContent,
} from '@tertium/prisma-codegen/server';

const dmmfModels = getDMMFModels();
const models = parsePrismaModels(dmmfModels);
const metadata = inferEntityMetadata(dmmfModels, {
  searchableFieldPatterns: [/name/i, /title/i],
  enumLikeIntPatterns: [/Rank/i, /Level/i],
});

for (const model of models) {
  const kebab = toKebabCase(model.name);
  writeFileSync(`src/entities/${kebab}.types.auto.ts`, generateEntityTypesContent(model));
  writeFileSync(`src/entities/${kebab}.rest.auto.ts`, generateRestHandlerContent(model.name, metadata[model.name] ?? {}, {
    prismaClientPath: '../db/prisma',
  }));
}

writeFileSync('src/router.auto.ts', generateRestRouterContent(models, { entityImportBase: '../entities' }));
writeFileSync('src/resolvers.auto.ts', generateGraphQLResolversContent(metadata, dmmfModels, {
  prismaClientPath: '../../generated/prisma/client',
  contextTypePath: './context',
}));
```

### `inferEntityMetadata(dmmfModels, options?)`

Derives filterable fields, searchable fields, relations, and default sort from field names and types. No defaults — the caller defines all project-specific patterns.

```ts
type MetadataInferrerOptions = {
  skipFilterableFields?: string[];    // exclude specific fields from filterable inference
  searchableFieldPatterns?: RegExp[]; // field names matching these become full-text searchable
  enumLikeIntPatterns?: RegExp[];     // Int fields matching these get filterable 'equals'
};
```

### `generateGraphQLResolversContent(metadata, dmmfModels, config)`

Each model gets: `{model}` (by ID), `{model}List` (paginated + filtered), `create{Model}`, `update{Model}`, `delete{Model}`.

```ts
type GraphQLResolverConfig = {
  prismaClientPath: string;
  prismaClientExport?: string;  // default: 'PrismaClient'
  contextTypePath: string;
  contextTypeExport?: string;   // default: 'GraphQLResolverContext'
  localization?: LocalizationConfig;
};
```

### `generateRestHandlerContent(modelName, metadata, config)`

Five CRUD handler functions per entity. List endpoints support `?limit`, `?offset`, `?search`, `?filter.{field}`.

```ts
type RestHandlerConfig = {
  prismaClientPath: string;
  localization?: LocalizationConfig;
};
```

### `generateRestRouterContent(models, config)`

Single router file dispatching to entity handlers based on `/api/{entity}/{id?}`.

```ts
type RestRouterConfig = {
  entityImportBase: string;
  extraImports?: string;   // injected at top
  extraRoutes?: string;    // matched before entity dispatch
  extraHelpers?: string;   // appended at bottom
  localization?: {
    getLangImport: string;
    getLangExport?: string; // default: 'getLanguageFromRequest'
  };
};
```

### Localization

Optional for both GraphQL and REST. When provided, list/get handlers receive `lang?` and pass entities through your function:

```ts
type LocalizationConfig = {
  localizeImport: string;
  localizeExport?: string; // default: 'localizeEntity'
};

// Required function signature in your module:
async function localizeEntity(entity: any, modelName: string, lang: string): Promise<any>
```

---

## `@tertium/prisma-codegen/client` — frontend generators

Used by a frontend script that fetches `EntityMeta[]` from the backend `/entities` endpoint and generates client code.

```ts
import {
  generateClientTypesContent,   // {entity}.types.auto.ts
  generateClientSchemaContent,  // {entity}.schema.auto.ts
  generateGraphQLClientContent, // {entity}.client.auto.ts
  generateClientBarrelContent,  // api-graphql.client.auto.ts
  generateTypesBarrelContent,   // api-graphql.types.auto.ts
  generateSchemasBarrelContent, // api-rest.schemas.auto.ts
  generateEnumsContent,         // api-graphql.enums.auto.ts
} from '@tertium/prisma-codegen/client';
```

### Typical frontend generation script

```ts
import type { EntityMeta, EnumMeta } from '@tertium/prisma-codegen';
import {
  generateClientTypesContent, generateClientSchemaContent, generateGraphQLClientContent,
  generateClientBarrelContent, generateTypesBarrelContent, generateSchemasBarrelContent, generateEnumsContent,
} from '@tertium/prisma-codegen/client';

const { entities, enums } = await fetch(`${API_URL}/entities`).then(r => r.json());

for (const entity of entities) {
  write(`src/entities/${entity.kebab}/${entity.kebab}.types.auto.ts`,
    generateClientTypesContent(entity, entities, enums, {
      entityImportBase: '../../entities',
      enumsImport: '../../core/api-graphql/api-graphql.enums.auto',
    }));

  write(`src/entities/${entity.kebab}/${entity.kebab}.schema.auto.ts`,
    generateClientSchemaContent(entity, {
      tableSchemaImport: '../../core/api-rest/api-rest.types',
      optionsServiceImport: '../../core/api-graphql/api-graphql.service',
      skipFields: ['id', 'createdAt', 'updatedAt'],
      largeTextFields: ['summary', 'details'],
    }));

  write(`src/entities/${entity.kebab}/${entity.kebab}.client.auto.ts`,
    generateGraphQLClientContent(entity, {
      graphqlRequestImport: '../../core/api-graphql/api-graphql.client',
      apiTypesImport: '../../core/api-graphql/api-graphql.types.auto',
    }));
}

write('src/core/api-graphql/api-graphql.client.auto.ts',
  generateClientBarrelContent(entities, { entityImportBase: '../../entities' }));

write('src/core/api-graphql/api-graphql.types.auto.ts',
  generateTypesBarrelContent(entities, enums, {
    entityImportBase: '../../entities',
    enumsImport: './api-graphql.enums.auto',
  }));

write('src/core/api-rest/api-rest.schemas.auto.ts',
  generateSchemasBarrelContent(entities, { entityImportBase: '../../entities' }));

write('src/core/api-graphql/api-graphql.enums.auto.ts',
  generateEnumsContent(enums));
```

### Config types

```ts
type ClientTypesConfig = {
  entityImportBase: string; // path from the entity file to the entities root
  enumsImport: string;      // path to the enums barrel
};

type ClientSchemaConfig = {
  tableSchemaImport: string;         // path to TableSchema type
  optionsServiceImport: string;      // path to options loader service
  optionsServiceExport?: string;     // default: 'fetchAllEntityOptions'
  skipFields?: string[];             // fields excluded from form (e.g. ['id', 'createdAt'])
  largeTextFields?: string[];        // fields rendered as textarea (e.g. ['summary', 'details'])
};

type GraphQLClientConfig = {
  graphqlRequestImport: string;
  graphqlRequestExport?: string;     // default: 'graphqlRequest'
  apiTypesImport: string;
};
```

### `generateTypesBarrelContent` output includes

```ts
export interface ApiList<T> { data: T[]; total: number; }
export interface PaginationInput { limit?: number; offset?: number; }
export interface SortInput { field: string; direction: 'ASC' | 'DESC'; }
export interface EntityOption { value: string; label: string; }
export interface EntityOptionsPage { options: EntityOption[]; total: number; hasMore: boolean; }
export interface EntityItem { id: string; title?: string; name?: string; }
// + all entity type re-exports
// + enum re-exports (when enumsImport is provided)
```
