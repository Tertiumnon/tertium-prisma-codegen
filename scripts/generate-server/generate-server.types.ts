export interface ServerGeneratorConfig {
  prismaClientImport: string;
  prismaSingletonPath: string;
  graphqlContextPath: string;
  entitiesDir: string;
  restRouterOut: string;
  graphqlResolversOut: string;
  searchablePatterns: RegExp[];
  enumIntPatterns: RegExp[];
  skipFilterable: string[];
  orderByPreference: string[];
}
