import type {
  DMMFField,
  DMMFModel,
  EntityMetadata,
  Field,
  FilterMode,
  ForeignKeyField,
  GraphQLResolverConfig,
  LocalizationConfig,
  MetadataInferrerOptions,
  Model,
  RestHandlerConfig,
  RestRouterConfig,
  TypesGeneratorOptions,
} from './index';

// ── Re-export config types so callers only need one import ───────────────────

export type {
  DMMFField,
  DMMFModel,
  EntityMetadata,
  Field,
  FilterMode,
  ForeignKeyField,
  GraphQLResolverConfig,
  LocalizationConfig,
  MetadataInferrerOptions,
  Model,
  RestHandlerConfig,
  RestRouterConfig,
  TypesGeneratorOptions,
};

// ── Schema parser ─────────────────────────────────────────────────────────────

export function parsePrismaModels(dmmfModels: readonly DMMFModel[]): Model[] {
  return dmmfModels.map((m) => ({
    name: m.name,
    dbName: m.dbName ?? m.name,
    fields: m.fields.map(_mapDMMFField),
  }));
}

export function parseForeignKeys(dmmfModel: DMMFModel): ForeignKeyField[] {
  const fkFields: ForeignKeyField[] = [];
  for (const field of dmmfModel.fields) {
    if (field.kind !== 'object') continue;
    if (!field.relationFromFields?.length) continue;
    const fkFieldName = field.relationFromFields[0];
    const fkField = dmmfModel.fields.find((f) => f.name === fkFieldName);
    fkFields.push({
      fieldName: fkFieldName,
      relationName: field.name,
      isRequired: fkField ? fkField.isRequired : true,
    });
  }
  return fkFields;
}

export function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function prismaToTsType(prismaType: string): string {
  const map: Record<string, string> = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
    DateTime: 'Date',
    BigInt: 'number',
    Decimal: 'number',
    Json: 'any',
    Bytes: 'string',
  };
  return map[prismaType] ?? 'string';
}

function _mapDMMFField(f: DMMFField): Field {
  return {
    name: f.name,
    type: f.type,
    required: f.isRequired,
    isId: f.isId,
    isRelation: f.kind === 'object',
    isArray: f.isList,
  };
}

// ── Metadata inferrer ─────────────────────────────────────────────────────────

export function inferEntityMetadata(
  dmmfModels: readonly DMMFModel[],
  options: MetadataInferrerOptions = {},
): Record<string, EntityMetadata> {
  const { skipFilterableFields = [], searchableFieldPatterns = [], enumLikeIntPatterns = [] } = options;
  const skipSet = new Set(skipFilterableFields);
  const metadata: Record<string, EntityMetadata> = {};

  for (const model of dmmfModels) {
    const filterable: Record<string, 'contains' | 'equals'> = {};
    const searchableFields: string[] = [];
    const includeRelations: string[] = [];

    for (const field of model.fields) {
      if (field.kind === 'object') {
        if (!field.isList && field.relationFromFields?.length) continue;
        includeRelations.push(field.name);
        continue;
      }
      if (field.kind !== 'scalar') continue;

      const { name, type } = field;
      if (type === 'String' && !name.endsWith('Id')) {
        if (!skipSet.has(name)) filterable[name] = 'contains';
        if (searchableFieldPatterns.some((p) => p.test(name))) searchableFields.push(name);
      } else if (name.endsWith('Id') && !skipSet.has(name)) {
        filterable[name] = 'equals';
      } else if (type === 'Boolean') {
        filterable[name] = 'equals';
      } else if (type === 'Int' && enumLikeIntPatterns.some((p) => p.test(name))) {
        filterable[name] = 'equals';
      }
    }

    const fieldNames = model.fields.map((f) => f.name);
    let orderBy = 'createdAt';
    if (fieldNames.includes('name')) orderBy = 'name';
    else if (fieldNames.includes('title')) orderBy = 'title';

    if (Object.keys(filterable).length > 0 || searchableFields.length > 0 || includeRelations.length > 0) {
      metadata[model.name] = {
        ...(Object.keys(filterable).length > 0 && { filterable }),
        ...(searchableFields.length > 0 && { searchableFields }),
        ...(includeRelations.length > 0 && { includeRelations }),
        orderBy,
      };
    }
  }

  return metadata;
}

