import type { DMMFField, DMMFModel, FilterMode, TranslationMetadata } from '../dmmf/dmmf.types';

export type { TranslationMetadata };

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

export type IncludeRelation = {
  name: string;
  /**
   * Set when this relation's target model is itself a translation-table entity (has its own
   * `translation` metadata) - lets the generator emit a scoped nested include + flatten the
   * related row too, instead of a flat `true` that silently drops its translatable fields.
   */
  targetTranslation?: TranslationMetadata;
};

export type EntityMetadata = {
  filterable?: Record<string, FilterMode>;
  searchableFields?: string[];
  includeRelations?: IncludeRelation[];
  orderBy?: string;
  /** Set when this model has a detected `<Model>Translation` relation - see TranslationMetadata. */
  translation?: TranslationMetadata;
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
  /** Suffix identifying a per-entity translation table by convention. Defaults to 'Translation'. */
  translationModelSuffix?: string;
  /** Model names to exclude from translation-relation auto-detection even if they match the naming convention. */
  skipTranslationDetection?: string[];
};

export type TypesGeneratorOptions = {
  skipInputFields?: string[];
  /**
   * Field names (matched globally, across every model) to omit from BOTH the read type and the
   * input type entirely - e.g. a password hash column. Unlike `skipInputFields` (write-side only,
   * for fields like `id`/`createdAt` a client shouldn't set but should still be able to read),
   * a sensitive field must never round-trip through generated code at all.
   */
  sensitiveFields?: string[];
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
  /**
   * Whether the target Prisma datasource supports the `mode: 'insensitive'` StringFilter
   * option - Postgres does; MySQL/SQLite do not (Prisma Client omits `mode` from their
   * `StringFilter` type entirely, and passing it throws "Unknown argument `mode`" at runtime,
   * not just a type error). Defaults to `true` (Postgres, the original assumption this
   * generator was built under) for backward compatibility - MySQL/SQLite consumers must pass
   * `false` explicitly. When `false`, `contains` filters (per-field `filter.<field>`,
   * `filter.search`, and the Translation-table search) are emitted without `mode`, relying on
   * the database's own default collation for case-insensitivity instead.
   */
  caseInsensitiveSearch?: boolean;
};

export type RestHandlerConfig = {
  prismaClientPath: string;
  localization?: LocalizationConfig;
  /** See `GraphQLResolverConfig.caseInsensitiveSearch` - same meaning, REST twin. */
  caseInsensitiveSearch?: boolean;
  /**
   * Field names (matched globally, across every model) stripped from every REST response
   * (list/get) and from create/update request bodies before they reach Prisma - e.g. a password
   * hash column. REST has no schema layer to lean on the way GraphQL's SDL does, so this handler
   * needs its own filtering.
   */
  sensitiveFields?: string[];
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
  /**
   * Per-model metadata (the same map passed to `generateRestHandlerContent` for each model) -
   * lets the router pass `lang` only to models whose handler actually accepts it (required for
   * `translation`-owning models, absent entirely for plain ones - see `generateRestHandlerContent`).
   * Without this, a model with no `<Model>Translation` relation and no `localization` config gets
   * a zero-arg handler signature, and passing `lang` to it unconditionally is a compile error.
   * Omit for the old blanket-`localization` behavior (uniform optional `lang` on every handler).
   */
  metadataByModel?: Record<string, EntityMetadata>;
};
