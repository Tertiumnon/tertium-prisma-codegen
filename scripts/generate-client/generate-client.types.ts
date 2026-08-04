export interface ClientGeneratorConfig {
  apiUrl: string;
  entitiesDir: string;
  entityImportBase: string;
  graphqlRequestImport: string;
  apiTypesImport: string;
  tableSchemaImport: string;
  tableSchemaOut: string;
  optionsServiceImport: string;
  clientBarrelOut: string;
  typesBarrelOut: string;
  enumsOut: string;
  schemasBarrelOut: string;
  enumsImport: string;
  scalarsImport: string;
  skipFields: string[];
  largeTextFields: string[];
  sortFieldPreference: string[];
}
