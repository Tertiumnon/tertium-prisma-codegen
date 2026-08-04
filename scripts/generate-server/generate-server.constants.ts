export const DEFAULT_CONFIG = {
  prismaClientImport: './generated/prisma/client',
  prismaSingletonPath: '../db/prisma',
  graphqlContextPath: './graphql.context',
  entitiesDir: 'src/entities',
  restRouterOut: 'src/core/rest.router.auto.ts',
  graphqlResolversOut: 'src/core/graphql.resolvers.auto.ts',
  searchablePatterns: ['name', 'title'],
  enumIntPatterns: [],
  skipFilterable: [],
  orderByPreference: ['name', 'title', 'createdAt'],
};

export const CLI_ARGS_HELP = `
Options (all optional with sensible defaults):
  --prisma-client-import         Import path to PrismaClient
  --prisma-singleton-path        Import path to Prisma singleton
  --graphql-context-path         Import path to GraphQL context type
  --entities-dir                 Where to write entity files
  --rest-router-out              Output path for REST router
  --graphql-resolvers-out        Output path for GraphQL resolvers
  --searchable-patterns          Comma-separated regex patterns for searchable fields
  --enum-int-patterns            Comma-separated regex patterns for enum-like int fields
  --skip-filterable              Comma-separated field names to exclude from filterable
  --order-by-preference          Comma-separated field names for orderBy preference
`;
