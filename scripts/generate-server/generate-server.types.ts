export interface ServerGeneratorConfig {
  prismaClientImport: string;
  prismaSingletonPath: string;
  graphqlContextPath: string;
  entitiesDir: string;
  restRouterOut: string;
  graphqlResolversOut: string;
  graphqlSchemaOut: string;
  searchablePatterns: RegExp[];
  enumIntPatterns: RegExp[];
  skipFilterable: string[];
  orderByPreference: string[];
  /** Model names to omit entirely from generation (entities, REST router, GraphQL schema/resolvers),
   * including relation fields on other models that point at them. For internal-only tables (e.g. a
   * refresh-token store) that must never get a generic CRUD surface. */
  excludeModels: string[];
}
