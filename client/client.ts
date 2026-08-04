import type { EntityMeta, EnumMeta } from '../dmmf/dmmf.types';
import { toKebabCase as _toKebabCase } from '../dmmf/dmmf.utils';
import type {
  ClientTypesConfig,
  ClientSchemaConfig,
  GraphQLClientConfig,
  ClientBarrelConfig,
  TypesBarrelConfig,
  SchemasBarrelConfig,
} from './client.types';

// ── Types generator ───────────────────────────────────────────────────────────

const PRISMA_SCALAR_IMPORTS: Record<string, string> = {
  DateTime: '@prisma/client',
  Decimal: '@prisma/client',
  Json: '@prisma/client',
};

const PRISMA_SCALAR_MAPPINGS: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  BigInt: 'number',
  Bytes: 'string',
};

export function generateClientTypesContent(
  entity: EntityMeta,
  allEntities: EntityMeta[],
  enums: EnumMeta[],
  config: ClientTypesConfig,
): string {
  const { enumsImport, scalarsImport = '@prisma/client' } = config;

  const entityNames = new Set(allEntities.map((e) => e.name));
  const enumNames = new Set(enums.map((e) => e.name));

  const entitiesToImport = new Set<string>();
  const enumsToImport = new Set<string>();
  const scalarImports = new Set<string>();

  for (const f of entity.fields) {
    if (!f.tsType || f.tsType === entity.name) continue;
    const baseType = f.tsType.endsWith(' | null') ? f.tsType.slice(0, -' | null'.length) : f.tsType;
    if (f.isRelation && entityNames.has(baseType)) entitiesToImport.add(baseType);
    else if (enumNames.has(baseType)) enumsToImport.add(baseType);
    else if (PRISMA_SCALAR_IMPORTS[baseType]) scalarImports.add(baseType);
  }

  // Every entity file lives at {entitiesDir}/{kebab}/, so a sibling entity is always
  // exactly one level up regardless of where entitiesDir itself is in the project.
  const entityImports = Array.from(entitiesToImport)
    .sort()
    .map((type) => {
      const kebab = _toKebabCase(type);
      return `import type { ${type} } from '../${kebab}/${kebab}.types.auto';`;
    })
    .join('\n');

  const enumImport =
    enumsToImport.size > 0
      ? `import { ${Array.from(enumsToImport).sort().join(', ')} } from '${enumsImport}';`
      : '';

  const scalarImport =
    scalarImports.size > 0
      ? `import type { ${Array.from(scalarImports).sort().join(', ')} } from '${scalarsImport}';`
      : '';

  const importSection = [entityImports, enumImport, scalarImport].filter(Boolean).join('\n');

  const fields = entity.fields
    .map((f) => {
      const optional = f.required ? '' : '?';
      if (f.isRelation && entityNames.has(f.tsType)) {
        if (f.isArray) return `  ${f.name}${optional}: ${f.tsType}[];`;
        return `  ${f.name}${optional}: ${f.tsType}${f.required ? '' : ' | null'};`;
      }
      let fieldType = f.tsType;
      const baseType = f.tsType.endsWith(' | null') ? f.tsType.slice(0, -' | null'.length) : f.tsType;
      if (PRISMA_SCALAR_MAPPINGS[baseType]) {
        fieldType = f.tsType.replace(baseType, PRISMA_SCALAR_MAPPINGS[baseType]);
      } else if (
        f.isRelation &&
        !entityNames.has(f.tsType) &&
        !enumNames.has(f.tsType) &&
        !PRISMA_SCALAR_IMPORTS[baseType] &&
        /^[A-Z]/.test(f.tsType) &&
        !f.tsType.includes('|')
      ) {
        fieldType = 'string';
      }
      return `  ${f.name}${optional}: ${fieldType};`;
    })
    .join('\n');

  return `/**
 * ${entity.displayName} — auto-generated, do not edit
 */

${importSection ? importSection + '\n\n' : ''}export interface ${entity.name} {
${fields}
}
`;
}

// ── Table schema type generator ────────────────────────────────────────────────

export function generateTableSchemaTypeContent(): string {
  return `/**
 * Table Schema Types — auto-generated, do not edit
 */

export interface EntityOption {
  value: string;
  label: string;
}

export interface TableFieldConfig {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  optionsLoader?: () => Promise<EntityOption[]>;
}

export interface TableSchema {
  name: string;
  displayName: string;
  primaryKey: string;
  sortField: string;
  fields: TableFieldConfig[];
}
`;
}

// ── Schema generator ──────────────────────────────────────────────────────────

