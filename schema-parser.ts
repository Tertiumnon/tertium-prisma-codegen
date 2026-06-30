import type { DMMFField, DMMFModel, Field, ForeignKeyField, Model } from './types';

export function parsePrismaModels(dmmfModels: readonly DMMFModel[]): Model[] {
  return dmmfModels.map((m) => ({
    name: m.name,
    dbName: m.dbName ?? m.name,
    fields: m.fields.map(mapField),
  }));
}

function mapField(f: DMMFField): Field {
  return {
    name: f.name,
    type: f.type,
    required: f.isRequired,
    isId: f.isId,
    isRelation: f.kind === 'object',
    isArray: f.isList,
  };
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
