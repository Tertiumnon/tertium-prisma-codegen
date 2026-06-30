// ── Config types ──────────────────────────────────────────────────────────────

export interface ClientTypesConfig {
  entityImportBase: string;
  enumsImport: string;
}

export interface ClientSchemaConfig {
  tableSchemaImport: string;
  optionsServiceImport: string;
  optionsServiceExport?: string;
  skipFields?: string[];
  largeTextFields?: string[];
}

export interface GraphQLClientConfig {
  graphqlRequestImport: string;
  graphqlRequestExport?: string;
  apiTypesImport: string;
}

export interface ClientBarrelConfig {
  entityImportBase: string;
}

export interface TypesBarrelConfig {
  entityImportBase: string;
  enumsImport?: string;
}

export interface SchemasBarrelConfig {
  entityImportBase: string;
}
