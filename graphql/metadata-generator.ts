import type { EntityMetadata } from '../types';

/** Returns the file content for the auto-generated GraphQL metadata constants file. */
export function generateGraphQLMetadataFileContent(metadata: Record<string, EntityMetadata>): string {
  return `/**
 * GraphQL Entity Metadata - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

export type EntityMetadata = {
  filterable?: Record<string, 'contains' | 'equals'>;
  searchableFields?: string[];
  includeRelations?: string[];
  orderBy?: string;
};

export const GRAPHQL_ENTITY_METADATA: Record<string, EntityMetadata> = ${JSON.stringify(metadata, null, 2)};
`;
}

/**
 * Returns the file content for the auto-generated GraphQL context types file.
 * @param extraFields Optional additional fields to include in the context interface.
 */
export function generateGraphQLContextTypesContent(extraFields?: Record<string, string>): string {
  const extra = extraFields
    ? Object.entries(extraFields)
        .map(([k, v]) => `  ${k}?: ${v};`)
        .join('\n')
    : '';

  return `/**
 * GraphQL Context Types - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

export interface GraphQLResolverContext {
  userId?: string;
  isAdmin?: boolean;
  userRoles?: string[];
${extra ? extra + '\n' : ''}}\n`;
}
