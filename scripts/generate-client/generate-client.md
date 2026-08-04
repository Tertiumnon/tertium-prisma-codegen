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
- `--entity-import-base` - Relative path from entity dir back to entities root (default: `../../entities`)

### Import Paths

- `--graphql-request-import` - Import path for GraphQL request function
  - Default: `../../core/graphql/graphql.client`
- `--api-types-import` - Import path for types barrel (ApiList, PaginationInput, etc.)
  - Default: `../../core/graphql/graphql.types.auto`
- `--table-schema-import` - Import path for TableSchema type
  - Default: `../../core/rest/rest.types`
- `--options-service-import` - Import path for entity options loader service
  - Default: `../../core/graphql/graphql.service`
- `--scalars-import` - Import path for Prisma scalar types (DateTime, Decimal, Json)
  - Default: `@prisma/client`
  - Tip: Use `../../core/generated/api.scalars` for frontend projects without Prisma

### Output Paths

- `--client-barrel-out` - Output path for GraphQL client barrel
  - Default: `src/core/graphql/graphql.client.auto.ts`
- `--types-barrel-out` - Output path for types barrel
  - Default: `src/core/graphql/graphql.types.auto.ts`
- `--enums-out` - Output path for enums file
  - Default: `src/core/graphql/graphql.enums.auto.ts`
- `--schemas-barrel-out` - Output path for schemas barrel
  - Default: `src/core/rest/rest.schemas.auto.ts`
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
  --entities-dir src/app/entities \
  --entity-import-base ..
```

### Frontend project with custom scalars

```bash
bun scripts/generate-client/generate-client.ts \
  --api http://localhost:8080 \
  --entities-dir src/app/entities \
  --entity-import-base .. \
  --scalars-import ../../core/generated/api.scalars \
  --graphql-request-import ../../core/api/graphql.client \
  --api-types-import ../../core/generated/api.types.auto
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
