import type { EntityMeta, EnumMeta } from '../entity-meta';

export interface ClientBarrelConfig {
  /** Base path from the barrel file to the entities directory, e.g. '../../entities' */
  entityImportBase: string;
}

export interface TypesBarrelConfig {
  /** Base path from the barrel file to the entities directory */
  entityImportBase: string;
  /** Import path for the enums barrel (omit to exclude enum re-export) */
  enumsImport?: string;
}

export interface SchemasBarrelConfig {
  /** Base path from the barrel file to the entities directory */
  entityImportBase: string;
}

/**
 * Generates the content of a GraphQL client barrel file.
 * Re-exports all entity CRUD client functions from one import.
 */
export function generateClientBarrelContent(entities: EntityMeta[], config: ClientBarrelConfig): string {
  const { entityImportBase } = config;
  const exports = entities
    .map((e) => `export * from '${entityImportBase}/${e.kebab}/${e.kebab}.client.auto';`)
    .join('\n');

  return `/**
 * GraphQL Client — auto-generated barrel, do not edit
 */

${exports}
`;
}

/**
 * Generates the content of an API types barrel file.
 * Re-exports all entity interfaces plus shared utility types.
 */
export function generateTypesBarrelContent(
  entities: EntityMeta[],
  enums: EnumMeta[],
  config: TypesBarrelConfig,
): string {
  const { entityImportBase, enumsImport } = config;

  const typeExports = entities
    .map((e) => `export type { ${e.name} } from '${entityImportBase}/${e.kebab}/${e.kebab}.types.auto';`)
    .join('\n');

  const enumsLine = enumsImport && enums.length > 0 ? `\nexport * from '${enumsImport}';\n` : '';

  return `/**
 * API Types — auto-generated barrel, do not edit
 */

export interface ApiList<T> {
  data: T[];
  total: number;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface SortInput {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface EntityOption {
  value: string;
  label: string;
}

export interface EntityOptionsPage {
  options: EntityOption[];
  total: number;
  hasMore: boolean;
}

export interface EntityItem {
  id: string;
  title?: string;
  name?: string;
}

${typeExports}${enumsLine}
`;
}

/**
 * Generates the content of a schemas barrel file.
 * Re-exports all entity TableSchema instances from one import.
 */
export function generateSchemasBarrelContent(entities: EntityMeta[], config: SchemasBarrelConfig): string {
  const { entityImportBase } = config;
  const exports = entities
    .map((e) => `export { ${e.camel}Schema } from '${entityImportBase}/${e.kebab}/${e.kebab}.schema.auto';`)
    .join('\n');

  return `/**
 * Table Schemas — auto-generated barrel, do not edit
 */

${exports}
`;
}

/**
 * Generates the content of an enums file.
 * Produces TypeScript enum declarations from Prisma enum metadata.
 */
export function generateEnumsContent(enums: EnumMeta[]): string {
  if (enums.length === 0) {
    return `/**
 * API Enums — auto-generated, do not edit
 */

// No enums defined
`;
  }

  const enumDefs = enums
    .map((e) => `export enum ${e.name} {\n${e.values.map((v) => `  ${v} = '${v}',`).join('\n')}\n}`)
    .join('\n\n');

  return `/**
 * API Enums — auto-generated from Prisma schema, do not edit
 */

${enumDefs}
`;
}
