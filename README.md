# @tertium/prisma-codegen

Generates TypeScript types, GraphQL resolvers, and REST API handlers from Prisma's runtime data model. Everything is pure string output — no I/O, no framework dependencies, no opinions about how you run your server.

## Modules

Each module is imported directly — there is no barrel export.

| Import path | Exports |
|---|---|
| `@tertium/prisma-codegen/types` | All shared TypeScript types |
| `@tertium/prisma-codegen/schema-parser` | DMMF mapping and string utilities |
| `@tertium/prisma-codegen/metadata-inferrer` | Auto-infer entity metadata from DMMF models |
| `@tertium/prisma-codegen/types-generator` | Generate `*.types.auto.ts` files |
| `@tertium/prisma-codegen/graphql/metadata-generator` | Generate GraphQL context and metadata files |
| `@tertium/prisma-codegen/graphql/resolvers-generator` | Generate GraphQL resolver file |
| `@tertium/prisma-codegen/rest/handler-generator` | Generate per-entity REST handler files |
| `@tertium/prisma-codegen/rest/router-generator` | Generate main REST router file |

---

## Quick start

The library works from Prisma's runtime data model — no schema file parsing, no regex. Instantiate `PrismaClient` to get the structured model data, then pass it to the generators.

```ts
import { writeFileSync } from 'fs';
import { PrismaClient } from './generated/prisma/client';
import { parsePrismaModels, toKebabCase } from '@tertium/prisma-codegen/schema-parser';
import { inferEntityMetadata } from '@tertium/prisma-codegen/metadata-inferrer';
import { generateEntityTypesContent } from '@tertium/prisma-codegen/types-generator';
import { generateRestHandlerContent } from '@tertium/prisma-codegen/rest/handler-generator';
import { generateRestRouterContent } from '@tertium/prisma-codegen/rest/router-generator';
import { generateGraphQLResolversContent } from '@tertium/prisma-codegen/graphql/resolvers-generator';
import type { DMMFModel } from '@tertium/prisma-codegen/types';

function getDMMFModels(): DMMFModel[] {
  const pc = new PrismaClient();
  const runtimeModels = (pc as any)._runtimeDataModel.models as Record<string, { fields: any[]; dbName?: string | null }>;
  return Object.entries(runtimeModels).map(([name, m]) => ({ name, dbName: m.dbName, fields: m.fields }));
}

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

> **No DB connection is opened.** `_runtimeDataModel` is populated from the generated client bundle at construction time.

---

## types

Shared types used across the library.

```ts
import type { DMMFModel, DMMFField, Model, Field, EntityMetadata, ... } from '@tertium/prisma-codegen/types';
```

### DMMF input types

These are compatible with Prisma's `_runtimeDataModel.models` structure:

```ts
type DMMFField = {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;               // 'String', 'Int', 'Author', …
  isRequired: boolean;
  isList: boolean;
  isId: boolean;
  relationName?: string;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};

type DMMFModel = {
  name: string;
  dbName?: string | null;
  fields: readonly DMMFField[];
};
```

---

## schema-parser

Maps Prisma's runtime model data to the library's own `Model` / `Field` types, and exposes string utilities.

```ts
import {
  parsePrismaModels,
  parseForeignKeys,
  toKebabCase,
  toCamelCase,
  prismaToTsType,
} from '@tertium/prisma-codegen/schema-parser';
```

### `parsePrismaModels(dmmfModels)`

Returns `Model[]` — one entry per model, with scalar and relation fields mapped.

```ts
type Model = {
  name: string;
  dbName?: string;
  fields: Field[];
};

type Field = {
  name: string;
  type: string;       // Prisma scalar type or related model name
  required: boolean;
  isId: boolean;
  isRelation: boolean; // true when kind === 'object'
  isArray: boolean;
};
```

### `parseForeignKeys(dmmfModel)`

Returns `ForeignKeyField[]` — owning-side relation fields with their FK scalar name. Used by the resolver generator to produce Prisma `connect` transforms.

```ts
type ForeignKeyField = {
  fieldName: string;    // 'authorId'
  relationName: string; // 'Author'
  isRequired: boolean;
};
```

### Utilities

| Function | Example |
|---|---|
| `toKebabCase('UserProfile')` | `'user-profile'` |
| `toCamelCase('UserProfile')` | `'userProfile'` |
| `prismaToTsType('DateTime')` | `'Date'` |

---

## metadata-inferrer

Derives `EntityMetadata` for all models using field-name and field-type heuristics. The metadata controls what filtering, search, relations, and ordering the generators emit.

```ts
import { inferEntityMetadata } from '@tertium/prisma-codegen/metadata-inferrer';

