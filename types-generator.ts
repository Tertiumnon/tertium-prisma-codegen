import type { Model, TypesGeneratorOptions } from './types';
import { prismaToTsType } from './schema-parser';

const DEFAULT_SKIP_INPUT_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

/** Returns the file content for a `{entity}.types.auto.ts` file. */
export function generateEntityTypesContent(model: Model, options: TypesGeneratorOptions = {}): string {
  const skipInputFields = options.skipInputFields ? new Set(options.skipInputFields) : DEFAULT_SKIP_INPUT_FIELDS;

  const scalarFields = model.fields.filter((f) => !f.isRelation);
  const relationFields = model.fields.filter((f) => f.isRelation);

  const mainFields = [
    ...scalarFields.map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`),
    ...relationFields.map((f) =>
      f.isArray
        ? `  ${f.name}${f.required ? '' : '?'}: ${f.type}[];`
        : `  ${f.name}${f.required ? '' : '?'}: ${f.type} | null;`,
    ),
  ].join('\n');

  const inputFields = scalarFields
    .filter((f) => !skipInputFields.has(f.name))
    .map((f) => `  ${f.name}${f.required ? '' : '?'}: ${prismaToTsType(f.type)};`)
    .join('\n');

  return `/**
 * ${model.name} Types
 * Auto-generated from Prisma schema - DO NOT EDIT
 */

export interface ${model.name} {
${mainFields}
}

export interface ${model.name}Input {
${inputFields}
}
`;
}
