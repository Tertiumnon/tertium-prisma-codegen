import type { DMMFField, DMMFModel } from '../dmmf/dmmf.types';
import { detectTranslationRelations } from '../dmmf/dmmf.utils';
import type {
  EntityMetadata,
  Field,
  ForeignKeyField,
  GraphQLResolverConfig,
  LocalizationConfig,
  MetadataInferrerOptions,
  Model,
  RestHandlerConfig,
  RestRouterConfig,
  TypesGeneratorOptions,
} from './server.types';

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
  const {
    skipFilterableFields = [],
    searchableFieldPatterns = [],
    enumLikeIntPatterns = [],
    orderByFieldPreference = [],
    translationModelSuffix = 'Translation',
    skipTranslationDetection = [],
  } = options;
  const skipSet = new Set(skipFilterableFields);
  const metadata: Record<string, EntityMetadata> = {};

  const translationOwners = detectTranslationRelations(dmmfModels, {
    translationModelSuffix,
    skip: skipTranslationDetection,
  });
  const translationModelNames = new Set(
    Array.from(translationOwners.values()).map((t) => t.translationModelName),
  );

  for (const model of dmmfModels) {
    // `<Model>Translation` tables are an implementation detail of their parent, never a
    // first-class entity in their own right - no metadata, no resolvers, no REST routes.
    if (translationModelNames.has(model.name)) continue;

    const translation = translationOwners.get(model.name);
    const filterable: Record<string, 'contains' | 'equals'> = {};
    const searchableFields: string[] = [];
    const includeRelations: string[] = [];

    for (const field of model.fields) {
      if (field.kind === 'object') {
        if (translation && field.name === translation.relationName) continue; // handled via `translation`, not a flat include
        // A translation model is never a first-class entity anywhere, not just from its own
        // owner's side - e.g. `Language.creatureTranslations: CreatureTranslation[]` must also
        // be excluded, or Language ends up with a flat include/type reference to a model that
        // was never generated its own type/resolver for.
        if (translationModelNames.has(field.type)) continue;
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

    const fieldNameSet = new Set(model.fields.map((f) => f.name));
    const primaryKey = model.fields.find((f) => f.isId)?.name;
    if (!primaryKey) {
      throw new Error(`inferEntityMetadata: model "${model.name}" has no @id field`);
    }
    const orderBy = orderByFieldPreference.find((n) => fieldNameSet.has(n)) ?? primaryKey;

    // Same scoping as base-column `searchableFields` above (matched against
    // `searchableFieldPatterns`) - a long-form `details`/lore field shouldn't make `filter.search`
    // match every item whose flavor text happens to mention the query term. Falls back to every
    // translation field if none match the patterns, so an entity whose translatable field names
    // don't happen to match (e.g. only `value`) still gets a working search rather than none.
    const translationWithSearchScope = translation && {
      ...translation,
      ...(searchableFieldPatterns.length > 0 && {
        searchableFields: translation.fields.filter((f) => searchableFieldPatterns.some((p) => p.test(f))),
      }),
    };

    if (
      Object.keys(filterable).length > 0 ||
      searchableFields.length > 0 ||
      includeRelations.length > 0 ||
      translation
    ) {
      metadata[model.name] = {
        ...(Object.keys(filterable).length > 0 && { filterable }),
        ...(searchableFields.length > 0 && { searchableFields }),
        ...(includeRelations.length > 0 && { includeRelations }),
        ...(translationWithSearchScope && { translation: translationWithSearchScope }),
        orderBy,
      };
    }
  }

  return metadata;
}

/** Single source of truth for excluding a `<Model>Translation` table from anything metadata-blind
 * (object types, REST directories, the types file) - it's never a first-class entity. */
export function isTranslationModel(modelName: string, metadata: Record<string, EntityMetadata>): boolean {
  return Object.values(metadata).some((m) => m.translation?.translationModelName === modelName);
}

// ── Types generator ───────────────────────────────────────────────────────────

const DEFAULT_SKIP_INPUT_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

export function generateEntityTypesContent(
  model: Model,
  allMetadata: Record<string, EntityMetadata>,
  options: TypesGeneratorOptions = {},
): string {
  const skipInputFields = options.skipInputFields ? new Set(options.skipInputFields) : DEFAULT_SKIP_INPUT_FIELDS;
  const relationImportPath = options.relationImportPath ?? ((name: string) => `../${toKebabCase(name)}/${toKebabCase(name)}.types.auto`);
  const t = allMetadata[model.name]?.translation;
  const scalarFields = model.fields.filter((f) => !f.isRelation);
  // Exclude this model's own translation relation (handled by flattening below) AND any relation
  // to a `<Model>Translation` table from ANOTHER model's side (e.g. `Language.creatureTranslations`)
  // - a translation model is never a first-class entity anywhere, so it never gets its own
  // generated type to import/reference.
  const relationFields = model.fields.filter(
    (f) => f.isRelation && !(t && f.name === t.relationName) && !isTranslationModel(f.type, allMetadata),
  );

  const mainFields = [
    ...scalarFields.map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`),
    ...(t ? t.fields.map((name) => `  ${name}?: string;`) : []),
    ...relationFields.map((f) =>
      f.isArray ? `  ${f.name}${f.required ? '' : '?'}: ${f.type}[];` : `  ${f.name}${f.required ? '' : '?'}: ${f.type} | null;`,
    ),
  ].join('\n');

  const inputFields = [
    ...scalarFields.filter((f) => !skipInputFields.has(f.name)).map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`),
    ...(t ? [`  lang: string;`, ...t.fields.map((name) => `  ${name}?: string;`)] : []),
  ].join('\n');

  const relatedTypeNames = Array.from(new Set(relationFields.map((f) => f.type))).filter((name) => name !== model.name);
  const imports = relatedTypeNames.map((name) => `import type { ${name} } from '${relationImportPath(name)}';`).join('\n');

  return `/**
 * ${model.name} Types
 * Auto-generated from Prisma schema - DO NOT EDIT
 */
${imports ? '\n' + imports + '\n' : ''}
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
  translation?: { relationName: string; translationModelName: string; fkFieldName: string; fields: string[]; searchableFields?: string[] };
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
    caseInsensitiveSearch = true,
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
      .map(([name, meta]) => _buildListResolver(name, meta, localization, caseInsensitiveSearch))
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
  const hasTranslation = Object.values(metadata).some((m) => m.translation);
  const flattenTranslationFn = hasTranslation
    ? `\nfunction flattenTranslation(entity: any, relationName: string, fields: string[]): any {
  if (!entity) return entity;
  const { [relationName]: translations, ...rest } = entity;
  const t = Array.isArray(translations) ? translations[0] : undefined;
  for (const f of fields) rest[f] = t ? (t[f] ?? null) : null;
  return rest;
}
`
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
${flattenTranslationFn}
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

function _buildFilterLogicGQL(
  modelName: string,
  metadata: EntityMetadata,
  localization?: LocalizationConfig,
  caseInsensitiveSearch = true,
): string {
  const t = metadata.translation;
  const hasSearch = (metadata.searchableFields?.length ?? 0) > 0 || !!t;
  if (!metadata.filterable && !hasSearch) return 'const where: any = {};';

  // Postgres needs `mode: 'insensitive'` for case-insensitive `contains`; MySQL/SQLite don't
  // support that StringFilter option at all (Prisma Client rejects it at runtime, not just in
  // types) and are case-insensitive by default collation already. See
  // GraphQLResolverConfig.caseInsensitiveSearch doc comment.
  const modeSuffix = caseInsensitiveSearch ? ", mode: 'insensitive'" : '';

  let code = 'const where: any = {};\n\n      if (filter) {';
  for (const [field, mode] of Object.entries(metadata.filterable ?? {})) {
    if (mode === 'contains') {
      code += `\n        if (filter.${field}) where.${field} = typeof filter.${field} === 'string' ? { contains: filter.${field}${modeSuffix} } : filter.${field};`;
    } else {
      code += `\n        if (filter.${field}) where.${field} = filter.${field};`;
    }
  }
  if (hasSearch) {
    code += `\n        if (filter.search) {`;
    if (t) {
      // Relational filter against the dedicated `<Model>Translation` table - replaces the
      // polymorphic-`Translation` workaround entirely for entities using this pattern.
      // Deliberately NOT scoped by `languageCode` - a query typed in either language must find
      // matches regardless of which language is currently displayed.
      code += `\n          where.OR = [`;
      for (const field of metadata.searchableFields ?? []) {
        code += `\n            { ${field}: { contains: filter.search${modeSuffix} } },`;
      }
      const searchFields = t.searchableFields?.length ? t.searchableFields : t.fields;
      const orClauses = searchFields.map((f) => `{ ${f}: { contains: filter.search${modeSuffix} } }`).join(', ');
      code += `\n            { ${t.relationName}: { some: { OR: [${orClauses}] } } },`;
      code += `\n          ];`;
    } else {
      // Base columns hold one language directly; a translated value (the other language) lives
      // in a `Translation` table instead. Search both, so a query typed in either language finds
      // matches regardless of which language is currently displayed - not scoped to `lang`. Gated
      // on `localization` (not just metadata) because this is a shared generator: only emit a
      // `prisma.translation` query for projects that actually opted into the localization config,
      // which is the same signal that guarantees a `Translation` model exists at all. Not further
      // gated on whether *this* entity type is registered for translation - querying Translation
      // for a type with zero rows is a cheap, correct no-op, simpler than teaching the generator
      // about per-type translation registration (it has no DB access at generation time anyway).
      if (localization) {
        // Scoped to the same field set as the base-column OR below (not every Translation row for
        // this entity type) so search covers the same logical fields regardless of which table
        // currently holds the active language's value for them - e.g. a `details` translation
        // shouldn't surface a match that a `details` value in the base language wouldn't.
        const fieldList = metadata.searchableFields!.map((f) => `'${f}'`).join(', ');
        code += `\n          const translationMatches = await prisma.translation.findMany({\n            where: { entityType: '${modelName}', fieldName: { in: [${fieldList}] }, value: { contains: filter.search${modeSuffix} } },\n            select: { entityId: true },\n          });`;
      }
      code += `\n          where.OR = [`;
      for (const field of metadata.searchableFields ?? []) {
        code += `\n            { ${field}: { contains: filter.search${modeSuffix} } },`;
      }
      code += `\n          ];`;
      if (localization) {
        code += `\n          if (translationMatches.length) where.OR.push({ id: { in: translationMatches.map((t: any) => t.entityId) } });`;
      }
    }
    code += `\n        }`;
  }
  code += '\n      }';
  return code;
}

function _buildInclude(metadata: EntityMetadata, langExpr?: string): string {
  const parts = (metadata.includeRelations ?? []).map((r) => `${r}: true`);
  if (metadata.translation && langExpr) {
    parts.push(`${metadata.translation.relationName}: { where: { languageCode: ${langExpr} } }`);
  }
  if (parts.length === 0) return '';
  return `include: {\n            ${parts.join(',\n            ')},\n          },`;
}

function _buildSingleResolver(modelName: string, metadata: EntityMetadata, localization?: LocalizationConfig): string {
  const camelCase = toCamelCase(modelName);
  const t = metadata.translation;

  if (t) {
    const includeLogic = _buildInclude(metadata, 'lang');
    const fieldsLiteral = JSON.stringify(t.fields);
    return `
    ${camelCase}: async (
      _: any,
      { id, lang }: { id: string; lang: string },
      { prisma }: ResolverContext,
    ) => {
      if (!isValidUUID(id)) throw new Error('Invalid ID format - must be a valid UUID');
      if (!lang) throw new Error("'lang' is required to fetch a ${modelName}");
      try {
        const data = await (prisma as any).${camelCase}.findUnique({
          where: { id },
          ${includeLogic}
        });
        return data ? flattenTranslation(data, '${t.relationName}', ${fieldsLiteral}) : null;
      } catch (error) {
        console.error('GraphQL error in ${camelCase} query:', error);
        throw error;
      }
    },`;
  }

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

function _buildListResolver(
  modelName: string,
  metadata: EntityMetadata,
  localization?: LocalizationConfig,
  caseInsensitiveSearch = true,
): string {
  const camelCase = toCamelCase(modelName);
  const t = metadata.translation;
  const filterLogic = _buildFilterLogicGQL(modelName, metadata, localization, caseInsensitiveSearch);
  const orderBy = metadata.orderBy;
  if (!orderBy) {
    throw new Error(`Missing orderBy in metadata for "${modelName}"`);
  }

  if (t) {
    const includeLogic = _buildInclude(metadata, 'lang');
    const fieldsLiteral = JSON.stringify(t.fields);
    return `
    ${camelCase}List: async (
      _: any,
      { filter, pagination, lang }: { filter?: any; pagination?: any; lang: string },
      { prisma }: ResolverContext,
    ) => {
      if (!lang) throw new Error("'lang' is required to fetch a ${modelName}List");
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
        return { data: data.map((item: any) => flattenTranslation(item, '${t.relationName}', ${fieldsLiteral})), total };
      } catch (error) {
        console.error('GraphQL error in ${camelCase}List query:', error);
        throw error;
      }
    },`;
  }

  const includeLogic = _buildInclude(metadata);
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
  const t = metadata.translation;

  if (t) {
    const includeLogic = _buildInclude(metadata, 'lang');
    const fieldsLiteral = JSON.stringify(t.fields);
    const destructure = `const { lang, ${t.fields.join(', ')}, ...baseInput } = input;`;
    const baseData = fkFields?.length ? `transform${modelName}InputToPrisma(baseInput)` : 'baseInput';
    return `
    create${modelName}: async (
      _: any,
      { input }: { input: any },
      { prisma }: ResolverContext,
    ) => {
      ${destructure}
      if (!lang) throw new Error("'lang' is required to create a ${modelName}");
      const idError = validateInputIDs(baseInput);
      if (idError) throw new Error(idError);
      try {
        const data = await (prisma as any).${camelCase}.create({
          data: {
            ...${baseData},
            ${t.relationName}: { create: { languageCode: lang, ${t.fields.join(', ')} } },
          },
          ${includeLogic}
        });
        return flattenTranslation(data, '${t.relationName}', ${fieldsLiteral});
      } catch (error) {
        console.error('GraphQL error in create${modelName} mutation:', error);
        throw error;
      }
    },`;
  }

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
  const t = metadata.translation;

  if (t) {
    const includeLogic = _buildInclude(metadata, 'lang');
    const fieldsLiteral = JSON.stringify(t.fields);
    const destructure = `const { lang, ${t.fields.join(', ')}, ...baseInput } = input;`;
    const baseData = fkFields?.length ? `transform${modelName}InputToPrisma(baseInput)` : 'baseInput';
    const translatableAssignments = t.fields.map((f) => `${f}`).join(', ');
    return `
    update${modelName}: async (
      _: any,
      { id, input }: { id: string; input: any },
      { prisma }: ResolverContext,
    ) => {
      if (!isValidUUID(id)) throw new Error('Invalid ID format - must be a valid UUID');
      ${destructure}
      if (!lang) throw new Error("'lang' is required to update a ${modelName}");
      const idError = validateInputIDs(baseInput);
      if (idError) throw new Error(idError);
      try {
        const data = await (prisma as any).${camelCase}.update({
          where: { id },
          data: {
            ...${baseData},
            ${t.relationName}: {
              upsert: {
                where: { ${t.fkFieldName}_languageCode: { ${t.fkFieldName}: id, languageCode: lang } },
                create: { languageCode: lang, ${translatableAssignments} },
                update: { ${translatableAssignments} },
              },
            },
          },
          ${includeLogic}
        });
        return flattenTranslation(data, '${t.relationName}', ${fieldsLiteral});
      } catch (error) {
        console.error('GraphQL error in update${modelName} mutation:', error);
        throw error;
      }
    },`;
  }

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

// ── GraphQL schema (SDL) generator ────────────────────────────────────────────

const PRISMA_TO_GRAPHQL: Record<string, string> = {
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Boolean: 'Boolean',
  DateTime: 'DateTime',
  BigInt: 'Int',
  Decimal: 'Float',
  Json: 'JSON',
  Bytes: 'String',
};

function _gqlFieldType(f: Field): string {
  if (f.isRelation) {
    // Eagerly `include`d by every generated resolver, so arrays are always
    // present (empty at worst); singular relations can be genuinely absent.
    return f.isArray ? `[${f.type}!]!` : f.type;
  }
  const scalar = PRISMA_TO_GRAPHQL[f.type] ?? 'String';
  return f.required ? `${scalar}!` : scalar;
}

function _buildObjectType(model: Model, metadata: Record<string, EntityMetadata>): string {
  const t = metadata[model.name]?.translation;
  const fields = model.fields
    // Drop this model's own translation relation (flattened below) and any relation to a
    // `<Model>Translation` table from another model's side (e.g. `Language.creatureTranslations`)
    // - it was never given its own GraphQL type to reference.
    .filter((f) => !(t && f.isRelation && f.name === t.relationName) && !(f.isRelation && isTranslationModel(f.type, metadata)))
    .map((f) => `  ${f.name}: ${_gqlFieldType(f)}`);
  if (t) {
    // Always nullable: the underlying `<Model>Translation` column may be NOT NULL, but a
    // translation row for the requested `lang` may simply not exist (no fallback language).
    for (const name of t.fields) fields.push(`  ${name}: String`);
  }
  return `type ${model.name} {\n${fields.join('\n')}\n}`;
}

function _buildListType(model: Model): string {
  return `type ${model.name}List {\n  data: [${model.name}!]!\n  total: Int!\n}`;
}

// Both Create and Update inputs stay fully optional: Prisma itself enforces
// required-field/DB constraints on write, so the schema doesn't need to
// duplicate that, and Update needs partial-field semantics anyway. `lang` is the one exception -
// translation-table entities require it explicitly (see EntityMetadata.translation).
function _buildInputType(model: Model, prefix: 'Create' | 'Update', skipInputFields: Set<string>, metadata?: EntityMetadata): string {
  const t = metadata?.translation;
  const fields = model.fields
    .filter((f) => !f.isRelation && !skipInputFields.has(f.name))
    .map((f) => `  ${f.name}: ${PRISMA_TO_GRAPHQL[f.type] ?? 'String'}`);
  if (t) {
    fields.push(`  lang: String!`);
    for (const name of t.fields) fields.push(`  ${name}: String`);
  }
  return `input ${prefix}${model.name}Input {\n${fields.join('\n')}\n}`;
}

function _buildQueryFields(modelNames: string[], metadata: Record<string, EntityMetadata>, hasLocalization: boolean): string {
  return modelNames
    .map((name) => {
      const camel = toCamelCase(name);
      const t = metadata[name]?.translation;
      const langArg = t ? ', lang: String!' : hasLocalization ? ', lang: String' : '';
      return `  ${camel}(id: String!${langArg}): ${name}\n  ${camel}List(filter: JSON, pagination: PaginationInput${langArg}): ${name}List!`;
    })
    .join('\n');
}

function _buildMutationFields(modelNames: string[]): string {
  return modelNames
    .map(
      (name) =>
        `  create${name}(input: Create${name}Input!): ${name}!\n  update${name}(id: String!, input: Update${name}Input!): ${name}!\n  delete${name}(id: String!): Boolean!`,
    )
    .join('\n');
}

export function generateGraphQLSchemaContent(
  models: Model[],
  metadata: Record<string, EntityMetadata>,
  options: { skipInputFields?: string[]; hasLocalization?: boolean; extend?: boolean } = {},
): string {
  const skipInputFields = options.skipInputFields ? new Set(options.skipInputFields) : DEFAULT_SKIP_INPUT_FIELDS;
  const hasLocalization = options.hasLocalization ?? false;
  const extend = options.extend ?? false;
  // Only entities present in `metadata` get resolvers generated (see
  // inferEntityMetadata), so only those get Query/Mutation/List/Input types.
  // `<Model>Translation` tables are excluded entirely - never a first-class entity.
  const visibleModels = models.filter((m) => !isTranslationModel(m.name, metadata));
  const operableModels = visibleModels.filter((m) => metadata[m.name]);
  const operableNames = operableModels.map((m) => m.name);

  const objectTypes = visibleModels.map((m) => _buildObjectType(m, metadata)).join('\n\n');
  const listTypes = operableModels.map((m) => _buildListType(m)).join('\n\n');
  const createInputs = operableModels.map((m) => _buildInputType(m, 'Create', skipInputFields, metadata[m.name])).join('\n\n');
  const updateInputs = operableModels.map((m) => _buildInputType(m, 'Update', skipInputFields, metadata[m.name])).join('\n\n');

  // In `extend` mode, `scalar`/`PaginationInput`/`Query`/`Mutation` are assumed to already be
  // declared by a base schema fragment loaded first (this generator has no opinion on what that
  // fragment contains beyond those names) - only the entity-specific types/operations are emitted.
  const preamble = extend
    ? ''
    : `scalar JSON
