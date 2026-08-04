export const DEFAULT_CONFIG = {
  entitiesDir: 'src/entities',
  entityImportBase: '../../entities',
  graphqlRequestImport: '../../core/graphql/graphql.client',
  apiTypesImport: '../../core/graphql/graphql.types.auto',
  tableSchemaImport: '../../core/rest/rest.types',
  tableSchemaOut: 'src/core/rest/rest.types.ts',
  optionsServiceImport: '../../core/graphql/graphql.service',
  clientBarrelOut: 'src/core/graphql/graphql.client.auto.ts',
  typesBarrelOut: 'src/core/graphql/graphql.types.auto.ts',
  enumsOut: 'src/core/graphql/graphql.enums.auto.ts',
  schemasBarrelOut: 'src/core/rest/rest.schemas.auto.ts',
  enumsImport: './graphql.enums.auto',
  scalarsImport: '@prisma/client',
  skipFields: ['id', 'createdAt', 'updatedAt'],
  largeTextFields: [],
  sortFieldPreference: ['name', 'title', 'createdAt'],
};

export const CLI_ARGS_HELP = `
Options (all optional with sensible defaults):
  --api <url>                    API URL for entity metadata (required)
  --entities-dir                 Where to write entity files
  --entity-import-base           Path from entities back to root
  --graphql-request-import       Import path for graphQL request function
  --api-types-import             Import path for API types barrel
  --table-schema-import          Import path for TableSchema type (matches --table-schema-out)
  --table-schema-out             Output path for generated TableSchema type file
  --options-service-import       Import path for entity options loader
  --client-barrel-out            Output path for client barrel
  --types-barrel-out             Output path for types barrel
  --enums-out                    Output path for enums file
  --schemas-barrel-out           Output path for schemas barrel
  --enums-import                 Enum import path in types barrel
  --scalars-import               Scalar types import path
  --skip-fields                  Comma-separated fields to skip in forms
  --large-text-fields            Comma-separated fields to render as textarea
  --sort-field-preference        Comma-separated field names for sort preference
`;
