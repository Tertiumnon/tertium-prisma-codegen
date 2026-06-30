import type { EntityMeta } from '../entity-meta';

export interface ClientSchemaConfig {
  /** Import path for the TableSchema type */
  tableSchemaImport: string;
  /** Import path for the entity options loader service */
  optionsServiceImport: string;
  /** Export name of the options loader function (default: 'fetchAllEntityOptions') */
  optionsServiceExport?: string;
  /** Field names to exclude from the generated form (e.g. ['id', 'createdAt', 'updatedAt']) */
  skipFields?: string[];
  /** Field names rendered as 'textarea' instead of 'text' (e.g. ['summary', 'details']) */
  largeTextFields?: string[];
}

function prettifyLabel(name: string): string {
  const words = name.replace(/([A-Z])/g, ' $1').trim().split(' ');
  return words
    .map((w, i) => {
      const t = w.slice(0, 16);
      return i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('');
}

/**
 * Generates the content of a `{entity}.schema.auto.ts` file.
 * Produces a TableSchema with form field definitions and lazy relation loaders.
 */
export function generateClientSchemaContent(entity: EntityMeta, config: ClientSchemaConfig): string {
  const {
    tableSchemaImport,
    optionsServiceImport,
    optionsServiceExport = 'fetchAllEntityOptions',
    skipFields = [],
    largeTextFields = [],
  } = config;

  const skipSet = new Set(skipFields);
  const largeTextSet = new Set(largeTextFields);

  const formFields = entity.fields.filter((f) => !f.isRelation && !skipSet.has(f.name));
  const regularFields = formFields.filter((f) => !largeTextSet.has(f.name));
  const textareaFields = formFields.filter((f) => largeTextSet.has(f.name));

  const regularDefs = regularFields
    .map((f) => {
      const label = prettifyLabel(f.name);
      const required = f.required ? ', required: true' : '';

      if (f.formType === 'relation' && f.relationModel) {
        return `  {
    name: '${f.name}',
    label: '${label}',
    type: 'relation' as const,
    optionsLoader: async () => {
      const { ${optionsServiceExport} } = await import('${optionsServiceImport}');
      return ${optionsServiceExport}('${f.relationModel}');
    },
  }`;
      }

      return `  { name: '${f.name}', label: '${label}', type: '${f.formType}'${required} }`;
    })
    .join(',\n');

  const textareaDefs = textareaFields
    .map((f) => `  { name: '${f.name}', label: '${prettifyLabel(f.name)}', type: 'textarea' }`)
    .join(',\n');

  const allDefs = [regularDefs, textareaDefs].filter(Boolean).join(',\n');

  return `/**
 * ${entity.displayName} Schema — auto-generated, do not edit
 */

import type { TableSchema } from '${tableSchemaImport}';

export const ${entity.camel}Schema: TableSchema = {
  name: '${entity.kebab}',
  displayName: '${entity.displayName}',
  primaryKey: 'id',
  sortField: 'name',
  fields: [
${allDefs},
  ],
};
`;
}
