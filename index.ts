// ── DMMF input types (compatible with PrismaClient._runtimeDataModel) ────────

export type FilterMode = 'contains' | 'equals';

export type DMMFField = {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isRequired: boolean;
  isList: boolean;
  isId: boolean;
  relationName?: string;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};

export type DMMFModel = {
  name: string;
  dbName?: string | null;
  fields: readonly DMMFField[];
};

export type DMMFEnum = {
  name: string;
  values: readonly { name: string }[];
};

// ── Internal model types (used by server generators) ─────────────────────────

export type Field = {
  name: string;
  type: string;
  required: boolean;
  isId: boolean;
  isRelation: boolean;
  isArray: boolean;
};

export type Model = {
  name: string;
  dbName?: string;
  fields: Field[];
};

export type ForeignKeyField = {
  fieldName: string;
  relationName: string;
  isRequired: boolean;
};

export type EntityMetadata = {
  filterable?: Record<string, FilterMode>;
  searchableFields?: string[];
  includeRelations?: string[];
  orderBy?: string;
};

// ── Generator option/config types ─────────────────────────────────────────────

export type MetadataInferrerOptions = {
  skipFilterableFields?: string[];
  searchableFieldPatterns?: RegExp[];
  enumLikeIntPatterns?: RegExp[];
};

export type TypesGeneratorOptions = {
  skipInputFields?: string[];
};

export type LocalizationConfig = {
  localizeImport: string;
  localizeExport?: string;
};

export type GraphQLResolverConfig = {
  prismaClientPath: string;
  prismaClientExport?: string;
  contextTypePath: string;
  contextTypeExport?: string;
  localization?: LocalizationConfig;
};

export type RestHandlerConfig = {
  prismaClientPath: string;
  localization?: LocalizationConfig;
};

export type RestRouterConfig = {
  entityImportBase: string;
  extraImports?: string;
  extraRoutes?: string;
  extraHelpers?: string;
  localization?: {
    getLangImport: string;
    getLangExport?: string;
  };
};

// ── EntityMeta types (served by /entities, consumed by frontend generator) ───

export interface FieldMeta {
  name: string;
  prismaType: string;
  tsType: string;
  formType: string;
  required: boolean;
  isPrimary: boolean;
  isRelation: boolean;
  isArray: boolean;
  relationModel: string | null;
}

export interface EntityMeta {
  name: string;
  camel: string;
  kebab: string;
  displayName: string;
  fields: FieldMeta[];
}

export interface EnumMeta {
  name: string;
  values: string[];
}

// ── Type mappings ─────────────────────────────────────────────────────────────

const PRISMA_TO_TS: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'string',
  BigInt: 'number',
  Decimal: 'number',
  Json: 'any',
  Bytes: 'string',
};

const PRISMA_TO_FORM: Record<string, string> = {
  Int: 'number',
  BigInt: 'number',
  Float: 'float',
  Decimal: 'float',
  Boolean: 'boolean',
  DateTime: 'date',
  Json: 'textarea',
};

function _toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function _toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function _toDisplayName(str: string): string {
  return str.replace(/([A-Z])/g, ' $1').trim();
}

function _scalarTsType(prismaType: string, required: boolean): string {
  const base = PRISMA_TO_TS[prismaType] ?? 'string';
  return required ? base : `${base} | null`;
}

function _scalarFormType(prismaType: string, fieldName: string): string {
  if (fieldName.endsWith('Id')) return 'relation';
  return PRISMA_TO_FORM[prismaType] ?? 'text';
}

function _buildFkRelationMap(model: DMMFModel): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of model.fields) {
    if (field.kind === 'object' && field.relationFromFields?.length) {
      for (const fkName of field.relationFromFields) {
        map.set(fkName, field.type);
      }
    }
  }
  return map;
}

function _mapField(f: DMMFField, fkRelationMap: Map<string, string>): FieldMeta {
  if (f.kind === 'object') {
    return {
      name: f.name,
      prismaType: f.type,
      tsType: f.type,
      formType: 'relation',
      required: f.isRequired,
      isPrimary: false,
      isRelation: true,
      isArray: f.isList,
      relationModel: f.type,
    };
  }

  const tsType =
    f.kind === 'enum'
      ? f.isRequired
        ? f.type
        : `${f.type} | null`
      : _scalarTsType(f.type, f.isRequired);

  return {
    name: f.name,
    prismaType: f.type,
    tsType,
    formType: f.kind === 'enum' ? 'text' : _scalarFormType(f.type, f.name),
    required: f.isRequired,
    isPrimary: f.isId,
    isRelation: false,
    isArray: f.isList,
    relationModel: f.name.endsWith('Id') ? (fkRelationMap.get(f.name) ?? null) : null,
  };
}

export function dmmfToEntityMeta(
  dmmfModels: readonly DMMFModel[],
  dmmfEnums: readonly DMMFEnum[],
): { entities: EntityMeta[]; enums: EnumMeta[] } {
  const entities: EntityMeta[] = dmmfModels.map((model) => {
    const fkRelationMap = _buildFkRelationMap(model);
    return {
      name: model.name,
      camel: _toCamelCase(model.name),
      kebab: _toKebabCase(model.name),
      displayName: _toDisplayName(model.name),
      fields: model.fields.map((f) => _mapField(f, fkRelationMap)),
    };
  });

  const enums: EnumMeta[] = dmmfEnums.map((e) => ({
    name: e.name,
    values: e.values.map((v) => v.name),
  }));

  return { entities, enums };
}
