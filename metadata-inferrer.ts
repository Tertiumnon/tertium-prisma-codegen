import type { DMMFModel, EntityMetadata, MetadataInferrerOptions } from './types';

/**
 * Infer EntityMetadata for all models from Prisma's runtime data model.
 *
 * Applies these heuristics:
 * - String scalar fields (non-ID) → filterable 'contains', and searchable if name matches a pattern
 * - *Id scalar fields → filterable 'equals'
 * - Boolean scalar fields → filterable 'equals'
 * - Int scalar fields whose name matches enumLikeIntPatterns → filterable 'equals'
 * - object-kind fields → included in includeRelations
 * - orderBy prefers 'name', then 'title', then 'createdAt'
 */
export function inferEntityMetadata(
  dmmfModels: readonly DMMFModel[],
  options: MetadataInferrerOptions = {},
): Record<string, EntityMetadata> {
  const {
    skipFilterableFields = [],
    searchableFieldPatterns = [],
    enumLikeIntPatterns = [],
  } = options;

  const skipSet = new Set(skipFilterableFields);
  const metadata: Record<string, EntityMetadata> = {};

  for (const model of dmmfModels) {
    const filterable: Record<string, 'contains' | 'equals'> = {};
    const searchableFields: string[] = [];
    const includeRelations: string[] = [];

    for (const field of model.fields) {
      if (field.kind === 'object') {
        if (!field.isList && field.relationFromFields?.length) continue; // owning-side scalar FK, not a nav prop we include
        includeRelations.push(field.name);
        continue;
      }

      if (field.kind !== 'scalar') continue;

      const { name, type } = field;

      if (type === 'String' && !name.endsWith('Id')) {
        if (!skipSet.has(name)) filterable[name] = 'contains';
        if (searchableFieldPatterns.some((p) => p.test(name))) {
          searchableFields.push(name);
        }
      } else if (name.endsWith('Id') && !skipSet.has(name)) {
        filterable[name] = 'equals';
      } else if (type === 'Boolean') {
        filterable[name] = 'equals';
      } else if (type === 'Int' && enumLikeIntPatterns.some((p) => p.test(name))) {
        filterable[name] = 'equals';
      }
    }

    const fieldNames = model.fields.map((f) => f.name);
    let orderBy = 'createdAt';
    if (fieldNames.includes('name')) orderBy = 'name';
    else if (fieldNames.includes('title')) orderBy = 'title';

    if (Object.keys(filterable).length > 0 || searchableFields.length > 0 || includeRelations.length > 0) {
      metadata[model.name] = {
        ...(Object.keys(filterable).length > 0 && { filterable }),
        ...(searchableFields.length > 0 && { searchableFields }),
        ...(includeRelations.length > 0 && { includeRelations }),
        orderBy,
      };
    }
  }

  return metadata;
}