const metadata = inferEntityMetadata(dmmfModels, options?);
```

### Heuristics

| Field kind / pattern | Inferred as |
|---|---|
| `scalar` `String` (non-ID) | `filterable: 'contains'` |
| Matches a `searchableFieldPatterns` pattern | also added to `searchableFields` |
| `scalar` field name ends with `Id` | `filterable: 'equals'` |
| `scalar` `Boolean` | `filterable: 'equals'` |
| `scalar` `Int` matching an `enumLikeIntPatterns` pattern | `filterable: 'equals'` |
| `object` kind (relation) | added to `includeRelations` |
| `orderBy` | prefers `name`, then `title`, then `createdAt` |

### Options

There are no default patterns — the caller defines all project-specific heuristics:

```ts
type MetadataInferrerOptions = {
  skipFilterableFields?: string[];    // exclude specific field names from filterable inference
  searchableFieldPatterns?: RegExp[]; // field names matching these become searchableFields
  enumLikeIntPatterns?: RegExp[];     // Int field names matching these get filterable 'equals'
};
```

### Output

```ts
type EntityMetadata = {
  filterable?: Record<string, 'contains' | 'equals'>;
  searchableFields?: string[];
  includeRelations?: string[];
  orderBy?: string;
};
```

---

## types-generator

Generates a `{entity}.types.auto.ts` file with a read model interface and a create/update input interface.

```ts
import { generateEntityTypesContent } from '@tertium/prisma-codegen/types-generator';

writeFileSync(path, generateEntityTypesContent(model, options?));
```

```ts
type TypesGeneratorOptions = {
  skipInputFields?: string[]; // default: ['id', 'createdAt', 'updatedAt']
};
```

**Output example** for an `Author` model:

```ts
export interface Author {
  id: string;
  name: string;
  bio?: string;
  categoryId?: string;
}

export interface AuthorInput {
  name: string;
  bio?: string;
  categoryId?: string;
}
```

---

## graphql/metadata-generator

Generates two supporting files for GraphQL.

```ts
import {
  generateGraphQLMetadataFileContent,
  generateGraphQLContextTypesContent,
} from '@tertium/prisma-codegen/graphql/metadata-generator';
```

### `generateGraphQLMetadataFileContent(metadata)`

Outputs a `*.constants.auto.ts` file that re-exports the inferred metadata as a typed constant — useful for runtime resolver configuration.

### `generateGraphQLContextTypesContent(extraFields?)`

Outputs a `*.types.auto.ts` file with a base `GraphQLResolverContext` interface:

```ts
export interface GraphQLResolverContext {
  userId?: string;
  isAdmin?: boolean;
  userRoles?: string[];
}
```

Pass `extraFields` as `Record<string, string>` to inject additional typed properties:

```ts
generateGraphQLContextTypesContent({ tenant: 'string' });
// → tenant?: string;
```

---

## graphql/resolvers-generator

Generates a single file with Query and Mutation resolvers for every model in `metadata`.

```ts
import { generateGraphQLResolversContent } from '@tertium/prisma-codegen/graphql/resolvers-generator';