// ── Types generator ───────────────────────────────────────────────────────────

const DEFAULT_SKIP_INPUT_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

export function generateEntityTypesContent(model: Model, options: TypesGeneratorOptions = {}): string {
  const skipInputFields = options.skipInputFields ? new Set(options.skipInputFields) : DEFAULT_SKIP_INPUT_FIELDS;
  const scalarFields = model.fields.filter((f) => !f.isRelation);
  const relationFields = model.fields.filter((f) => f.isRelation);

  const mainFields = [
    ...scalarFields.map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`),
    ...relationFields.map((f) =>
      f.isArray ? `  ${f.name}${f.required ? '' : '?'}: ${f.type}[];` : `  ${f.name}${f.required ? '' : '?'}: ${f.type} | null;`,
    ),
  ].join('\n');

  const inputFields = scalarFields
    .filter((f) => !skipInputFields.has(f.name))
    .map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`)
    .join('\n');

  return `/**
 * ${model.name} Types
 * Auto-generated from Prisma schema - DO NOT EDIT
 */

export interface ${model.name} {
${mainFields}
}

export interface ${model.name}Input {
${inputFields}
}
`;
}

// ── GraphQL metadata generator ────────────────────────────────────────────────

export function generateGraphQLMetadataFileContent(metadata: Record<string, EntityMetadata>): string {
  return `/**
 * GraphQL Entity Metadata - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

export type EntityMetadata = {
  filterable?: Record<string, 'contains' | 'equals'>;
  searchableFields?: string[];
  includeRelations?: string[];
  orderBy?: string;
};

export const GRAPHQL_ENTITY_METADATA: Record<string, EntityMetadata> = ${JSON.stringify(metadata, null, 2)};
`;
}

export function generateGraphQLContextTypesContent(extraFields?: Record<string, string>): string {
  const extra = extraFields
    ? Object.entries(extraFields)
        .map(([k, v]) => `  ${k}?: ${v};`)
        .join('\n')
    : '';

  return `/**
 * GraphQL Context Types - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

export interface GraphQLResolverContext {
  userId?: string;
  isAdmin?: boolean;
  userRoles?: string[];
${extra ? extra + '\n' : ''}}\n`;
}

// ── GraphQL resolvers generator ───────────────────────────────────────────────

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
    .map(([name, fks]) => _buildTransformFunction(name, fks))
    .filter(Boolean)
    .join('\n\n');

  const queryResolvers =
    Object.entries(metadata)
      .map(([name, meta]) => _buildSingleResolver(name, meta, localization))
      .join('\n') +
    '\n' +
    Object.entries(metadata)
      .map(([name, meta]) => _buildListResolver(name, meta, localization))
      .join('\n');

  const mutationResolvers =
    Object.entries(metadata)
      .map(([name, meta]) => _buildCreateResolver(name, meta, modelForeignKeys.get(name)))
      .join('\n') +
    '\n' +
    Object.entries(metadata)
      .map(([name, meta]) => _buildUpdateResolver(name, meta, modelForeignKeys.get(name)))
      .join('\n') +
    '\n' +
    Object.keys(metadata)
      .map(_buildDeleteResolver)
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

