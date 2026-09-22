#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DMMFModel } from '../../dmmf/dmmf.types';
import {
  parsePrismaModels,
  toKebabCase,
  inferEntityMetadata,
  generateEntityTypesContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  generateGraphQLResolversContent,
  generateGraphQLSchemaContent,
} from '../../server/server';
import { DEFAULT_CONFIG } from './generate-server.constants';
import type { ServerGeneratorConfig } from './generate-server.types';

function getArg(name: string, defaultValue?: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    if (defaultValue === undefined) {
      throw new Error(`--${name} is required`);
    }
    return defaultValue;
  }
  return process.argv[idx + 1];
}

function getArgList(name: string, defaultValue: string[] = []): string[] {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    return defaultValue;
  }
  return process.argv[idx + 1].split(',').map((s: string) => s.trim());
}

const config: ServerGeneratorConfig = {
  prismaClientImport: getArg('prisma-client-import', DEFAULT_CONFIG.prismaClientImport),
  prismaSingletonPath: getArg('prisma-singleton-path', DEFAULT_CONFIG.prismaSingletonPath),
  graphqlContextPath: getArg('graphql-context-path', DEFAULT_CONFIG.graphqlContextPath),
  entitiesDir: getArg('entities-dir', DEFAULT_CONFIG.entitiesDir),
  restRouterOut: getArg('rest-router-out', DEFAULT_CONFIG.restRouterOut),
  graphqlResolversOut: getArg('graphql-resolvers-out', DEFAULT_CONFIG.graphqlResolversOut),
  graphqlSchemaOut: getArg('graphql-schema-out', DEFAULT_CONFIG.graphqlSchemaOut),
  searchablePatterns: getArgList('searchable-patterns', DEFAULT_CONFIG.searchablePatterns).map((p) => new RegExp(p, 'i')),
  enumIntPatterns: getArgList('enum-int-patterns', DEFAULT_CONFIG.enumIntPatterns).map((p) => new RegExp(p, 'i')),
  skipFilterable: getArgList('skip-filterable', DEFAULT_CONFIG.skipFilterable),
  orderByPreference: getArgList('order-by-preference', DEFAULT_CONFIG.orderByPreference),
  excludeModels: getArgList('exclude-models', DEFAULT_CONFIG.excludeModels),
  sensitiveFields: getArgList('sensitive-fields', DEFAULT_CONFIG.sensitiveFields),
};

function getDMMFModels(): DMMFModel[] {
  const PrismaClient = config.prismaClientImport.startsWith('.')
    ? require(join(process.cwd(), config.prismaClientImport.replace(/^\.\//, ''))).PrismaClient
    : require(config.prismaClientImport).PrismaClient;
  const pc = new PrismaClient();
  const runtime = (pc as any)._runtimeDataModel;
  return Object.entries(runtime.models as Record<string, { fields: any[]; dbName?: string | null }>).map(([name, m]) => ({
    name,
    dbName: m.dbName,
    fields: m.fields,
  }));
}

// Drop excluded models entirely, and strip any relation field on a remaining
// model that points at one - otherwise e.g. User.RefreshToken would still
// surface a dangling reference to a type that no longer gets generated.
const excludeSet = new Set(config.excludeModels);
const dmmfModels = getDMMFModels()
  .filter((model) => !excludeSet.has(model.name))
  .map((model) => ({
    ...model,
    fields: model.fields.filter((field) => !(field.kind === 'object' && excludeSet.has(field.type))),
  }));
const models = parsePrismaModels(dmmfModels);
const metadata = inferEntityMetadata(dmmfModels, {
  searchableFieldPatterns: config.searchablePatterns,
  enumLikeIntPatterns: config.enumIntPatterns,
  // A sensitive field must not be filterable either - `filter.hash = { contains: 'x' }` would
  // otherwise turn into a substring-matching oracle for a field nothing can read directly.
  skipFilterableFields: [...config.skipFilterable, ...config.sensitiveFields],
  orderByFieldPreference: config.orderByPreference,
});

console.log(`\n🔄 Generating server code for ${models.length} models...\n`);

if (existsSync(config.entitiesDir)) {
  const activeKebabs = new Set(models.map((m) => toKebabCase(m.name)));
  for (const entry of readdirSync(config.entitiesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeKebabs.has(entry.name)) {
      rmSync(join(config.entitiesDir, entry.name), { recursive: true, force: true });
      console.log(`  ✗ removed ${entry.name}/`);
    }
  }
}

for (const model of models) {
  const kebab = toKebabCase(model.name);
  const dir = join(config.entitiesDir, kebab);
  mkdirSync(dir, { recursive: true });

  // Scoped to fields this model actually has - sensitiveFields is a global name list (it may name
  // a field that only exists on one model in the whole schema), and generateRestHandlerContent has
  // no field list of its own to intersect against, so every other model would otherwise get a
  // dead omitSensitive() no-op wired into its handlers for a field it never had.
  const modelFieldNames = new Set(model.fields.map((f) => f.name));
  const modelSensitiveFields = config.sensitiveFields.filter((f) => modelFieldNames.has(f));

  writeFileSync(
    join(dir, `${kebab}.types.auto.ts`),
    generateEntityTypesContent(model, metadata, { sensitiveFields: config.sensitiveFields }),
  );
  writeFileSync(
    join(dir, `${kebab}.rest.auto.ts`),
    generateRestHandlerContent(model.name, metadata[model.name] ?? {}, {
      prismaClientPath: config.prismaSingletonPath,
      sensitiveFields: modelSensitiveFields,
    }),
  );

  console.log(`  ✓ entities/${kebab}/`);
}

mkdirSync(config.restRouterOut.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(
  config.restRouterOut,
  generateRestRouterContent(models, {
    entityImportBase: `../${config.entitiesDir.split('/').pop()}`,
  }),
);
console.log(`\n  ✓ ${config.restRouterOut}`);

mkdirSync(config.graphqlResolversOut.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(
  config.graphqlResolversOut,
  generateGraphQLResolversContent(metadata, dmmfModels, {
    prismaClientPath: config.prismaClientImport,
    contextTypePath: config.graphqlContextPath,
  }),
);
console.log(`  ✓ ${config.graphqlResolversOut}`);

mkdirSync(config.graphqlSchemaOut.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(config.graphqlSchemaOut, generateGraphQLSchemaContent(models, metadata, { sensitiveFields: config.sensitiveFields }));
console.log(`  ✓ ${config.graphqlSchemaOut}`);

console.log(`\n✅ Done — ${models.length} entities generated.\n`);
