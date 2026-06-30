/**
 * Frontend code generation script — copy this into your project's scripts/ folder
 * and fill in the Config section below.
 *
 * Run: bun scripts/generate-client.ts --api http://localhost:8080
 */

// ── Config ────────────────────────────────────────────────────────────────────

/** Where to write generated entity files */
const ENTITIES_DIR = 'src/entities';

/** Path from entity files back to the entities root (used in cross-entity imports) */
const ENTITY_IMPORT_BASE = '../../entities';

/** Import path for the GraphQL request function */
const GRAPHQL_REQUEST_IMPORT = '../../core/graphql/graphql.client';

/** Import path for the types barrel (ApiList, PaginationInput, etc.) */
const API_TYPES_IMPORT = '../../core/graphql/graphql.types.auto';

/** Import path for the TableSchema type */
const TABLE_SCHEMA_IMPORT = '../../core/rest/rest.types';

/** Import path for the entity options loader service */
const OPTIONS_SERVICE_IMPORT = '../../core/graphql/graphql.service';

/** Where to write the GraphQL client barrel */
const GQL_CLIENT_BARREL_OUT = 'src/core/graphql/graphql.client.auto.ts';

/** Where to write the types barrel */
const GQL_TYPES_BARREL_OUT = 'src/core/graphql/graphql.types.auto.ts';

/** Where to write the enums file */
const GQL_ENUMS_OUT = 'src/core/graphql/graphql.enums.auto.ts';

/** Where to write the schemas barrel */
const SCHEMAS_BARREL_OUT = 'src/core/rest/rest.schemas.auto.ts';

/** Enum import path used inside the types barrel */
const ENUMS_IMPORT = './graphql.enums.auto';

/** Fields excluded from generated forms */
const SKIP_FIELDS = ['id', 'createdAt', 'updatedAt'];

/** Fields rendered as textarea in forms */
const LARGE_TEXT_FIELDS: string[] = [];

// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { EntityMeta, EnumMeta } from '@tertium/prisma-codegen/dmmf';
import {
  generateClientTypesContent,
  generateClientSchemaContent,
  generateGraphQLClientContent,
  generateClientBarrelContent,
  generateTypesBarrelContent,
  generateSchemasBarrelContent,
  generateEnumsContent,
} from '@tertium/prisma-codegen/client';

const apiUrl = (() => {
  const idx = process.argv.indexOf('--api');
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error('--api <url> is required');
  }
  return process.argv[idx + 1];
})();

console.log(`\nFetching entity metadata from ${apiUrl}/entities ...\n`);

const data = await fetch(`${apiUrl}/entities`).then((r) => r.json());
const entities: EntityMeta[] = Array.isArray(data) ? data : data.entities;
const enums: EnumMeta[] = Array.isArray(data) ? [] : (data.enums ?? []);

console.log(`Found ${entities.length} entities and ${enums.length} enums\n`);

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

// Remove entity dirs that no longer exist in the API
if (existsSync(ENTITIES_DIR)) {
  const activeKebabs = new Set(entities.map((e) => e.kebab));
  for (const entry of readdirSync(ENTITIES_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !activeKebabs.has(entry.name)) {
      rmSync(join(ENTITIES_DIR, entry.name), { recursive: true, force: true });
      console.log(`  ✗ removed entities/${entry.name}/`);
    }
  }
}

for (const entity of entities) {
  const dir = join(ENTITIES_DIR, entity.kebab);

  write(join(dir, `${entity.kebab}.types.auto.ts`),
    generateClientTypesContent(entity, entities, enums, {
      entityImportBase: ENTITY_IMPORT_BASE,
      enumsImport: ENUMS_IMPORT,
    }));

  write(join(dir, `${entity.kebab}.schema.auto.ts`),
    generateClientSchemaContent(entity, {
      tableSchemaImport: TABLE_SCHEMA_IMPORT,
      optionsServiceImport: OPTIONS_SERVICE_IMPORT,
      skipFields: SKIP_FIELDS,
      largeTextFields: LARGE_TEXT_FIELDS,
    }));

  write(join(dir, `${entity.kebab}.client.auto.ts`),
    generateGraphQLClientContent(entity, {
      graphqlRequestImport: GRAPHQL_REQUEST_IMPORT,
      apiTypesImport: API_TYPES_IMPORT,
    }));

  console.log(`  ✓ entities/${entity.kebab}/`);
}

write(GQL_CLIENT_BARREL_OUT, generateClientBarrelContent(entities, { entityImportBase: ENTITY_IMPORT_BASE }));
write(GQL_TYPES_BARREL_OUT, generateTypesBarrelContent(entities, enums, { entityImportBase: ENTITY_IMPORT_BASE, enumsImport: ENUMS_IMPORT }));
write(SCHEMAS_BARREL_OUT, generateSchemasBarrelContent(entities, { entityImportBase: ENTITY_IMPORT_BASE }));
write(GQL_ENUMS_OUT, generateEnumsContent(enums));

console.log(`\n  ✓ ${GQL_CLIENT_BARREL_OUT}`);
console.log(`  ✓ ${GQL_TYPES_BARREL_OUT}`);
console.log(`  ✓ ${SCHEMAS_BARREL_OUT}`);
console.log(`  ✓ ${GQL_ENUMS_OUT}`);
console.log(`\n✅ Done — ${entities.length} entities generated.\n`);
