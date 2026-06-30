export type FilterMode = 'contains' | 'equals';

export type DMMFField = {
  name: string;
  kind: 'scalar' | 'object' | 'enum' | 'unsupported';
  type: string;
  isRequired: boolean;
  isList: boolean;
  isId: boolean;
  relationName?: string;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};

export type DMMFModel = {
  name: string;
  dbName?: string | null;
  fields: readonly DMMFField[];
};

export type EntityMetadata = {
  filterable?: Record<string, FilterMode>;
  searchableFields?: string[];
  includeRelations?: string[];
  orderBy?: string;
};

export type Field = {
  name: string;
  type: string;
  required: boolean;
  isId: boolean;
  isRelation: boolean;
  isArray: boolean;
};

export type Model = {
  name: string;
  dbName?: string;
  fields: Field[];
};

export type ForeignKeyField = {
  fieldName: string;
  relationName: string;
  isRequired: boolean;
};

export type MetadataInferrerOptions = {
  /** Field names to exclude from filterable inference */
  skipFilterableFields?: string[];
  /** Patterns matching field names that should be searchable (default: name/title/description/summary) */
  searchableFieldPatterns?: RegExp[];
  /** Patterns matching Int field names treated as enum-like and filterable with 'equals' */
  enumLikeIntPatterns?: RegExp[];
};

export type TypesGeneratorOptions = {
  /** Fields to exclude from Input types. Default: ['id', 'createdAt', 'updatedAt'] */
  skipInputFields?: string[];
};

export type LocalizationConfig = {
  /** Import path for the consumer's localizeEntity function */
  localizeImport: string;
  /** Export name of the function (default: 'localizeEntity') */
  localizeExport?: string;
};

export type GraphQLResolverConfig = {
  /** Import path for the PrismaClient class */
  prismaClientPath: string;
  /** Export name of PrismaClient (default: 'PrismaClient') */
  prismaClientExport?: string;
  /** Import path for the base GraphQL context interface */
  contextTypePath: string;
  /** Export name of the base context type (default: 'GraphQLResolverContext') */
  contextTypeExport?: string;
  /** Optional localization support — consumer provides a localizeEntity function */
  localization?: LocalizationConfig;
};

export type RestHandlerConfig = {
  /** Import path for the Prisma client singleton (e.g. '../../db/prisma.client') */
  prismaClientPath: string;
  /** Optional localization support — consumer provides a localizeEntity function */
  localization?: LocalizationConfig;
};

export type RestRouterConfig = {
  /** Relative path from the router file to the entities directory */
  entityImportBase: string;
  /** Additional import statements inserted at the top of the router */
  extraImports?: string;
  /** Additional route-matching code inserted before the entity dispatch block */
  extraRoutes?: string;
  /** Additional helper functions appended after the main handler */
  extraHelpers?: string;
  /** When set, the router extracts lang once per request and passes it to list/get handlers */
  localization?: {
    /** Import path for the consumer's language-extraction function */
    getLangImport: string;
    /** Export name of the function (default: 'getLanguageFromRequest') */
    getLangExport?: string;
  };
};
