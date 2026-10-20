# Development

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
    ├── generate-server/
    │   ├── generate-server.ts           # Main script
    │   ├── generate-server.types.ts     # Config interface
    │   ├── generate-server.constants.ts # Defaults
    │   └── generate-server.md           # Documentation
    └── generate-client/
        ├── generate-client.ts           # Main script
        ├── generate-client.types.ts     # Config interface
        ├── generate-client.constants.ts # Defaults
        └── generate-client.md           # Documentation
```

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
