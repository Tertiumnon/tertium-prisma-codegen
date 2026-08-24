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

// ── Per-entity translation table detection ────────────────────────────────────

/**
 * Describes a model's dedicated `<Model>Translation` relation - the replacement for the
 * polymorphic `Translation` table pattern, detected purely from DMMF (no config needed): a
 * model `Foo` "has translations" when a model literally named `${Foo}Translation` exists, has
 * its own `languageCode: String` field, and a relation field pointing back at `Foo`.
 */
export type TranslationMetadata = {
  /** Name of the list relation field on the parent model, e.g. 'translations'. */
  relationName: string;
  /** e.g. 'CreatureTranslation'. */
  translationModelName: string;
  /** Scalar FK field on the translation model pointing back at the parent, e.g. 'creatureId'. */
  fkFieldName: string;
  /** The translation model's own translatable String fields, minus id/FK/languageCode/timestamps. */
  fields: string[];
  /**
   * Subset of `fields` to actually match against for `filter.search` (e.g. title, not a long-form
   * `details`/lore field) - set by `inferEntityMetadata` from `searchableFieldPatterns`, mirroring
   * how base-column search is scoped. Absent (or empty) means "no restriction configured": search
   * logic should fall back to matching every field in `fields`.
   */
  searchableFields?: string[];
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
  /** True when this entity has a detected `<Model>Translation` relation - `lang` is then a
   * required argument on its queries/mutations (no fallback language), not merely optional. */
  requiresLang?: boolean;
}

export interface EnumMeta {
  name: string;
  values: string[];
}
