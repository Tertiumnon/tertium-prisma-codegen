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
