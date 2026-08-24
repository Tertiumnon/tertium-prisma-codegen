import type { DMMFField, DMMFModel, DMMFEnum, FieldMeta, EntityMeta, EnumMeta, TranslationMetadata } from './dmmf.types';

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

// ── String utilities ───────────────────────────────────────────────────────────

export function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function toDisplayName(str: string): string {
  return str.replace(/([A-Z])/g, ' $1').trim();
}

// ── Field type utilities ───────────────────────────────────────────────────────

export function scalarTsType(prismaType: string, required: boolean): string {
  const base = PRISMA_TO_TS[prismaType] ?? 'string';
  return required ? base : `${base} | null`;
}

export function scalarFormType(prismaType: string, fieldName: string): string {
  if (fieldName.endsWith('Id')) return 'relation';
  return PRISMA_TO_FORM[prismaType] ?? 'text';
}

// ── Field mapping ──────────────────────────────────────────────────────────────

export function buildFkRelationMap(model: DMMFModel): Map<string, string> {
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

export function mapField(f: DMMFField, fkRelationMap: Map<string, string>): FieldMeta {
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
      : scalarTsType(f.type, f.isRequired);

  return {
    name: f.name,
    prismaType: f.type,
    tsType,
    formType: f.kind === 'enum' ? 'text' : scalarFormType(f.type, f.name),
    required: f.isRequired,
    isPrimary: f.isId,
    isRelation: false,
    isArray: f.isList,
    relationModel: f.name.endsWith('Id') ? (fkRelationMap.get(f.name) ?? null) : null,
  };
}

// ── Per-entity translation table detection ────────────────────────────────────

/**
 * Zero-config detection of the `<Model>Translation` pattern (see TranslationMetadata) - pure
 * DMMF introspection, no consumer-supplied field lists. A model is skipped (not detected as a
 * translation owner) if any of the shape checks fail, so a same-named-but-unrelated model never
 * accidentally gets treated as a translation table.
 */
export function detectTranslationRelations(
  dmmfModels: readonly DMMFModel[],
  options: { translationModelSuffix?: string; skip?: string[] } = {},
): Map<string, TranslationMetadata> {
  const { translationModelSuffix = 'Translation', skip = [] } = options;
  const skipSet = new Set(skip);
  const modelMap = new Map(dmmfModels.map((m) => [m.name, m]));
  const result = new Map<string, TranslationMetadata>();

  for (const model of dmmfModels) {
    if (skipSet.has(model.name)) continue;

    const translationModelName = `${model.name}${translationModelSuffix}`;
    const translationModel = modelMap.get(translationModelName);
    if (!translationModel) continue;

    const hasLanguageCode = translationModel.fields.some(
      (f) => f.kind === 'scalar' && f.name === 'languageCode' && f.type === 'String',
    );
    if (!hasLanguageCode) continue;

    // The translation model must carry a relation field back to `model` - proves it "belongs"
    // to it rather than merely sharing a name by coincidence. Reads relationFromFields directly
    // rather than assuming a `${camelName}Id` naming convention, so any FK column name works.
    const backRelation = translationModel.fields.find(
      (f) => f.kind === 'object' && f.type === model.name && f.relationFromFields?.length,
    );
    if (!backRelation) continue;
    const fkFieldName = backRelation.relationFromFields![0];

    // The parent must expose the reverse list relation - this is what the generator `include`s.
    const relationField = model.fields.find(
      (f) => f.kind === 'object' && f.type === translationModelName && f.isList,
    );
    if (!relationField) continue;

    const excluded = new Set(['id', fkFieldName, 'languageCode', 'createdAt', 'updatedAt']);
    const fields = translationModel.fields
      .filter((f) => f.kind === 'scalar' && f.type === 'String' && !excluded.has(f.name))
      .map((f) => f.name);
    if (fields.length === 0) continue;

    result.set(model.name, { relationName: relationField.name, translationModelName, fkFieldName, fields });
  }

  return result;
}

// ── DMMF to EntityMeta conversion ───────────────────────────────────────────────

export function dmmfToEntityMeta(
  dmmfModels: readonly DMMFModel[],
  dmmfEnums: readonly DMMFEnum[],
): { entities: EntityMeta[]; enums: EnumMeta[] } {
  const translationOwners = detectTranslationRelations(dmmfModels);
  const translationModelNames = new Set(
    Array.from(translationOwners.values()).map((t) => t.translationModelName),
  );

  const entities: EntityMeta[] = dmmfModels
    // `<Model>Translation` tables are never a first-class entity - their fields get flattened
    // onto their parent below, so they'd otherwise show up as their own manageable table/form.
    .filter((model) => !translationModelNames.has(model.name))
    .map((model) => {
      const fkRelationMap = buildFkRelationMap(model);
      const t = translationOwners.get(model.name);
      const fields = model.fields
        // Drop this model's own translation relation (flattened below) and any relation to a
        // `<Model>Translation` table from another model's side (e.g. `Language.creatureTranslations`)
        // - never a first-class entity, so it was excluded from `entities` above too.
        .filter((f) => !(t && f.kind === 'object' && f.name === t.relationName) && !(f.kind === 'object' && translationModelNames.has(f.type)))
        .map((f) => mapField(f, fkRelationMap));
      if (t) {
        for (const name of t.fields) {
          fields.push({
            name,
            prismaType: 'String',
            tsType: 'string | null',
            formType: 'text',
            required: false,
            isPrimary: false,
            isRelation: false,
            isArray: false,
            relationModel: null,
          });
        }
      }
      return {
        name: model.name,
        camel: toCamelCase(model.name),
        kebab: toKebabCase(model.name),
        displayName: toDisplayName(model.name),
        fields,
        ...(t && { requiresLang: true }),
      };
    });

  const enums: EnumMeta[] = dmmfEnums.map((e) => ({
    name: e.name,
    values: e.values.map((v) => v.name),
  }));

  return { entities, enums };
}
