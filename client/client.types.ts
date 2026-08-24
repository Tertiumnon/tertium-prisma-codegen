// ── Config types ──────────────────────────────────────────────────────────────

export interface ClientTypesConfig {
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
  /**
   * When set, every generated `fetch<Entity>`/`fetch<Entity>List` query gains a `lang: String`
   * GraphQL argument, sourced by default from the given accessor - call sites don't need to
   * pass a language themselves for the common case. `languageExport` must be a plain,
   * framework-agnostic function `() => string` (not a reactive signal), so this package stays
   * UI-framework independent.
   *
   * Each generated function also accepts an optional trailing `langOverride?: string` parameter
   * (`lang: langOverride ?? ${languageExport}()`), for the less common case of needing a
   * specific language regardless of the current UI language - e.g. fetching a small lookup
   * table in every supported language at once to build a language-agnostic client-side search.
   */
  language?: {
    languageImport: string;
    languageExport?: string;
  };
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
