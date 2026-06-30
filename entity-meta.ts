import type { DMMFModel, DMMFField } from './types';

// ── Shared types (served by backend /entities, consumed by frontend generator) ──

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

export interface DMMFEnum {
  name: string;
  values: readonly { name: string }[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function toDisplayName(str: string): string {
  return str.replace(/([A-Z])/g, ' $1').trim();
}

function scalarTsType(prismaType: string, required: boolean): string {
  const base = PRISMA_TO_TS[prismaType] ?? 'string';
  return required ? base : `${base} | null`;
}

function scalarFormType(prismaType: string, fieldName: string): string {
  if (fieldName.endsWith('Id')) return 'relation';
  return PRISMA_TO_FORM[prismaType] ?? 'text';
}

/** Maps each FK scalar field name to the relation model name it points to. */
function buildFkRelationMap(model: DMMFModel): Map<string, string> {
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

function mapField(f: DMMFField, fkRelationMap: Map<string, string>): FieldMeta {
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

  const tsType = f.kind === 'enum'
    ? (f.isRequired ? f.type : `${f.type} | null`)
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

// ── Main converter ────────────────────────────────────────────────────────────

export function dmmfToEntityMeta(
  dmmfModels: readonly DMMFModel[],
  dmmfEnums: readonly DMMFEnum[],
): { entities: EntityMeta[]; enums: EnumMeta[] } {
  const entities: EntityMeta[] = dmmfModels.map((model) => {
    const fkRelationMap = buildFkRelationMap(model);
    return {
      name: model.name,
      camel: toCamelCase(model.name),
      kebab: toKebabCase(model.name),
      displayName: toDisplayName(model.name),
      fields: model.fields.map((f) => mapField(f, fkRelationMap)),
    };
  });

  const enums: EnumMeta[] = dmmfEnums.map((e) => ({
    name: e.name,
    values: e.values.map((v) => v.name),
  }));

  return { entities, enums };
}
