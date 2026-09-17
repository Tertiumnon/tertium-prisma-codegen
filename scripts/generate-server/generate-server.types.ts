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
  /** Field names (matched globally, across every model) never exposed by generated code - not in
   * the read/input TypeScript types, not selectable on the GraphQL object type, not settable via
   * a GraphQL/REST mutation, and stripped from every REST response. For columns like a password
   * hash that must never round-trip through generic CRUD even though the model itself is a
   * legitimate entity (unlike excludeModels, which drops the whole model). */
  sensitiveFields: string[];
}
