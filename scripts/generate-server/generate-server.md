# Backend Code Generation

Generates TypeScript entity types, REST handlers, and GraphQL resolvers from Prisma schema.

## Usage

```bash
bun scripts/generate-server/generate-server.ts [options]
```

## Optional Arguments

All options have sensible defaults based on typical project structures.

### Prisma Configuration

- `--prisma-client-import` - Import path to PrismaClient
  - Default: `./generated/prisma/client`
  - Example: `@prisma/client` for apps that import from npm
- `--prisma-singleton-path` - Import path to Prisma singleton (used inside generated handlers)
  - Default: `../db/prisma`
  - This should point to your database connection wrapper

### GraphQL Configuration

- `--graphql-context-path` - Import path to your GraphQL context interface
  - Default: `./graphql.context`
  - Used in generated resolver type definitions

### Directories & Paths

- `--entities-dir` - Where to write entity files
  - Default: `src/entities`
- `--rest-router-out` - Output path for combined REST router
  - Default: `src/core/rest.router.auto.ts`
- `--graphql-resolvers-out` - Output path for combined GraphQL resolvers
  - Default: `src/core/graphql.resolvers.auto.ts`

### Metadata Configuration

- `--searchable-patterns` - Comma-separated regex patterns for full-text searchable fields
  - Default: `name,title`
  - Fields matching these patterns become filterable with 'contains' mode
  - Example: `name,title,description,plot`
- `--enum-int-patterns` - Comma-separated regex patterns for enum-like int fields
  - Default: (empty)
  - Fields matching these patterns are filterable with 'equals' mode
  - Example: `status,type,category`
- `--skip-filterable` - Comma-separated field names to exclude from filterable inference
  - Default: (empty)
  - Example: `internalNotes,debugInfo`
- `--order-by-preference` - Comma-separated field names for default `orderBy` preference
  - Default: `name,title,createdAt`
  - First matching field is used as default sort; falls back to primary key

## Examples

### Standard project structure

```bash
bun scripts/generate-server/generate-server.ts
```

### Custom directories

```bash
bun scripts/generate-server/generate-server.ts \
  --entities-dir src/generated/entities \
  --rest-router-out src/generated/rest.router.auto.ts \
  --graphql-resolvers-out src/generated/graphql.resolvers.auto.ts
```

### With custom search patterns

```bash
bun scripts/generate-server/generate-server.ts \
  --searchable-patterns name,title,description,plot,notes \
  --enum-int-patterns status,type,priority \
  --order-by-preference title,name,createdAt
```

### With npm-installed Prisma

```bash
bun scripts/generate-server/generate-server.ts \
  --prisma-client-import @prisma/client \
  --prisma-singleton-path ./db/prisma-client
```

## Generated Files

### Per Entity

For each Prisma model, two files are generated:

- `{entity}.types.auto.ts` - TypeScript interfaces for the entity
  - Main interface for querying
  - Input interface for mutations (excludes id, timestamps)
- `{entity}.rest.auto.ts` - REST handler with CRUD operations
  - Filtered queries based on metadata
  - Type-safe request/response handling

### Router Files

- `{restRouterOut}` - Combined REST router
  - Registers all entity endpoints
  - Handles GET, POST, PUT, DELETE
- `{graphqlResolversOut}` - Combined GraphQL resolvers
  - Query resolvers for listing, getting, filtering
  - Mutation resolvers for creating, updating, deleting

## Metadata Inference

The generator automatically infers:

- **Searchable fields**: String fields matching `searchablePatterns` become searchable
- **Filterable fields**: Fields marked as searchable or matching specific patterns become filterable
- **Enum-like fields**: Int fields matching `enumIntPatterns` are filterable with exact match
- **Relations**: Object fields are detected and properly imported
- **Primary key**: Used for get-by-id queries and default sorting

## Configuration via Package.json

Add to `package.json` scripts:

```json
{
  "scripts": {
    "codegen:server": "bun scripts/generate-server/generate-server.ts",
    "codegen": "bun scripts/generate-server/generate-server.ts"
  }
}
```

## Type Definitions

See `generate-server.types.ts` for `ServerGeneratorConfig` interface.

## Constants

See `generate-server.constants.ts` for `DEFAULT_CONFIG` and `CLI_ARGS_HELP`.

## Requirements

- Prisma must be initialized and migrations run
- `prisma generate` must have been run to create the generated client
- Environment variables (`.env`) must be set for database connection
