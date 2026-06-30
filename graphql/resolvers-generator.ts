import type { DMMFModel, EntityMetadata, ForeignKeyField, LocalizationConfig, GraphQLResolverConfig } from '../types';
import { parseForeignKeys, toCamelCase } from '../schema-parser';

/**
 * Returns the file content for the auto-generated GraphQL resolvers file.
 *
 * Generates Query and Mutation resolvers for every entity in `metadata` with:
 * - UUID validation
 * - Pagination (limit/offset)
 * - Dynamic filtering and global search
 * - Relation includes
 * - Optional FK-to-relation transform functions
 * - Optional localization via `lang` parameter
 */
export function generateGraphQLResolversContent(
  metadata: Record<string, EntityMetadata>,
  dmmfModels: readonly DMMFModel[],
  config: GraphQLResolverConfig,
): string {
  const {
    prismaClientPath,
    prismaClientExport = 'PrismaClient',
    contextTypePath,
    contextTypeExport = 'GraphQLResolverContext',
    localization,
  } = config;

  const dmmfModelMap = new Map(dmmfModels.map((m) => [m.name, m]));
  const modelForeignKeys = new Map<string, ForeignKeyField[]>();
  for (const modelName of Object.keys(metadata)) {
    const dmmfModel = dmmfModelMap.get(modelName);
    if (dmmfModel) {
      const fks = parseForeignKeys(dmmfModel);
      if (fks.length > 0) modelForeignKeys.set(modelName, fks);
    }
  }

  const transformFunctions = Array.from(modelForeignKeys.entries())
    .map(([name, fks]) => buildTransformFunction(name, fks))
    .filter(Boolean)
    .join('\n\n');

  const queryResolvers =
    Object.entries(metadata)
      .map(([name, meta]) => buildSingleResolver(name, meta, localization))
      .join('\n') +
    '\n' +
    Object.entries(metadata)
      .map(([name, meta]) => buildListResolver(name, meta, localization))
      .join('\n');

  const mutationResolvers =
    Object.entries(metadata)
      .map(([name, meta]) => buildCreateResolver(name, meta, modelForeignKeys.get(name)))
      .join('\n') +
    '\n' +
    Object.entries(metadata)
      .map(([name, meta]) => buildUpdateResolver(name, meta, modelForeignKeys.get(name)))
      .join('\n') +
    '\n' +
    Object.keys(metadata)
      .map(buildDeleteResolver)
      .join('\n');

  const localizeExport = localization?.localizeExport ?? 'localizeEntity';
  const localizationImport = localization
    ? `\nimport { ${localizeExport} } from '${localization.localizeImport}';`
    : '';

  return `/**
 * GraphQL Resolvers - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

import { ${prismaClientExport} } from '${prismaClientPath}';
import type { ${contextTypeExport} } from '${contextTypePath}';${localizationImport}

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function validateInputIDs(input: any): string | null {
  if (!input || typeof input !== 'object') return null;
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith('Id') && value !== null && value !== undefined) {
      if (typeof value !== 'string' || !isValidUUID(value as string)) {
        return \`Invalid ID format for field '\${key}' - must be a valid UUID\`;
      }
    }
  }
  return null;
}

${transformFunctions ? transformFunctions + '\n' : ''}
export interface ResolverContext extends ${contextTypeExport} {
  prisma: ${prismaClientExport};
}

export const resolvers = {
  Query: {
${queryResolvers}
  },
  Mutation: {
${mutationResolvers}
  },
};
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTransformFunction(modelName: string, fkFields: ForeignKeyField[]): string {
  if (fkFields.length === 0) return '';

  const transforms = fkFields
    .map((field) => {
      if (field.isRequired) {
        return `  if ('${field.fieldName}' in result) {
    const value = result.${field.fieldName};
    delete result.${field.fieldName};
    if (value !== undefined && value !== null) {
      result.${field.relationName} = { connect: { id: value } };
    }
  }`;
      }
      return `  if ('${field.fieldName}' in result) {
    const value = result.${field.fieldName};
    delete result.${field.fieldName};
    if (value !== undefined && value !== null) {
      result.${field.relationName} = { connect: { id: value } };
    }
  }

  if ('${field.relationName}' in result && result.${field.relationName} === null) {
    delete result.${field.relationName};
  }`;
    })
    .join('\n\n');

  return `function transform${modelName}InputToPrisma(input: any): any {
  if (!input) return input;
  const result = { ...input };

${transforms}

  return result;
}`;
}

function buildFilterLogic(metadata: EntityMetadata): string {
  if (!metadata.filterable && !metadata.searchableFields?.length) {
    return 'const where: any = {};';
  }

  let code = 'const where: any = {};\n\n      if (filter) {';

  for (const [field, mode] of Object.entries(metadata.filterable ?? {})) {
    if (mode === 'contains') {
      code += `\n        if (filter.${field}) where.${field} = typeof filter.${field} === 'string' ? { contains: filter.${field}, mode: 'insensitive' } : filter.${field};`;
    } else {
      code += `\n        if (filter.${field}) where.${field} = filter.${field};`;
    }
  }

  if (metadata.searchableFields?.length) {
    code += `\n        if (filter.search) {\n          where.OR = [`;
    for (const field of metadata.searchableFields) {
      code += `\n            { ${field}: { contains: filter.search, mode: 'insensitive' } },`;
    }
    code += `\n          ];\n        }`;
  }

  code += '\n      }';
  return code;
}

function buildInclude(metadata: EntityMetadata): string {
  if (!metadata.includeRelations?.length) return '';
  return `include: {\n            ${metadata.includeRelations.map((r) => `${r}: true`).join(',\n            ')},\n          },`;
}

function buildSingleResolver(
  modelName: string,
  metadata: EntityMetadata,
  localization?: LocalizationConfig,
): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = buildInclude(metadata);
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';

  const args = localization
    ? `{ id, lang }: { id: string; lang?: string }`
    : `{ id }: { id: string }`;

  const returnLogic = localization
    ? `
        if (data && lang) {
          return await ${localizeExport}(data, '${modelName}', lang);
        }
        return data;`
    : `
        return data;`;

  return `
    ${camelCase}: async (
      _: any,
      ${args},
      { prisma }: ResolverContext,
    ) => {
      if (!isValidUUID(id)) throw new Error('Invalid ID format - must be a valid UUID');
      try {
        const data = await (prisma as any).${camelCase}.findUnique({
          where: { id },
          ${includeLogic}
        });
${returnLogic}
      } catch (error) {
        console.error('GraphQL error in ${camelCase} query:', error);
        throw error;
      }
    },`;
}

function buildListResolver(
  modelName: string,
  metadata: EntityMetadata,
  localization?: LocalizationConfig,
): string {
  const camelCase = toCamelCase(modelName);
  const filterLogic = buildFilterLogic(metadata);
  const includeLogic = buildInclude(metadata);
  const orderBy = metadata.orderBy || 'createdAt';
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';

  const args = localization
    ? `{ filter, pagination, lang }: { filter?: any; pagination?: any; lang?: string }`
    : `{ filter, pagination }: { filter?: any; pagination?: any }`;

  const returnLogic = localization
    ? `
        let localizedData = data;
        if (lang) {
          localizedData = await Promise.all(
            data.map((item: any) => ${localizeExport}(item, '${modelName}', lang)),
          );
        }
        return { data: localizedData, total };`
    : `
        return { data, total };`;

  return `
    ${camelCase}List: async (
      _: any,
      ${args},
      { prisma }: ResolverContext,
    ) => {
      try {
        ${filterLogic}

        if (pagination?.limit !== undefined && typeof pagination.limit !== 'number') {
          throw new Error('Invalid pagination parameter: limit must be a positive integer');
        }
        if (pagination?.offset !== undefined && typeof pagination.offset !== 'number') {
          throw new Error('Invalid pagination parameter: offset must be a non-negative integer');
        }

        const limit = Math.min(Math.max(pagination?.limit || 50, 1), 1000);
        const offset = Math.max(pagination?.offset || 0, 0);

        const [data, total] = await Promise.all([
          (prisma as any).${camelCase}.findMany({
            where,
            ${includeLogic}
            take: limit,
            skip: offset,
            orderBy: { ${orderBy}: 'asc' },
          }),
          (prisma as any).${camelCase}.count({ where }),
        ]);
${returnLogic}
      } catch (error) {
        console.error('GraphQL error in ${camelCase}List query:', error);
        throw error;
      }
    },`;
}

function buildCreateResolver(modelName: string, metadata: EntityMetadata, fkFields?: ForeignKeyField[]): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = buildInclude(metadata);
  const data = fkFields?.length ? `transform${modelName}InputToPrisma(input)` : 'input';

  return `
    create${modelName}: async (
      _: any,
      { input }: { input: any },
      { prisma }: ResolverContext,
    ) => {
      const idError = validateInputIDs(input);
      if (idError) throw new Error(idError);
      try {
        return await (prisma as any).${camelCase}.create({
          data: ${data},
          ${includeLogic}
        });
      } catch (error) {
        console.error('GraphQL error in create${modelName} mutation:', error);
        throw error;
      }
    },`;
}

function buildUpdateResolver(modelName: string, metadata: EntityMetadata, fkFields?: ForeignKeyField[]): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = buildInclude(metadata);
  const data = fkFields?.length ? `transform${modelName}InputToPrisma(input)` : 'input';

  return `
    update${modelName}: async (
      _: any,
      { id, input }: { id: string; input: any },
      { prisma }: ResolverContext,
    ) => {
      if (!isValidUUID(id)) throw new Error('Invalid ID format - must be a valid UUID');
      const idError = validateInputIDs(input);
      if (idError) throw new Error(idError);
      try {
        return await (prisma as any).${camelCase}.update({
          where: { id },
          data: ${data},
          ${includeLogic}
        });
      } catch (error) {
        console.error('GraphQL error in update${modelName} mutation:', error);
        throw error;
      }
    },`;
}

function buildDeleteResolver(modelName: string): string {
  const camelCase = toCamelCase(modelName);

  return `
    delete${modelName}: async (
      _: any,
      { id }: { id: string },
      { prisma }: ResolverContext,
    ) => {
      if (!isValidUUID(id)) throw new Error('Invalid ID format - must be a valid UUID');
      try {
        await (prisma as any).${camelCase}.delete({ where: { id } });
        return true;
      } catch (error) {
        console.error('GraphQL error in delete${modelName} mutation:', error);
        throw error;
      }
    },`;
}