function _buildTransformFunction(modelName: string, fkFields: ForeignKeyField[]): string {
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

function _buildFilterLogicGQL(metadata: EntityMetadata): string {
  if (!metadata.filterable && !metadata.searchableFields?.length) return 'const where: any = {};';

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

function _buildInclude(metadata: EntityMetadata): string {
  if (!metadata.includeRelations?.length) return '';
  return `include: {\n            ${metadata.includeRelations.map((r) => `${r}: true`).join(',\n            ')},\n          },`;
}

function _buildSingleResolver(modelName: string, metadata: EntityMetadata, localization?: LocalizationConfig): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = _buildInclude(metadata);
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';
  const args = localization ? `{ id, lang }: { id: string; lang?: string }` : `{ id }: { id: string }`;
  const returnLogic = localization
    ? `\n        if (data && lang) {\n          return await ${localizeExport}(data, '${modelName}', lang);\n        }\n        return data;`
    : `\n        return data;`;

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

function _buildListResolver(modelName: string, metadata: EntityMetadata, localization?: LocalizationConfig): string {
  const camelCase = toCamelCase(modelName);
  const filterLogic = _buildFilterLogicGQL(metadata);
  const includeLogic = _buildInclude(metadata);
  const orderBy = metadata.orderBy || 'createdAt';
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';
  const args = localization
    ? `{ filter, pagination, lang }: { filter?: any; pagination?: any; lang?: string }`
    : `{ filter, pagination }: { filter?: any; pagination?: any }`;
  const returnLogic = localization
    ? `\n        let localizedData = data;\n        if (lang) {\n          localizedData = await Promise.all(\n            data.map((item: any) => ${localizeExport}(item, '${modelName}', lang)),\n          );\n        }\n        return { data: localizedData, total };`
    : `\n        return { data, total };`;

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

function _buildCreateResolver(modelName: string, metadata: EntityMetadata, fkFields?: ForeignKeyField[]): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = _buildInclude(metadata);
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

function _buildUpdateResolver(modelName: string, metadata: EntityMetadata, fkFields?: ForeignKeyField[]): string {
  const camelCase = toCamelCase(modelName);
  const includeLogic = _buildInclude(metadata);
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

function _buildDeleteResolver(modelName: string): string {
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

// ── REST handler generator ────────────────────────────────────────────────────

export function generateRestHandlerContent(
  modelName: string,
  metadata: EntityMetadata,
  config: RestHandlerConfig,
): string {
  const camelCase = toCamelCase(modelName);
  const filterLogic = _buildFilterLogicREST(metadata);
  const orderBy = metadata.orderBy || 'createdAt';
  const { localization } = config;
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';

  const localizationImport = localization ? `import { ${localizeExport} } from '${localization.localizeImport}';\n` : '';
  const listSignature = localization ? `list${modelName}s(req: Request, lang?: string)` : `list${modelName}s(req: Request)`;
  const localizeList = localization
    ? `\n    const localizedData = lang\n      ? await Promise.all(data.map((item: any) => ${localizeExport}(item, '${modelName}', lang)))\n      : data;`
    : '';
  const listData = localization ? 'localizedData' : 'data';
  const getSignature = localization ? `get${modelName}(id: string, lang?: string)` : `get${modelName}(id: string)`;
  const localizeGet = localization
    ? `\n    const localizedData = lang ? await ${localizeExport}(data, '${modelName}', lang) : data;`
    : '';
  const getData = localization ? 'localizedData' : 'data';

  return `/**
 * ${modelName} REST API Handlers
 * Auto-generated - DO NOT EDIT
 */

import prisma from '${config.prismaClientPath}';
${localizationImport}
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

export async function ${listSignature}: Promise<Response> {
  try {
    const url = new URL(req.url);

    const limitParam = url.searchParams.get('limit');
    if (limitParam && isNaN(parseInt(limitParam))) {
      return jsonError(400, 'Invalid pagination parameter', { parameter: 'limit', value: limitParam, reason: 'Must be a positive integer' });
    }
    const limit = Math.min(Math.max(parseInt(limitParam || '50'), 1), 1000);

    const offsetParam = url.searchParams.get('offset');
    let offset = 0;
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam);
      if (isNaN(parsedOffset)) {
        return jsonError(400, 'Invalid pagination parameter', { parameter: 'offset', value: offsetParam, reason: 'Must be a non-negative integer' });
      }
      offset = Math.max(parsedOffset, 0);
    }

    ${filterLogic}

    const [data, total] = await Promise.all([
      (prisma as any).${camelCase}.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { ${orderBy}: 'asc' },
      }),
      (prisma as any).${camelCase}.count({ where }),
    ]);
${localizeList}
    return new Response(
      JSON.stringify({ data: ${listData}, pagination: { limit, offset, total, hasMore: offset + limit < total } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

export async function ${getSignature}: Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const data = await (prisma as any).${camelCase}.findUnique({ where: { id } });
    if (!data) return jsonError(404, '${modelName} not found');
${localizeGet}
    return new Response(JSON.stringify(${getData}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

export async function create${modelName}(req: Request): Promise<Response> {
  try {
    const input = await req.json();
    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.create({ data: input });
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(400, (error as Error).message);
  }
}

export async function update${modelName}(id: string, req: Request): Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const input = await req.json();
    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.update({ where: { id }, data: input });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(400, (error as Error).message);
  }
}

export async function delete${modelName}(id: string): Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const data = await (prisma as any).${camelCase}.delete({ where: { id } });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

function jsonError(status: number, error: string, details?: unknown): Response {
  return new Response(
    JSON.stringify(details ? { error, details } : { error }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
`;
}

function _buildFilterLogicREST(metadata: EntityMetadata): string {
  if (!metadata.filterable && !metadata.searchableFields?.length) return 'const where: any = {};';

  let code =
    "const where: any = {};\n\n    const filterPrefix = 'filter.';\n    url.searchParams.forEach((value, key) => {\n      if (!key.startsWith(filterPrefix)) return;\n      const field = key.slice(filterPrefix.length);\n";

  for (const [field, mode] of Object.entries(metadata.filterable ?? {})) {
    if (mode === 'contains') {
      code += `      if (field === '${field}') where['${field}'] = { contains: value, mode: 'insensitive' };\n`;
    } else {
      code += `      if (field === '${field}') where['${field}'] = value;\n`;
    }
  }
  code += '    });\n';

  if (metadata.searchableFields?.length) {
    code += `\n    const search = url.searchParams.get('search');\n    if (search) {\n      where.OR = [\n`;
    for (const field of metadata.searchableFields) {
      code += `        { ${field}: { contains: search, mode: 'insensitive' } },\n`;
    }
    code += '      ];\n    }';
  }

  return code;
}

// ── REST router generator ─────────────────────────────────────────────────────

export function generateRestRouterContent(models: Model[], config: RestRouterConfig): string {
  const { entityImportBase, extraImports = '', extraRoutes = '', extraHelpers = '', localization } = config;
  const getLangExport = localization?.getLangExport ?? 'getLanguageFromRequest';
  const localizationImport = localization ? `import { ${getLangExport} } from '${localization.getLangImport}';\n` : '';

  const entityImports = models
    .map((m) => {
      const kebab = toKebabCase(m.name);
      const camel = toCamelCase(m.name);
      return `import * as ${camel}Rest from '${entityImportBase}/${kebab}/${kebab}.rest.auto';`;
    })
    .join('\n');

  const langArg = localization ? ', lang' : '';

  const routes = models
    .map((m) => {
      const kebab = toKebabCase(m.name);
      const camel = toCamelCase(m.name);
      const plural = kebab.endsWith('s') ? kebab : `${kebab}s`;
      return `    if (entity === '${plural}') {
      if (method === 'GET' && !id) return await ${camel}Rest.list${m.name}s(req${langArg});
      if (method === 'GET' && id) return await ${camel}Rest.get${m.name}(id${langArg});
      if (method === 'POST') return await ${camel}Rest.create${m.name}(req);
      if (method === 'PUT' && id) return await ${camel}Rest.update${m.name}(id, req);
      if (method === 'DELETE' && id) return await ${camel}Rest.delete${m.name}(id);
    }`;
    })
    .join('\n\n');

  const langDeclaration = localization ? `\n    const lang = ${getLangExport}(req);` : '';

  return `/**
 * REST API Router - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

${entityImports}
${localizationImport}${extraImports ? `\n${extraImports}\n` : ''}
export async function handleRestRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
${extraRoutes ? `\n${extraRoutes}\n` : ''}
  const pathMatch = pathname.match(/^\\/api\\/([^\\/]+)(?:\\/([^\\/]+))?$/);
  if (!pathMatch) {
    return new Response(JSON.stringify({ error: 'Invalid API endpoint' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [, entity, id] = pathMatch;
${langDeclaration}
  try {
${routes}

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
${extraHelpers ? `\n${extraHelpers}` : ''}`;
}
