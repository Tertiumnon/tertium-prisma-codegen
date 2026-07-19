import type { DMMFField, DMMFModel, FilterMode } from '../dmmf/dmmf.types';

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
  /**
   * Ordered list of field names to try when deciding a model's default `orderBy`.
   * The first field name that exists on the model wins. If none match, falls back to the primary key.
   */
  orderByFieldPreference?: string[];
};

export type TypesGeneratorOptions = {
  skipInputFields?: string[];
  /**
   * Computes the import path for a related entity's type, relative to the file being generated.
   * Defaults to `../{kebab-case}/{kebab-case}.types.auto`.
   */
  relationImportPath?: (relatedModelName: string) => string;
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
