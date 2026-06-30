import type { EntityMeta, EnumMeta } from '../entity-meta';
import { toKebabCase } from '../schema-parser';

export interface ClientTypesConfig {
  /** Base path from the entity file to the entities directory, e.g. '../../entities' */
  entityImportBase: string;
  /** Import path for the generated enums barrel file */
  enumsImport: string;
}

/**
 * Generates the content of a `{entity}.types.auto.ts` file.
 * Produces a TypeScript interface with typed relations and enum imports.
 */
export function generateClientTypesContent(
  entity: EntityMeta,
  allEntities: EntityMeta[],
  enums: EnumMeta[],
  config: ClientTypesConfig,
): string {
  const { entityImportBase, enumsImport } = config;

  const entityNames = new Set(allEntities.map((e) => e.name));
  const enumNames = new Set(enums.map((e) => e.name));

  const entitiesToImport = new Set<string>();
  const enumsToImport = new Set<string>();

  for (const f of entity.fields) {
    if (!f.isRelation || !f.tsType || f.tsType === entity.name) continue;
    if (entityNames.has(f.tsType)) entitiesToImport.add(f.tsType);
    else if (enumNames.has(f.tsType)) enumsToImport.add(f.tsType);
  }

  const entityImports = Array.from(entitiesToImport)
    .sort()
    .map((type) => {
      const kebab = toKebabCase(type);
      return `import type { ${type} } from '${entityImportBase}/${kebab}/${kebab}.types.auto';`;
    })
    .join('\n');

  const enumImport =
    enumsToImport.size > 0
      ? `import { ${Array.from(enumsToImport).sort().join(', ')} } from '${enumsImport}';`
      : '';

  const importSection = [entityImports, enumImport].filter(Boolean).join('\n');

  const fields = entity.fields
    .map((f) => {
      const optional = f.required ? '' : '?';
      if (f.isRelation && entityNames.has(f.tsType)) {
        if (f.isArray) return `  ${f.name}${optional}: ${f.tsType}[];`;
        return `  ${f.name}${optional}: ${f.tsType}${f.required ? '' : ' | null'};`;
      }
      let fieldType = f.tsType;
      if (
        f.isRelation &&
        !entityNames.has(f.tsType) &&
        !enumNames.has(f.tsType) &&
        /^[A-Z]/.test(f.tsType) &&
        !f.tsType.includes('|')
      ) {
        fieldType = 'string';
      }
      return `  ${f.name}${optional}: ${fieldType};`;
    })
    .join('\n');

  return `/**
 * ${entity.displayName} — auto-generated, do not edit
 */

${importSection ? importSection + '\n\n' : ''}export interface ${entity.name} {
${fields}
}
`;
}
