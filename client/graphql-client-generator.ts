import type { EntityMeta } from '../entity-meta';

export interface GraphQLClientConfig {
  /** Import path for the graphqlRequest function */
  graphqlRequestImport: string;
  /** Export name of the graphqlRequest function (default: 'graphqlRequest') */
  graphqlRequestExport?: string;
  /** Import path for the ApiList / PaginationInput types barrel */
  apiTypesImport: string;
}

/**
 * Generates the content of a `{entity}.client.auto.ts` file.
 * Produces typed GraphQL CRUD functions: fetch, fetchList, create, update, delete.
 */
export function generateGraphQLClientContent(entity: EntityMeta, config: GraphQLClientConfig): string {
  const { graphqlRequestImport, graphqlRequestExport = 'graphqlRequest', apiTypesImport } = config;

  const allFields = entity.fields
    .map((f) => {
      if (f.isRelation) return `        ${f.name} {\n          id\n          title\n        }`;
      return `        ${f.name}`;
    })
    .join('\n');

  return `/**
 * ${entity.displayName} Client — auto-generated, do not edit
 */

import { ${graphqlRequestExport} } from '${graphqlRequestImport}';
import type { ApiList, PaginationInput } from '${apiTypesImport}';
import type { ${entity.name} } from './${entity.kebab}.types.auto';

export async function fetch${entity.name}(id: string): Promise<${entity.name} | null> {
  const data = await ${graphqlRequestExport}<{ ${entity.camel}: ${entity.name} | null }>(\`
    query Get${entity.name}($id: String!) {
      ${entity.camel}(id: $id) {
${allFields}
      }
    }
  \`, { id });
  return data.${entity.camel};
}

export async function fetch${entity.name}List(filter?: any, pagination?: PaginationInput): Promise<ApiList<${entity.name}>> {
  const data = await ${graphqlRequestExport}<{ ${entity.camel}List: ApiList<${entity.name}> }>(\`
    query Get${entity.name}List($filter: JSON, $pagination: PaginationInput) {
      ${entity.camel}List(filter: $filter, pagination: $pagination) {
        data {
${allFields}
        }
        total
      }
    }
  \`, { filter, pagination });
  return data.${entity.camel}List;
}

export async function create${entity.name}(input: Partial<${entity.name}>): Promise<${entity.name}> {
  const data = await ${graphqlRequestExport}<{ create${entity.name}: ${entity.name} }>(\`
    mutation Create${entity.name}($input: Create${entity.name}Input!) {
      create${entity.name}(input: $input) { id }
    }
  \`, { input });
  return data.create${entity.name};
}

export async function update${entity.name}(id: string, input: Partial<${entity.name}>): Promise<${entity.name}> {
  const data = await ${graphqlRequestExport}<{ update${entity.name}: ${entity.name} }>(\`
    mutation Update${entity.name}($id: String!, $input: Update${entity.name}Input!) {
      update${entity.name}(id: $id, input: $input) { id }
    }
  \`, { id, input });
  return data.update${entity.name};
}

export async function delete${entity.name}(id: string): Promise<boolean> {
  const data = await ${graphqlRequestExport}<{ delete${entity.name}: boolean }>(\`
    mutation Delete${entity.name}($id: String!) {
      delete${entity.name}(id: $id)
    }
  \`, { id });
  return data.delete${entity.name};
}
`;
}