function _prettifyLabel(name: string): string {
  const words = name.replace(/([A-Z])/g, ' $1').trim().split(' ');
  return words
    .map((w, i) => {
      const t = w.slice(0, 16);
      return i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('');
}

export function generateClientSchemaContent(entity: EntityMeta, config: ClientSchemaConfig): string {
  const {
    tableSchemaImport,
    optionsServiceImport,
    optionsServiceExport = 'fetchAllEntityOptions',
    skipFields = [],
    largeTextFields = [],
    sortFieldPreference = [],
  } = config;

  const skipSet = new Set(skipFields);
  const largeTextSet = new Set(largeTextFields);

  const primaryKey = entity.fields.find((f) => f.isPrimary)?.name;
  if (!primaryKey) {
    throw new Error(`generateClientSchemaContent: entity "${entity.name}" has no field marked as primary key`);
  }
  const fieldNameSet = new Set(entity.fields.map((f) => f.name));
  const sortField = sortFieldPreference.find((n) => fieldNameSet.has(n)) ?? primaryKey;

  const formFields = entity.fields.filter((f) => !f.isRelation && !skipSet.has(f.name));
  const regularFields = formFields.filter((f) => !largeTextSet.has(f.name));
  const textareaFields = formFields.filter((f) => largeTextSet.has(f.name));

  const regularDefs = regularFields
    .map((f) => {
      const label = _prettifyLabel(f.name);
      const required = f.required ? ', required: true' : '';

      if (f.formType === 'relation' && f.relationModel) {
        return `  {
    name: '${f.name}',
    label: '${label}',
    type: 'relation' as const,
    optionsLoader: async () => {
      const { ${optionsServiceExport} } = await import('${optionsServiceImport}');
      return ${optionsServiceExport}('${f.relationModel}');
    },
  }`;
      }

      return `  { name: '${f.name}', label: '${label}', type: '${f.formType}'${required} }`;
    })
    .join(',\n');

  const textareaDefs = textareaFields
    .map((f) => `  { name: '${f.name}', label: '${_prettifyLabel(f.name)}', type: 'textarea' }`)
    .join(',\n');

  const allDefs = [regularDefs, textareaDefs].filter(Boolean).join(',\n');

  return `/**
 * ${entity.displayName} Schema — auto-generated, do not edit
 */

import type { TableSchema } from '${tableSchemaImport}';

export const ${entity.camel}Schema: TableSchema = {
  name: '${entity.kebab}',
  displayName: '${entity.displayName}',
  primaryKey: '${primaryKey}',
  sortField: '${sortField}',
  fields: [
${allDefs},
  ],
};
`;
}

// ── GraphQL client generator ──────────────────────────────────────────────────

export function generateGraphQLClientContent(
  entity: EntityMeta,
  allEntities: EntityMeta[],
  config: GraphQLClientConfig,
): string {
  const { graphqlRequestImport, graphqlRequestExport = 'graphqlRequest', apiTypesImport } = config;

  const entityByName = new Map(allEntities.map((e) => [e.name, e]));

  const allFields = entity.fields
    .map((f) => {
      if (!f.isRelation) return `        ${f.name}`;

      const related = entityByName.get(f.tsType);
      const scalarFieldNames = related
        ? related.fields.filter((rf) => !rf.isRelation).map((rf) => rf.name)
        : ['id'];
      const selection = scalarFieldNames.map((n) => `          ${n}`).join('\n');
      return `        ${f.name} {\n${selection}\n        }`;
    })
    .join('\n');

  return `/**
 * ${entity.displayName} Client — auto-generated, do not edit
 */

import { ${graphqlRequestExport} } from '${graphqlRequestImport}';
import type { ApiList, PaginationInput } from '${apiTypesImport}';
import type { ${entity.name} } from './${entity.kebab}.types.auto';

export async function fetch${entity.name}(id: string): Promise<${entity.name} | null> {
  const data = await ${graphqlRequestExport}<{ ${entity.camel}: ${entity.name} | null }>(\`
    query Get${entity.name}($id: String!) {
      ${entity.camel}(id: $id) {
${allFields}
      }
    }
  \`, { id });
  return data.${entity.camel};
}

export async function fetch${entity.name}List(filter?: any, pagination?: PaginationInput): Promise<ApiList<${entity.name}>> {
  const data = await ${graphqlRequestExport}<{ ${entity.camel}List: ApiList<${entity.name}> }>(\`
    query Get${entity.name}List($filter: JSON, $pagination: PaginationInput) {
      ${entity.camel}List(filter: $filter, pagination: $pagination) {
        data {
${allFields}
        }
        total
      }
    }
  \`, { filter, pagination });
  return data.${entity.camel}List;
}

export async function create${entity.name}(input: Partial<${entity.name}>): Promise<${entity.name}> {
  const data = await ${graphqlRequestExport}<{ create${entity.name}: ${entity.name} }>(\`
    mutation Create${entity.name}($input: Create${entity.name}Input!) {
      create${entity.name}(input: $input) { id }
    }
  \`, { input });
  return data.create${entity.name};
}

export async function update${entity.name}(id: string, input: Partial<${entity.name}>): Promise<${entity.name}> {
  const data = await ${graphqlRequestExport}<{ update${entity.name}: ${entity.name} }>(\`
    mutation Update${entity.name}($id: String!, $input: Update${entity.name}Input!) {
      update${entity.name}(id: $id, input: $input) { id }
    }
  \`, { id, input });
  return data.update${entity.name};
}

export async function delete${entity.name}(id: string): Promise<boolean> {
  const data = await ${graphqlRequestExport}<{ delete${entity.name}: boolean }>(\`
    mutation Delete${entity.name}($id: String!) {
      delete${entity.name}(id: $id)
    }
  \`, { id });
  return data.delete${entity.name};
}
`;
}

// ── Barrel generators ─────────────────────────────────────────────────────────

export function generateClientBarrelContent(entities: EntityMeta[], config: ClientBarrelConfig): string {
  const exports = entities
    .map((e) => `export * from '${config.entityImportBase}/${e.kebab}/${e.kebab}.client.auto';`)
    .join('\n');

  return `/**
 * GraphQL Client — auto-generated barrel, do not edit
 */

${exports}
`;
}

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

export function generateSchemasBarrelContent(entities: EntityMeta[], config: SchemasBarrelConfig): string {
  const exports = entities
    .map((e) => `export { ${e.camel}Schema } from '${config.entityImportBase}/${e.kebab}/${e.kebab}.schema.auto';`)
    .join('\n');

  return `/**
 * Table Schemas — auto-generated barrel, do not edit
 */

${exports}
`;
}

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
