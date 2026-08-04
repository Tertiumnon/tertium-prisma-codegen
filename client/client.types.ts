// ── Config types ──────────────────────────────────────────────────────────────

export interface ClientTypesConfig {
  entityImportBase: string;
  enumsImport: string;
  scalarsImport?: string;
}

export interface ClientSchemaConfig {
  tableSchemaImport: string;
  optionsServiceImport: string;
  optionsServiceExport?: string;
  skipFields?: string[];
  largeTextFields?: string[];
  /**
   * Ordered list of field names to try for the generated TableSchema's `sortField`.
   * The first field name that exists on the entity wins. If none match, falls back to the primary key.
   */
  sortFieldPreference?: string[];
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
