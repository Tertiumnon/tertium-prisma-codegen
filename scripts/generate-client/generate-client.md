# Frontend Code Generation

Generates TypeScript types, GraphQL clients, and table schemas from API entity metadata.

## Usage

```bash
bun scripts/generate-client/generate-client.ts --api <url> [options]
```

## Required Arguments

- `--api <url>` - API endpoint URL for fetching entity metadata (must expose `/entities`)

## Optional Arguments

All options have sensible defaults based on typical project structures.

### Directories & Paths

- `--entities-dir` - Where to write generated entity files (default: `src/entities`)

Entity-to-entity type imports (e.g. `Post` importing `User`) and barrel-to-entities
imports are both computed automatically — there is no `--entity-import-base` flag.
Every entity file lives at `{entities-dir}/{kebab}/`, so a sibling entity is always
exactly one directory level up; barrel files can live anywhere, and their relative
path back to `--entities-dir` is derived from the two real output paths at generation
time. This removes a whole class of "I miscounted the `../`s" bugs.

### Import Paths

- `--graphql-request-import` - Import path for GraphQL request function
  - Default: `../../core/graphql/graphql.client`
- `--api-types-import` - Import path for types barrel (ApiList, PaginationInput, etc.)
  - Default: `../../core/graphql/graphql.types.auto`
- `--table-schema-import` - Import path used by `*.schema.auto.ts` to import the `TableSchema` type
  - Default: `../../core/rest/rest.types.auto`
  - Must resolve to wherever `--table-schema-out` writes the type file
- `--options-service-import` - Import path for entity options loader service
  - Default: `../../core/graphql/graphql.service`
- `--scalars-import` - Import path for Prisma scalar types (DateTime, Decimal, Json)
  - Default: `@prisma/client`
  - Tip: Use a hand-written local module (e.g. `../../core/api/api.scalars`) for frontend projects without Prisma

### Output Paths

- `--client-barrel-out` - Output path for GraphQL client barrel
  - Default: `src/core/graphql/graphql.client.auto.ts`
- `--types-barrel-out` - Output path for types barrel
  - Default: `src/core/graphql/graphql.types.auto.ts`
- `--enums-out` - Output path for enums file
  - Default: `src/core/graphql/graphql.enums.auto.ts`
- `--schemas-barrel-out` - Output path for schemas barrel
  - Default: `src/core/rest/rest.schemas.auto.ts`
- `--table-schema-out` - Output path for the generated `TableSchema` type file
  - Default: `src/core/rest/rest.types.auto.ts`
  - Must match the resolved location of `--table-schema-import`
- `--enums-import` - Enum import path used inside types barrel
  - Default: `./graphql.enums.auto`

### Form Generation

- `--skip-fields` - Comma-separated field names to exclude from forms
  - Default: `id,createdAt,updatedAt`
- `--large-text-fields` - Comma-separated field names to render as textarea
  - Default: (empty)
- `--sort-field-preference` - Comma-separated field names for default sort field
  - Default: `name,title,createdAt`

## Examples

### Standard project structure

```bash
bun scripts/generate-client/generate-client.ts --api http://localhost:8080
```

### Custom directories

```bash
bun scripts/generate-client/generate-client.ts \
  --api http://localhost:8080 \
  --entities-dir src/app/entities
```

### Frontend project with custom scalars

```bash
bun scripts/generate-client/generate-client.ts \
  --api http://localhost:8080 \
  --entities-dir src/app/entities \
  --scalars-import ../../core/api/api.scalars \
  --graphql-request-import ../../core/api/graphql.client \
  --api-types-import ../../core/api/api.types.auto
```

## Generated Files

### Per Entity

For each entity, three files are generated:

- `{entity}.types.auto.ts` - TypeScript interface for the entity
- `{entity}.client.auto.ts` - GraphQL query/mutation functions
- `{entity}.schema.auto.ts` - Table schema definition for forms

### Barrel Files

- `{typesBarrelOut}` - Re-exports all entity types
- `{clientBarrelOut}` - Re-exports all client functions
- `{schemasBarrelOut}` - Re-exports all table schemas
- `{enumsOut}` - All enum definitions from the API
- `{tableSchemaOut}` - `TableSchema`, `TableFieldConfig`, and `EntityOption` type definitions consumed by every `*.schema.auto.ts`

## Configuration via Package.json

Add to `package.json` scripts:

```json
{
  "scripts": {
    "codegen:client": "bun scripts/generate-client/generate-client.ts --api http://localhost:8080",
    "codegen:client:prod": "bun scripts/generate-client/generate-client.ts --api https://api.example.com"
  }
}
```

## Type Definitions

See `generate-client.types.ts` for `ClientGeneratorConfig` interface.

## Constants

See `generate-client.constants.ts` for `DEFAULT_CONFIG` and `CLI_ARGS_HELP`.