writeFileSync(path, generateGraphQLResolversContent(metadata, dmmfModels, config));
```

`dmmfModels` is used to derive FK-to-relation transforms. Each model gets:

- `{model}` — find by ID (UUID validated)
- `{model}List` — paginated list with dynamic filtering and full-text search
- `create{Model}` — create with FK → `connect` transform
- `update{Model}` — update with FK → `connect` transform
- `delete{Model}` — delete by ID

### Config

```ts
type GraphQLResolverConfig = {
  prismaClientPath: string;    // import path for PrismaClient
  prismaClientExport?: string; // default: 'PrismaClient'
  contextTypePath: string;     // import path for base context interface
  contextTypeExport?: string;  // default: 'GraphQLResolverContext'
  localization?: LocalizationConfig;
};
```

### Localization

Optional. When provided, each resolver accepts a `lang?: string` argument and passes each entity through the consumer-supplied function.

```ts
type LocalizationConfig = {
  localizeImport: string;  // path to a module exporting the localize function
  localizeExport?: string; // default: 'localizeEntity'
};
```

The generated code calls:

```ts
await localizeEntity(entity, 'ModelName', lang)
```

Required signature in your module:

```ts
async function localizeEntity(entity: any, modelName: string, lang: string): Promise<any>
```

All localization logic (which fields to translate, fallback language, translation lookup) lives entirely in your function.

---

## rest/handler-generator

Generates a `{entity}.rest.auto.ts` file with five CRUD handler functions.

```ts
import { generateRestHandlerContent } from '@tertium/prisma-codegen/rest/handler-generator';

writeFileSync(path, generateRestHandlerContent(modelName, metadata, config));
```

Generated function signatures:

```ts
list{Model}s(req: Request, lang?: string): Promise<Response>
get{Model}(id: string, lang?: string): Promise<Response>
create{Model}(req: Request): Promise<Response>
update{Model}(id: string, req: Request): Promise<Response>
delete{Model}(id: string): Promise<Response>
```

`lang` is an explicit parameter — the handler does not extract it from the request. Language detection belongs in the router (see [rest/router-generator](#restrouter-generator)).

All handlers validate UUID format and return `Content-Type: application/json` responses. List endpoints support `?limit`, `?offset`, `?search`, and `?filter.{field}` query params derived from metadata.

### Config

```ts
type RestHandlerConfig = {
  prismaClientPath: string;       // import path for the Prisma client singleton
  localization?: LocalizationConfig;
};
```

### Localization

Optional. When provided, list and get handlers receive `lang?` and pass each entity through your function:

```ts
type LocalizationConfig = {
  localizeImport: string;  // path to a module exporting the localize function
  localizeExport?: string; // default: 'localizeEntity'
};
```

The generated code calls:

```ts
// in list:
const localizedData = lang
  ? await Promise.all(data.map(item => localizeEntity(item, 'ModelName', lang)))
  : data;

// in get:
if (data && lang) return localizeEntity(data, 'ModelName', lang);
```

---

## rest/router-generator

Generates a single `router.auto.ts` file that exports `handleRestRequest(req)`. It dispatches to entity handlers based on `/api/{entity}/{id?}`.

```ts
import { generateRestRouterContent } from '@tertium/prisma-codegen/rest/router-generator';

writeFileSync(path, generateRestRouterContent(models, config));
```

### Config

```ts
type RestRouterConfig = {
  entityImportBase: string;  // relative path from the router file to the entities directory
  extraImports?: string;     // raw import statements injected at the top
  extraRoutes?: string;      // raw route-matching code inserted before entity dispatch
  extraHelpers?: string;     // raw helper functions appended at the bottom
  localization?: {
    getLangImport: string;   // path to a module exporting the lang-extraction function
    getLangExport?: string;  // default: 'getLanguageFromRequest'
  };
};
```

### Localization

When `localization` is set, the router extracts the language **once per request** before dispatching, then passes it as `lang` to all list and get handlers:

```ts
const lang = getLanguageFromRequest(req);
// …
if (entity === 'authors') {
  if (method === 'GET' && !id) return await authorRest.listAuthors(req, lang);
  if (method === 'GET' && id)  return await authorRest.getAuthor(id, lang);
  // create / update / delete do not receive lang
}
```

Required signature in your module:

```ts
function getLanguageFromRequest(req: Request): string
```

### Adding custom routes

Use `extraImports`, `extraRoutes`, and `extraHelpers` to inject project-specific routes without modifying the generator:

```ts
generateRestRouterContent(models, {
  entityImportBase: '../entities',
  extraImports: `import { handleAuth } from './auth.handler';`,
  extraRoutes: `
  const authMatch = pathname.match(/^\\/api\\/auth\\/(.+)$/);
  if (authMatch) return handleAuth(method, authMatch[1], req);`,
});
```

`extraRoutes` is matched **before** the entity dispatch block, so custom routes take priority.
