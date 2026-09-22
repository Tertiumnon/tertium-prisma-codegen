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

/**
 * How a row's owning user is determined, for generators that scope queries to the caller.
 *
 * Reference data (a creature template, an item) has no owner and omits this entirely.
 * Per-user data (a player's character, a party's campaign log) declares one, and every
 * generated query is then constrained to rows the caller owns.
 */
export type OwnershipRule =
  /**
   * The owning user's id is a column on this model, e.g. `{ field: 'ownerId' }` on a Character.
   */
  | { field: string }
  /**
   * The row is owned through a relation rather than directly. A PartyEvent, for example,
   * belongs to whoever owns its Party:
   * `{ via: { relation: 'party', foreignKey: 'partyId', model: 'Party', field: 'dmUserId' } }`
   *
   * `relation` and `field` build the Prisma filter (`{ party: { dmUserId: caller } }`).
   * `model` and `foreignKey` let create validate the parent before inserting, since a
   * relation filter cannot apply to a row that does not exist yet.
   */
  | { via: { relation: string; foreignKey: string; model: string; field: string } };

export type EntityMetadata = {
  filterable?: Record<string, FilterMode>;
  searchableFields?: string[];
  includeRelations?: IncludeRelation[];
  orderBy?: string;
  /** Set when this model has a detected `<Model>Translation` relation - see TranslationMetadata. */
  translation?: TranslationMetadata;
  /**
   * Scopes every generated query for this model to the calling user. Requires the matching
   * `ownership` config on the generator (see `RestHandlerConfig.ownership`); without it the
   * rule is ignored, so metadata alone can never half-apply a guard.
   *
   * Opt-in per model: a model without this generates exactly what it did before.
   */
  owner?: OwnershipRule;
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

export type OwnershipConfig = {
  /** Module exporting the caller resolver, relative to the generated handler file. */
  callerImport: string;
  /**
   * Named export taking the `Request` and returning the calling user's id, or null when the
   * request is unauthenticated. Defaults to `callerIdFromRequest`.
   */
  callerExport?: string;
};

export type RestHandlerConfig = {
  prismaClientPath: string;
  localization?: LocalizationConfig;
  /** See `GraphQLResolverConfig.caseInsensitiveSearch` - same meaning, REST twin. */
  caseInsensitiveSearch?: boolean;
  /**
   * Enables per-caller scoping for models whose metadata carries an `owner` rule. Both halves
   * are required: a model with an `owner` rule but no `ownership` config here generates
   * unscoped handlers, so this is checked at generation time and throws rather than silently
   * emitting an unguarded handler for data that asked to be guarded.
   */
  ownership?: OwnershipConfig;
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