scalar DateTime

input PaginationInput {
  limit: Int
  offset: Int
}

`;
  const queryType = extend ? `extend type Query {\n${_buildQueryFields(operableNames, metadata, hasLocalization)}\n}` : `type Query {\n${_buildQueryFields(operableNames, metadata, hasLocalization)}\n}`;
  const mutationType = extend ? `extend type Mutation {\n${_buildMutationFields(operableNames)}\n}` : `type Mutation {\n${_buildMutationFields(operableNames)}\n}`;

  const sdl = `${preamble}${objectTypes}

${listTypes}

${createInputs}

${updateInputs}

${queryType}

${mutationType}`;

  return `/**
 * GraphQL Schema - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

export const typeDefs = \`
${sdl}
\`;
`;
}

// ── REST handler generator ────────────────────────────────────────────────────

export function generateRestHandlerContent(
  modelName: string,
  metadata: EntityMetadata,
  config: RestHandlerConfig,
): string {
  const camelCase = toCamelCase(modelName);
  const orderBy = metadata.orderBy;
  if (!orderBy) {
    throw new Error(`Missing orderBy in metadata for "${modelName}"`);
  }
  const { localization, caseInsensitiveSearch = true } = config;
  const filterLogic = _buildFilterLogicREST(modelName, metadata, localization, caseInsensitiveSearch);
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';
  const t = metadata.translation;

  const localizationImport = localization ? `import { ${localizeExport} } from '${localization.localizeImport}';\n` : '';

  const listSignature = t
    ? `list${modelName}s(req: Request, lang: string)`
    : localization
      ? `list${modelName}s(req: Request, lang?: string)`
      : `list${modelName}s(req: Request)`;
  const listGuard = t ? `\n    if (!lang) return jsonError(400, "'lang' is required to fetch ${modelName}s");` : '';
  const listInclude = t ? `\n        include: { ${t.relationName}: { where: { languageCode: lang } } },` : '';
  const localizeList = t
    ? `\n    const localizedData = data.map((item: any) => flattenTranslation(item, '${t.relationName}', ${JSON.stringify(t.fields)}));`
    : localization
      ? `\n    const localizedData = lang\n      ? await Promise.all(data.map((item: any) => ${localizeExport}(item, '${modelName}', lang)))\n      : data;`
      : '';
  const listData = t || localization ? 'localizedData' : 'data';

  const getSignature = t
    ? `get${modelName}(id: string, lang: string)`
    : localization
      ? `get${modelName}(id: string, lang?: string)`
      : `get${modelName}(id: string)`;
  const getGuard = t ? `\n    if (!lang) return jsonError(400, "'lang' is required to fetch a ${modelName}");` : '';
  const getInclude = t ? `,\n      include: { ${t.relationName}: { where: { languageCode: lang } } }` : '';
  const localizeGet = t
    ? `\n    const localizedData = flattenTranslation(data, '${t.relationName}', ${JSON.stringify(t.fields)});`
    : localization
      ? `\n    const localizedData = lang ? await ${localizeExport}(data, '${modelName}', lang) : data;`
      : '';
  const getData = t || localization ? 'localizedData' : 'data';

  const createLogic = t
    ? `    const { lang, ${t.fields.join(', ')}, ...baseInput } = input as any;
    if (!lang) return jsonError(400, "'lang' is required to create a ${modelName}");
    const idError = validateInputIDs(baseInput);
    if (idError) return jsonError(400, idError);
    const created = await (prisma as any).${camelCase}.create({
      data: {
        ...baseInput,
        ${t.relationName}: { create: { languageCode: lang, ${t.fields.join(', ')} } },
      },
      include: { ${t.relationName}: { where: { languageCode: lang } } },
    });
    const data = flattenTranslation(created, '${t.relationName}', ${JSON.stringify(t.fields)});`
    : `    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.create({ data: input });`;

  const updateLogic = t
    ? `    const { lang, ${t.fields.join(', ')}, ...baseInput } = input as any;
    if (!lang) return jsonError(400, "'lang' is required to update a ${modelName}");
    const idError = validateInputIDs(baseInput);
    if (idError) return jsonError(400, idError);
    const updated = await (prisma as any).${camelCase}.update({
      where: { id },
      data: {
        ...baseInput,
        ${t.relationName}: {
          upsert: {
            where: { ${t.fkFieldName}_languageCode: { ${t.fkFieldName}: id, languageCode: lang } },
            create: { languageCode: lang, ${t.fields.join(', ')} },
            update: { ${t.fields.join(', ')} },
          },
        },
      },
      include: { ${t.relationName}: { where: { languageCode: lang } } },
    });
    const data = flattenTranslation(updated, '${t.relationName}', ${JSON.stringify(t.fields)});`
    : `    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.update({ where: { id }, data: input });`;

  const flattenTranslationFn = t
    ? `
function flattenTranslation(entity: any, relationName: string, fields: string[]): any {
  if (!entity) return entity;
  const { [relationName]: translations, ...rest } = entity;
  const t = Array.isArray(translations) ? translations[0] : undefined;
  for (const f of fields) rest[f] = t ? (t[f] ?? null) : null;
  return rest;
}
`
    : '';

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
${flattenTranslationFn}
export async function ${listSignature}: Promise<Response> {
  try {${listGuard}
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
        orderBy: { ${orderBy}: 'asc' },${listInclude}
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
  try {${getGuard}
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const data = await (prisma as any).${camelCase}.findUnique({ where: { id }${getInclude} });
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
${createLogic}
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(400, (error as Error).message);
  }
}

export async function update${modelName}(id: string, req: Request): Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const input = await req.json();
${updateLogic}
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

function _buildFilterLogicREST(
  modelName: string,
  metadata: EntityMetadata,
  localization?: LocalizationConfig,
  caseInsensitiveSearch = true,
): string {
  const t = metadata.translation;
  const hasSearch = (metadata.searchableFields?.length ?? 0) > 0 || !!t;
  if (!metadata.filterable && !hasSearch) return 'const where: any = {};';

  // See the matching comment in _buildFilterLogicGQL - same reasoning, REST twin.
  const modeSuffix = caseInsensitiveSearch ? ", mode: 'insensitive'" : '';

  let code =
    "const where: any = {};\n\n    const filterPrefix = 'filter.';\n    url.searchParams.forEach((value, key) => {\n      if (!key.startsWith(filterPrefix)) return;\n      const field = key.slice(filterPrefix.length);\n";

  for (const [field, mode] of Object.entries(metadata.filterable ?? {})) {
    if (mode === 'contains') {
      code += `      if (field === '${field}') where['${field}'] = { contains: value${modeSuffix} };\n`;
    } else {
      code += `      if (field === '${field}') where['${field}'] = value;\n`;
    }
  }
  code += '    });\n';

  if (hasSearch) {
    code += `\n    const search = url.searchParams.get('search');\n    if (search) {`;
    if (t) {
      // Relational filter against the dedicated `<Model>Translation` table - see the matching
      // comment in _buildFilterLogicGQL. Not scoped by `languageCode` (cross-language search).
      code += `\n      where.OR = [\n`;
      for (const field of metadata.searchableFields ?? []) {
        code += `        { ${field}: { contains: search${modeSuffix} } },\n`;
      }
      const searchFields = t.searchableFields?.length ? t.searchableFields : t.fields;
      const orClauses = searchFields.map((f) => `{ ${f}: { contains: search${modeSuffix} } }`).join(', ');
      code += `        { ${t.relationName}: { some: { OR: [${orClauses}] } } },\n`;
      code += '      ];';
    } else {
      // Gated on `localization` for the same reason: only projects with that config are
      // guaranteed to have a `Translation` model at all.
      if (localization) {
        // See the matching comment in _buildFilterLogicGQL - same reasoning, REST twin.
        const fieldList = metadata.searchableFields!.map((f) => `'${f}'`).join(', ');
        code += `\n      const translationMatches = await prisma.translation.findMany({\n        where: { entityType: '${modelName}', fieldName: { in: [${fieldList}] }, value: { contains: search${modeSuffix} } },\n        select: { entityId: true },\n      });`;
      }
      code += `\n      where.OR = [\n`;
      for (const field of metadata.searchableFields ?? []) {
        code += `        { ${field}: { contains: search${modeSuffix} } },\n`;
      }
      code += '      ];';
      if (localization) {
        code += `\n      if (translationMatches.length) where.OR.push({ id: { in: translationMatches.map((t: any) => t.entityId) } });`;
      }
    }
    code += '\n    }';
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

  // getLangExport's consumer implementation may be sync or async (the generator has no way to
  // know) - `await` is always safe here regardless (a no-op on a non-Promise value), and the
  // surrounding handleRestRequest is already async. Without it, an async implementation (the
  // common case - deriving language from Accept-Language often means a DB lookup for supported
  // languages) leaves `lang` as an unresolved Promise, silently breaking every localized read.
  const langDeclaration = localization ? `\n    const lang = await ${getLangExport}(req);` : '';

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
