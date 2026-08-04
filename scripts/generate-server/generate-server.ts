#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { DMMFModel } from '../../dmmf/dmmf.types';
import {
  parsePrismaModels,
  toKebabCase,
  inferEntityMetadata,
  generateEntityTypesContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  generateGraphQLResolversContent,
} from '../../server';
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
  searchablePatterns: getArgList('searchable-patterns', DEFAULT_CONFIG.searchablePatterns).map((p) => new RegExp(p, 'i')),
  enumIntPatterns: getArgList('enum-int-patterns', DEFAULT_CONFIG.enumIntPatterns).map((p) => new RegExp(p, 'i')),
  skipFilterable: getArgList('skip-filterable', DEFAULT_CONFIG.skipFilterable),
  orderByPreference: getArgList('order-by-preference', DEFAULT_CONFIG.orderByPreference),
};

function getDMMFModels(): DMMFModel[] {
  let PrismaClient;
  if (config.prismaClientImport.startsWith('.')) {
    PrismaClient = require(join(process.cwd(), config.prismaClientImport.replace(/^\.\//, ''))).PrismaClient;
  } else {
    PrismaClient = require(config.prismaClientImport).PrismaClient;
  }
  const pc = new PrismaClient();
  const runtime = (pc as any)._runtimeDataModel;
  return Object.entries(runtime.models as Record<string, { fields: any[]; dbName?: string | null }>).map(([name, m]) => ({
    name,
    dbName: m.dbName,
    fields: m.fields,
  }));
}

const dmmfModels = getDMMFModels();
const models = parsePrismaModels(dmmfModels);
const metadata = inferEntityMetadata(dmmfModels, {
  searchableFieldPatterns: config.searchablePatterns,
  enumLikeIntPatterns: config.enumIntPatterns,
  skipFilterableFields: config.skipFilterable,
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

  writeFileSync(join(dir, `${kebab}.types.auto.ts`), generateEntityTypesContent(model));
  writeFileSync(
    join(dir, `${kebab}.rest.auto.ts`),
    generateRestHandlerContent(model.name, metadata[model.name] ?? {}, {
      prismaClientPath: config.prismaSingletonPath,
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

console.log(`\n✅ Done — ${models.length} entities generated.\n`);
