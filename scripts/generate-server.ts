/**
 * Backend code generation script — copy this into your project's scripts/ folder
 * and fill in the Config section below.
 *
 * Run: bun scripts/generate-server.ts
 */

// ── Config ────────────────────────────────────────────────────────────────────

/** Import path to your generated PrismaClient */
const PRISMA_CLIENT_IMPORT = './generated/prisma/client';

/** Import path to your Prisma singleton (used inside generated handlers) */
const PRISMA_SINGLETON_PATH = '../db/prisma';

/** Import path to your base GraphQL context interface */
const GRAPHQL_CONTEXT_PATH = './graphql.context';

/** Where to write entity files */
const ENTITIES_DIR = 'src/entities';

/** Where to write the combined REST router */
const REST_ROUTER_OUT = 'src/core/rest.router.auto.ts';

/** Where to write the combined GraphQL resolvers */
const GRAPHQL_RESOLVERS_OUT = 'src/core/graphql.resolvers.auto.ts';

/** String fields whose names match these patterns become full-text searchable */
const SEARCHABLE_PATTERNS: RegExp[] = [/name/i, /title/i];

/** Int fields whose names match these patterns are treated as enum-like (filterable with 'equals') */
const ENUM_INT_PATTERNS: RegExp[] = [];

/** Field names excluded from filterable inference */
const SKIP_FILTERABLE: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { DMMFModel } from '@tertium/prisma-codegen/dmmf';
import {
  parsePrismaModels,
  toKebabCase,
  inferEntityMetadata,
  generateEntityTypesContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  generateGraphQLResolversContent,
} from '@tertium/prisma-codegen/server';

function getDMMFModels(): DMMFModel[] {
  const { PrismaClient } = require(join(process.cwd(), PRISMA_CLIENT_IMPORT.replace(/^\.\//, '')));
  const pc = new PrismaClient();
  const runtime = (pc as any)._runtimeDataModel;
  return Object.entries(runtime.models as Record<string, { fields: any[]; dbName?: string | null }>)
    .map(([name, m]) => ({ name, dbName: m.dbName, fields: m.fields }));
}

const dmmfModels = getDMMFModels();
const models = parsePrismaModels(dmmfModels);
const metadata = inferEntityMetadata(dmmfModels, {
  searchableFieldPatterns: SEARCHABLE_PATTERNS,
  enumLikeIntPatterns: ENUM_INT_PATTERNS,
  skipFilterableFields: SKIP_FILTERABLE,
});

console.log(`\n🔄 Generating server code for ${models.length} models...\n`);

// Remove entity dirs that no longer exist in schema
if (existsSync(ENTITIES_DIR)) {
  const activeKebabs = new Set(models.map((m) => toKebabCase(m.name)));
  for (const entry of readdirSync(ENTITIES_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeKebabs.has(entry.name)) {
      rmSync(join(ENTITIES_DIR, entry.name), { recursive: true, force: true });
      console.log(`  ✗ removed ${entry.name}/`);
    }
  }
}

for (const model of models) {
  const kebab = toKebabCase(model.name);
  const dir = join(ENTITIES_DIR, kebab);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, `${kebab}.types.auto.ts`), generateEntityTypesContent(model));
  writeFileSync(
    join(dir, `${kebab}.rest.auto.ts`),
    generateRestHandlerContent(model.name, metadata[model.name] ?? {}, {
      prismaClientPath: PRISMA_SINGLETON_PATH,
    }),
  );

  console.log(`  ✓ entities/${kebab}/`);
}

mkdirSync(REST_ROUTER_OUT.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(REST_ROUTER_OUT, generateRestRouterContent(models, {
  entityImportBase: `../${ENTITIES_DIR.split('/').pop()}`,
}));
console.log(`\n  ✓ ${REST_ROUTER_OUT}`);

mkdirSync(GRAPHQL_RESOLVERS_OUT.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(GRAPHQL_RESOLVERS_OUT, generateGraphQLResolversContent(metadata, dmmfModels, {
  prismaClientPath: PRISMA_CLIENT_IMPORT,
  contextTypePath: GRAPHQL_CONTEXT_PATH,
}));
console.log(`  ✓ ${GRAPHQL_RESOLVERS_OUT}`);

console.log(`\n✅ Done — ${models.length} entities generated.\n`);
