#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { EntityMeta, EnumMeta } from '../../dmmf/dmmf.types';
import {
  generateClientTypesContent,
  generateClientSchemaContent,
  generateGraphQLClientContent,
  generateClientBarrelContent,
  generateTypesBarrelContent,
  generateSchemasBarrelContent,
  generateEnumsContent,
  generateTableSchemaTypeContent,
} from '../../client/client';
import { DEFAULT_CONFIG } from './generate-client.constants';
import type { ClientGeneratorConfig } from './generate-client.types';

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

const config: ClientGeneratorConfig = {
  apiUrl: getArg('api'),
  entitiesDir: getArg('entities-dir', DEFAULT_CONFIG.entitiesDir),
  entityImportBase: getArg('entity-import-base', DEFAULT_CONFIG.entityImportBase),
  graphqlRequestImport: getArg('graphql-request-import', DEFAULT_CONFIG.graphqlRequestImport),
  apiTypesImport: getArg('api-types-import', DEFAULT_CONFIG.apiTypesImport),
  tableSchemaImport: getArg('table-schema-import', DEFAULT_CONFIG.tableSchemaImport),
  tableSchemaOut: getArg('table-schema-out', DEFAULT_CONFIG.tableSchemaOut),
  optionsServiceImport: getArg('options-service-import', DEFAULT_CONFIG.optionsServiceImport),
  clientBarrelOut: getArg('client-barrel-out', DEFAULT_CONFIG.clientBarrelOut),
  typesBarrelOut: getArg('types-barrel-out', DEFAULT_CONFIG.typesBarrelOut),
  enumsOut: getArg('enums-out', DEFAULT_CONFIG.enumsOut),
  schemasBarrelOut: getArg('schemas-barrel-out', DEFAULT_CONFIG.schemasBarrelOut),
  enumsImport: getArg('enums-import', DEFAULT_CONFIG.enumsImport),
  scalarsImport: getArg('scalars-import', DEFAULT_CONFIG.scalarsImport),
  skipFields: getArgList('skip-fields', DEFAULT_CONFIG.skipFields),
  largeTextFields: getArgList('large-text-fields', DEFAULT_CONFIG.largeTextFields),
  sortFieldPreference: getArgList('sort-field-preference', DEFAULT_CONFIG.sortFieldPreference),
};

console.log(`\nFetching entity metadata from ${config.apiUrl}/entities ...\n`);

const data = (await fetch(`${config.apiUrl}/entities`).then((r) => r.json())) as unknown;
const entities: EntityMeta[] = Array.isArray(data) ? data : (data as any).entities;
const enums: EnumMeta[] = Array.isArray(data) ? [] : ((data as any).enums ?? []);

console.log(`Found ${entities.length} entities and ${enums.length} enums\n`);

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

if (existsSync(config.entitiesDir)) {
  const activeKebabs = new Set(entities.map((e) => e.kebab));
  for (const entry of readdirSync(config.entitiesDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeKebabs.has(entry.name)) {
      rmSync(join(config.entitiesDir, entry.name), { recursive: true, force: true });
      console.log(`  ✗ removed ${entry.name}/`);
    }
  }
}

for (const entity of entities) {
  const dir = join(config.entitiesDir, entity.kebab);

  write(
    join(dir, `${entity.kebab}.types.auto.ts`),
    generateClientTypesContent(entity, entities, enums, {
      entityImportBase: config.entityImportBase,
      enumsImport: config.enumsImport,
      scalarsImport: config.scalarsImport,
    }),
  );

  write(
    join(dir, `${entity.kebab}.schema.auto.ts`),
    generateClientSchemaContent(entity, {
      tableSchemaImport: config.tableSchemaImport,
      optionsServiceImport: config.optionsServiceImport,
      skipFields: config.skipFields,
      largeTextFields: config.largeTextFields,
      sortFieldPreference: config.sortFieldPreference,
    }),
  );

  write(
    join(dir, `${entity.kebab}.client.auto.ts`),
    generateGraphQLClientContent(entity, entities, {
      graphqlRequestImport: config.graphqlRequestImport,
      apiTypesImport: config.apiTypesImport,
    }),
  );

  console.log(`  ✓ entities/${entity.kebab}/`);
}

write(config.clientBarrelOut, generateClientBarrelContent(entities, { entityImportBase: config.entityImportBase }));
write(
  config.typesBarrelOut,
  generateTypesBarrelContent(entities, enums, { entityImportBase: config.entityImportBase, enumsImport: config.enumsImport }),
);
write(config.schemasBarrelOut, generateSchemasBarrelContent(entities, { entityImportBase: config.entityImportBase }));
write(config.enumsOut, generateEnumsContent(enums));
write(config.tableSchemaOut, generateTableSchemaTypeContent());

console.log(`\n  ✓ ${config.clientBarrelOut}`);
console.log(`  ✓ ${config.typesBarrelOut}`);
console.log(`  ✓ ${config.schemasBarrelOut}`);
console.log(`  ✓ ${config.enumsOut}`);
console.log(`  ✓ ${config.tableSchemaOut}`);
console.log(`\n✅ Done — ${entities.length} entities generated.\n`);
