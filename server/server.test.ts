import { describe, it, expect } from 'bun:test';
import {
  generateGraphQLResolversContent,
  generateGraphQLSchemaContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  parsePrismaModels,
  inferEntityMetadata,
} from './server';
import type { DMMFModel } from '../dmmf/dmmf.types';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const PRISMA_PATH = '../../../generated/prisma/client';
const CONTEXT_PATH = './api-graphql.types.auto';

const dmmfModels: DMMFModel[] = [
  {
    name: 'Author',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'bio', kind: 'scalar', type: 'String', isRequired: false, isList: false, isId: false },
      { name: 'categoryId', kind: 'scalar', type: 'String', isRequired: false, isList: false, isId: false },
      {
        name: 'Category',
        kind: 'object',
        type: 'Category',
        isRequired: false,
        isList: false,
        isId: false,
        relationName: 'AuthorToCategory',
        relationFromFields: ['categoryId'],
        relationToFields: ['id'],
      },
    ],
  },
  {
    name: 'Category',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      {
        name: 'Author',
        kind: 'object',
        type: 'Author',
        isRequired: false,
        isList: true,
        isId: false,
        relationName: 'AuthorToCategory',
        relationFromFields: [],
        relationToFields: [],
      },
    ],
  },
];

const graphqlMetadata = {
  Author: {
    filterable: { name: 'contains' as const, categoryId: 'equals' as const },
    searchableFields: ['name'],
    includeRelations: [{ name: 'Category' }],
    orderBy: 'name',
  },
  Category: {
    filterable: { name: 'contains' as const },
    searchableFields: ['name'],
    orderBy: 'name',
  },
};

// ── inferEntityMetadata ──────────────────────────────────────────────────────

describe('inferEntityMetadata', () => {
  it('picks orderBy from orderByFieldPreference when a listed name exists on the model', () => {
    // Author has fields: id, name, bio, categoryId. Prefer "title" (missing) → "name" (present).
    const metadata = inferEntityMetadata(dmmfModels, {
      orderByFieldPreference: ['title', 'name', 'createdAt'],
    });
    expect(metadata.Author.orderBy).toBe('name');
  });

  it('falls back to the primary key when no preferred field exists on the model', () => {
    const metadata = inferEntityMetadata(dmmfModels, {
      orderByFieldPreference: ['nonexistentA', 'nonexistentB'],
    });
    expect(metadata.Author.orderBy).toBe('id');
  });

  it('falls back to the primary key when no preference list is supplied', () => {
    const metadata = inferEntityMetadata(dmmfModels);
    expect(metadata.Author.orderBy).toBe('id');
  });

  it('derives PK from the field with isId (not hardcoded to "id")', () => {
    const modelWithCustomPk: DMMFModel = {
      name: 'Country',
      dbName: null,
      fields: [
        { name: 'code', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
        { name: 'label', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      ],
    };
    const metadata = inferEntityMetadata([modelWithCustomPk]);
    expect(metadata.Country.orderBy).toBe('code');
  });

  it('throws when a model has no @id field', () => {
    const brokenModel: DMMFModel = {
      name: 'Broken',
      dbName: null,
      fields: [
        { name: 'value', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      ],
    };
    expect(() => inferEntityMetadata([brokenModel])).toThrow(/@id/);
  });
});

// ── generateGraphQLResolversContent ──────────────────────────────────────────

describe('generateGraphQLResolversContent', () => {
  describe('without localization', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });

    it('imports PrismaClient', () => {
      expect(output).toContain(`import { PrismaClient } from '${PRISMA_PATH}'`);
    });

    it('does not import any localization function', () => {
      expect(output).not.toContain('localizeEntity');
    });

    it('resolvers do not have a lang parameter', () => {
      const authorBlock = output.slice(output.indexOf('author:'), output.indexOf('authorList:'));
      expect(authorBlock).not.toContain('lang');
    });

    it('generates Query and Mutation resolvers for each model', () => {
      expect(output).toContain('author:');
      expect(output).toContain('authorList:');
      expect(output).toContain('createAuthor:');
      expect(output).toContain('updateAuthor:');
      expect(output).toContain('deleteAuthor:');
    });

    it('does not search a Translation table (no localization config, no guaranteed Translation model)', () => {
      expect(output).not.toContain('prisma.translation');
    });
  });

  describe('with localization', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      localization: { localizeImport: '../localization/localization.entity' },
    });

    it('imports the consumer localizeEntity function', () => {
      expect(output).toContain("import { localizeEntity } from '../localization/localization.entity'");
    });

    it('calls localizeEntity with 3 args in single resolver', () => {
      expect(output).toContain("await localizeEntity(data, 'Author', lang)");
    });

    it('calls localizeEntity with 3 args in list resolver', () => {
      expect(output).toContain("localizeEntity(item, 'Author', lang)");
    });

    it('adds lang parameter to single resolver args', () => {
      expect(output).toContain("{ id, lang }: { id: string; lang?: string }");
    });

    it('list resolver searches Translation for this model type, in addition to base columns', () => {
      const authorListBlock = output.slice(output.indexOf('authorList:'), output.indexOf('createAuthor:'));
      expect(authorListBlock).toContain("entityType: 'Author'");
      expect(authorListBlock).toContain('await prisma.translation.findMany');
      expect(authorListBlock).toContain('{ name: { contains: filter.search, mode: \'insensitive\' } }');
      expect(authorListBlock).toContain('where.OR.push({ id: { in: translationMatches.map((t: any) => t.entityId) } })');
    });

    it('scopes the Translation lookup to the same fields searched in the base columns', () => {
      // Not every Translation row for this entity type - otherwise a match buried in a
      // non-searchable field's translation (e.g. `details`) would surface a result that the same
      // text in the base language never would, since base-column search only covers
      // searchableFields.
      const authorListBlock = output.slice(output.indexOf('authorList:'), output.indexOf('createAuthor:'));
      expect(authorListBlock).toContain("fieldName: { in: ['name'] }");
    });

    it('does not gate the translation search on a per-entity registration check', () => {
      // Every model with searchableFields gets the Translation lookup when localization is
      // configured - the generator has no DB access at generation time to know which entity
      // types are actually registered for translation.
      const categoryListBlock = output.slice(output.indexOf('categoryList:'), output.indexOf('createCategory:'));
      expect(categoryListBlock).toContain("entityType: 'Category'");
    });
  });

  describe('caseInsensitiveSearch: false (MySQL/SQLite - mode is not a valid StringFilter option)', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      localization: { localizeImport: '../localization/localization.entity' },
      caseInsensitiveSearch: false,
    });

    it('omits mode from per-field filterable contains checks', () => {
      expect(output).not.toContain("mode: 'insensitive'");
    });

    it('omits mode from the searchableFields OR block', () => {
      const authorListBlock = output.slice(output.indexOf('authorList:'), output.indexOf('createAuthor:'));
      expect(authorListBlock).toContain('{ name: { contains: filter.search } }');
    });

    it('omits mode from the Translation lookup, but still emits it', () => {
      const authorListBlock = output.slice(output.indexOf('authorList:'), output.indexOf('createAuthor:'));
      expect(authorListBlock).toContain("value: { contains: filter.search } }");
      expect(authorListBlock).toContain('await prisma.translation.findMany');
    });
  });

  describe('custom localizeExport name', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      localization: { localizeImport: './translate', localizeExport: 'translateEntity' },
    });

    it('uses the custom export name in import', () => {
      expect(output).toContain("import { translateEntity } from './translate'");
    });

    it('calls the custom function by its export name', () => {
      expect(output).toContain("await translateEntity(data, 'Author', lang)");
    });
  });

  describe('FK to relation transform', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });

    it('generates a transform function for models with FK fields', () => {
      expect(output).toContain('function transformAuthorInputToPrisma');
    });

    it('transform connects FK field to relation', () => {
      expect(output).toContain("result.Category = { connect: { id: value } }");
    });
  });

  describe('custom context type', () => {
    const output = generateGraphQLResolversContent(graphqlMetadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      contextTypeExport: 'MyBaseContext',
      prismaClientExport: 'MyPrismaClient',
    });

    it('uses custom PrismaClient export name', () => {
      expect(output).toContain('import { MyPrismaClient }');
      expect(output).toContain('prisma: MyPrismaClient;');
    });

    it('uses custom context type export name', () => {
      expect(output).toContain('import type { MyBaseContext }');
      expect(output).toContain('extends MyBaseContext');
    });
  });
});

// ── generateGraphQLSchemaContent ────────────────────────────────────────────────

describe('generateGraphQLSchemaContent', () => {
  const models = parsePrismaModels(dmmfModels);
  const output = generateGraphQLSchemaContent(models, graphqlMetadata);

  it('declares the JSON and DateTime scalars', () => {
    expect(output).toContain('scalar JSON');
    expect(output).toContain('scalar DateTime');
  });

  it('generates an object type per model with correct nullability', () => {
    expect(output).toContain('type Author {');
    expect(output).toContain('id: String!');
    expect(output).toContain('name: String!');
    expect(output).toContain('bio: String');
    expect(output).not.toContain('bio: String!');
  });

  it('types a to-many relation as a non-null list and a to-one relation as nullable', () => {
    expect(output).toContain('Author: [Author!]!');
    expect(output).toContain('Category: Category');
    expect(output).not.toContain('Category: Category!');
  });

  it('generates a {Model}List type with data and total', () => {
    expect(output).toContain('type AuthorList {\n  data: [Author!]!\n  total: Int!\n}');
  });

  it('generates separate Create and Update input types, excluding relation fields', () => {
    expect(output).toContain('input CreateAuthor');
    expect(output).toContain('input UpdateAuthor');
    expect(output).not.toMatch(/input CreateAuthorInput \{[^}]*Category/);
  });

  it('generates Query fields for get and list per model', () => {
    expect(output).toContain('author(id: String!): Author');
    expect(output).toContain('authorList(filter: JSON, pagination: PaginationInput): AuthorList!');
  });

  it('generates Mutation fields for create, update, and delete per model', () => {
    expect(output).toContain('createAuthor(input: CreateAuthorInput!): Author!');
    expect(output).toContain('updateAuthor(id: String!, input: UpdateAuthorInput!): Author!');
    expect(output).toContain('deleteAuthor(id: String!): Boolean!');
  });

  it('omits Query/Mutation/List/Input for models absent from metadata, but keeps their object type', () => {
    const orphanModel: DMMFModel = {
      name: 'Orphan',
      dbName: null,
      fields: [{ name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true }],
    };
    const withOrphan = generateGraphQLSchemaContent([...models, ...parsePrismaModels([orphanModel])], graphqlMetadata);

    expect(withOrphan).toContain('type Orphan {');
    expect(withOrphan).not.toContain('orphan(id: String!)');
    expect(withOrphan).not.toContain('type OrphanList');
    expect(withOrphan).not.toContain('input CreateOrphanInput');
  });
});

// ── generateRestHandlerContent ────────────────────────────────────────────────

const REST_PRISMA_PATH = '../../db/prisma.client';
const handlerMetadata = { filterable: { name: 'contains' as const }, searchableFields: ['name', 'title'], orderBy: 'name' };

describe('generateRestHandlerContent', () => {
  describe('without localization', () => {
    const output = generateRestHandlerContent('Author', handlerMetadata, { prismaClientPath: REST_PRISMA_PATH });

    it('imports the Prisma client', () => {
      expect(output).toContain(`import prisma from '${REST_PRISMA_PATH}'`);
    });

    it('does not import any localization function', () => {
      expect(output).not.toContain('localizeEntity');
    });

    it('list signature has no lang parameter', () => {
      expect(output).toContain('listAuthors(req: Request): Promise<Response>');
    });

    it('generates the five CRUD functions', () => {
      expect(output).toContain('export async function listAuthors(');
      expect(output).toContain('export async function getAuthor(');
      expect(output).toContain('export async function createAuthor(');
      expect(output).toContain('export async function updateAuthor(');
      expect(output).toContain('export async function deleteAuthor(');
    });

    it('does not search a Translation table (no localization config, no guaranteed Translation model)', () => {
      expect(output).not.toContain('prisma.translation');
    });
  });

  describe('with localization', () => {
    const output = generateRestHandlerContent('Author', handlerMetadata, {
      prismaClientPath: REST_PRISMA_PATH,
      localization: { localizeImport: '../../core/localization/localization.entity' },
    });

    it('imports only the consumer localizeEntity function', () => {
      expect(output).toContain("import { localizeEntity } from '../../core/localization/localization.entity'");
    });

    it('list signature accepts lang as an explicit parameter', () => {
      expect(output).toContain('listAuthors(req: Request, lang?: string): Promise<Response>');
    });

    it('calls localizeEntity with 3 args in list', () => {
      expect(output).toContain("localizeEntity(item, 'Author', lang)");
    });

    it('calls localizeEntity with 3 args in get', () => {
      expect(output).toContain("localizeEntity(data, 'Author', lang)");
    });

    it('list handler searches Translation for this model type, in addition to base columns', () => {
      const listBlock = output.slice(output.indexOf('listAuthors'), output.indexOf('getAuthor'));
      expect(listBlock).toContain("entityType: 'Author'");
      expect(listBlock).toContain('await prisma.translation.findMany');
      expect(listBlock).toContain("{ name: { contains: search, mode: 'insensitive' } }");
      expect(listBlock).toContain("{ title: { contains: search, mode: 'insensitive' } }");
      expect(listBlock).toContain('where.OR.push({ id: { in: translationMatches.map((t: any) => t.entityId) } })');
    });

    it('scopes the Translation lookup to the same fields searched in the base columns', () => {
      const listBlock = output.slice(output.indexOf('listAuthors'), output.indexOf('getAuthor'));
      expect(listBlock).toContain("fieldName: { in: ['name', 'title'] }");
    });
  });

  describe('caseInsensitiveSearch: false (MySQL/SQLite)', () => {
    const output = generateRestHandlerContent('Author', handlerMetadata, {
      prismaClientPath: REST_PRISMA_PATH,
      localization: { localizeImport: '../../core/localization/localization.entity' },
      caseInsensitiveSearch: false,
    });

    it('omits mode everywhere, including the Translation lookup', () => {
      expect(output).not.toContain("mode: 'insensitive'");
      const listBlock = output.slice(output.indexOf('listAuthors'), output.indexOf('getAuthor'));
      expect(listBlock).toContain('{ name: { contains: search } }');
      expect(listBlock).toContain('value: { contains: search } }');
      expect(listBlock).toContain('await prisma.translation.findMany');
    });
  });

  describe('custom localizeExport name', () => {
    const output = generateRestHandlerContent('Post', { orderBy: 'id' }, {
      prismaClientPath: REST_PRISMA_PATH,
      localization: { localizeImport: './my-localize', localizeExport: 'myLocalizer' },
    });

    it('uses the custom export name in import', () => {
      expect(output).toContain("import { myLocalizer } from './my-localize'");
    });

    it('calls the custom function by its export name', () => {
      expect(output).toContain("myLocalizer(item, 'Post', lang)");
    });
  });

  describe('modelName propagation', () => {
    it('embeds the correct model name in localize calls', () => {
      const output = generateRestHandlerContent('UserProfile', { orderBy: 'id' }, {
        prismaClientPath: REST_PRISMA_PATH,
        localization: { localizeImport: './localize' },
      });
      expect(output).toContain("localizeEntity(item, 'UserProfile', lang)");
      expect(output).toContain("localizeEntity(data, 'UserProfile', lang)");
    });
  });
});

// ── generateRestRouterContent ─────────────────────────────────────────────────

const routerModels = parsePrismaModels([
  { name: 'Author', dbName: null, fields: [
    { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
    { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
  ]},
  { name: 'Post', dbName: null, fields: [
    { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
    { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
  ]},
]);

describe('generateRestRouterContent', () => {
  describe('without localization', () => {
    const output = generateRestRouterContent(routerModels, { entityImportBase: '../entities' });

    it('does not import a getLang function', () => {
      expect(output).not.toContain('getLanguageFromRequest');
    });

    it('calls list handler with only req', () => {
      expect(output).toContain('listAuthors(req)');
      expect(output).not.toContain('listAuthors(req, lang)');
    });

    it('dispatches all models', () => {
      expect(output).toContain("entity === 'authors'");
      expect(output).toContain("entity === 'posts'");
    });
  });

  describe('with localization', () => {
    const output = generateRestRouterContent(routerModels, {
      entityImportBase: '../entities',
      localization: { getLangImport: '../localization/localization.utils', getLangExport: 'getLanguageFromRequest' },
    });

    it('imports the getLang function', () => {
      expect(output).toContain("import { getLanguageFromRequest } from '../localization/localization.utils'");
    });

    it('extracts lang once before the dispatch block, awaiting it (the consumer impl may be async)', () => {
      expect(output).toContain('const lang = await getLanguageFromRequest(req)');
      const count = (output.match(/getLanguageFromRequest\(req\)/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('passes lang to list and get handlers', () => {
      expect(output).toContain('listAuthors(req, lang)');
      expect(output).toContain('getAuthor(id, lang)');
    });

    it('does not pass lang to create/update/delete', () => {
      expect(output).toContain('createAuthor(req)');
      expect(output).not.toContain('createAuthor(req, lang)');
    });

    it('lang is declared outside the try block', () => {
      const langPos = output.indexOf('const lang =');
      const tryPos = output.indexOf('try {');
      expect(langPos).toBeGreaterThan(0);
      expect(langPos).toBeLessThan(tryPos);
    });
  });

  describe('custom getLangExport name', () => {
    const output = generateRestRouterContent(routerModels, {
      entityImportBase: '../entities',
      localization: { getLangImport: './lang', getLangExport: 'extractLang' },
    });

    it('uses the custom export name', () => {
      expect(output).toContain("import { extractLang } from './lang'");
      expect(output).toContain('const lang = await extractLang(req)');
    });
  });

  describe('extra routes and imports', () => {
    const output = generateRestRouterContent(routerModels, {
      entityImportBase: '../entities',
      extraImports: `import { handleAuth } from './auth';`,
      extraRoutes: `  if (pathname === '/api/auth') return handleAuth(req);`,
      localization: { getLangImport: './lang' },
    });

    it('includes extra imports', () => {
      expect(output).toContain("import { handleAuth } from './auth'");
    });

    it('includes extra routes before entity dispatch', () => {
      const extraPos = output.indexOf('/api/auth');
      const entityPos = output.indexOf("entity === 'authors'");
      expect(extraPos).toBeLessThan(entityPos);
    });
  });
});

// ── Per-entity translation tables (detectTranslationRelations + downstream codegen) ────────────

const translationDmmfModels: DMMFModel[] = [
  {
    name: 'Book',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      {
        name: 'translations',
        kind: 'object',
        type: 'BookTranslation',
        isRequired: false,
        isList: true,
        isId: false,
        relationName: 'BookToBookTranslation',
        relationFromFields: [],
        relationToFields: [],
      },
    ],
  },
  {
    name: 'BookTranslation',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'bookId', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'languageCode', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'title', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'summary', kind: 'scalar', type: 'String', isRequired: false, isList: false, isId: false },
      {
        name: 'book',
        kind: 'object',
        type: 'Book',
        isRequired: true,
        isList: false,
        isId: false,
        relationName: 'BookToBookTranslation',
        relationFromFields: ['bookId'],
        relationToFields: ['id'],
      },
    ],
  },
];

const translationMetadata = inferEntityMetadata(translationDmmfModels, { searchableFieldPatterns: [/name/i] });

describe('inferEntityMetadata - translation-table detection', () => {
  it('detects the translation relation on the parent model', () => {
    expect(translationMetadata.Book?.translation).toEqual({
      relationName: 'translations',
      translationModelName: 'BookTranslation',
      fkFieldName: 'bookId',
      fields: ['title', 'summary'],
      // searchableFieldPatterns: [/name/i] matches neither 'title' nor 'summary' - see the
      // 'falls back to every translation field' test below for the resulting search behavior.
      searchableFields: [],
    });
  });

  it('excludes the translation model from metadata entirely - never a first-class entity', () => {
    expect(translationMetadata.BookTranslation).toBeUndefined();
  });

  it('does not list the translation relation as a flat includeRelations entry', () => {
    expect(translationMetadata.Book?.includeRelations ?? []).not.toContain('translations');
  });

  it('does not detect a translation relation for a same-named-but-unrelated model', () => {
    const unrelated: DMMFModel[] = [
      { name: 'Widget', dbName: null, fields: [{ name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true }] },
      { name: 'WidgetTranslation', dbName: null, fields: [{ name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true }] },
    ];
    const meta = inferEntityMetadata(unrelated);
    expect(meta.Widget?.translation).toBeUndefined();
  });
});

describe('generateGraphQLResolversContent - translation-table entities', () => {
  const output = generateGraphQLResolversContent(translationMetadata, translationDmmfModels, {
    prismaClientPath: PRISMA_PATH,
    contextTypePath: CONTEXT_PATH,
  });

  it('requires lang (non-optional) on single and list resolver signatures', () => {
    expect(output).toContain('{ id, lang }: { id: string; lang: string }');
    expect(output).toContain('{ filter, pagination, lang }: { filter?: any; pagination?: any; lang: string }');
    expect(output).toContain("if (!lang) throw new Error(\"'lang' is required to fetch a Book\");");
  });

  it('scopes the include to the requested language', () => {
    expect(output).toContain('translations: { where: { languageCode: lang } },');
  });

  it('flattens the translation row via a whitelisted flattenTranslation helper', () => {
    expect(output).toContain('function flattenTranslation(entity: any, relationName: string, fields: string[]): any {');
    expect(output).toContain('return data ? flattenTranslation(data, \'translations\', ["title","summary"]) : null;');
    expect(output).toContain("data.map((item: any) => flattenTranslation(item, 'translations', [\"title\",\"summary\"]))");
  });

  it('never calls localizeEntity for a translation-table entity', () => {
    expect(output).not.toContain('localizeEntity');
  });

  it('search matches across all languages via a relational filter, not scoped to lang', () => {
    // The exact OR-clause text below proves it, since it has no `languageCode` filter inside the
    // `some: {...}` - the surrounding resolver legitimately says `languageCode: lang` elsewhere,
    // in the *fetch* `include` (which scopes the returned translation row, not the search match).
    const bookListBlock = output.slice(output.indexOf('bookList:'), output.indexOf('createBook:'));
    expect(bookListBlock).toContain(
      "{ translations: { some: { OR: [{ title: { contains: filter.search, mode: 'insensitive' } }, { summary: { contains: filter.search, mode: 'insensitive' } }] } } }",
    );
    expect(bookListBlock).not.toContain('prisma.translation.findMany');
  });

  it('create destructures lang and translatable fields, writing a nested translation row', () => {
    const createBlock = output.slice(output.indexOf('createBook:'), output.indexOf('updateBook:'));
    expect(createBlock).toContain('const { lang, title, summary, ...baseInput } = input;');
    expect(createBlock).toContain('translations: { create: { languageCode: lang, title, summary } },');
  });

  it('update upserts the translation row on the fk_languageCode compound unique', () => {
    const updateBlock = output.slice(output.indexOf('updateBook:'), output.indexOf('deleteBook:'));
    expect(updateBlock).toContain('where: { bookId_languageCode: { bookId: id, languageCode: lang } },');
    expect(updateBlock).toContain('create: { languageCode: lang, title, summary },');
    expect(updateBlock).toContain('update: { title, summary },');
  });
});

describe('generateGraphQLSchemaContent - translation-table entities', () => {
  const models = parsePrismaModels(translationDmmfModels);
  const output = generateGraphQLSchemaContent(models, translationMetadata, { hasLocalization: true });

  it('excludes the translation model from object types entirely', () => {
    expect(output).not.toContain('type BookTranslation');
  });

  it('flattens translatable fields onto the parent type, always nullable, drops the raw relation', () => {
    const bookType = output.slice(output.indexOf('type Book {'), output.indexOf('type BookList'));
    expect(bookType).toContain('title: String\n');
    expect(bookType).not.toContain('title: String!');
    expect(bookType).not.toContain('translations:');
  });

  it('requires lang on query fields for translation-table entities', () => {
    expect(output).toContain('book(id: String!, lang: String!): Book');
    expect(output).toContain('bookList(filter: JSON, pagination: PaginationInput, lang: String!): BookList!');
  });

  it('adds lang and translatable fields to Create/Update inputs', () => {
    const createInput = output.slice(output.indexOf('input CreateBookInput {'), output.indexOf('input UpdateBookInput'));
    expect(createInput).toContain('lang: String!');
    expect(createInput).toContain('title: String');
    expect(createInput).toContain('summary: String');
  });
});

describe('generateRestHandlerContent - translation-table entities', () => {
  const output = generateRestHandlerContent('Book', translationMetadata.Book!, { prismaClientPath: REST_PRISMA_PATH });

  it('requires lang (non-optional) on list and get signatures', () => {
    expect(output).toContain('listBooks(req: Request, lang: string)');
    expect(output).toContain('getBook(id: string, lang: string)');
    expect(output).toContain("if (!lang) return jsonError(400, \"'lang' is required to fetch Books\");");
  });

  it('scopes the include to the requested language and flattens the result', () => {
    expect(output).toContain('include: { translations: { where: { languageCode: lang } } }');
    expect(output).toContain("flattenTranslation(item, 'translations', [\"title\",\"summary\"])");
  });

  it('search matches across all languages via a relational filter', () => {
    expect(output).toContain(
      "{ translations: { some: { OR: [{ title: { contains: search, mode: 'insensitive' } }, { summary: { contains: search, mode: 'insensitive' } }] } } }",
    );
  });

  it('create/update write a nested translation row via upsert on the compound unique key', () => {
    expect(output).toContain('translations: { create: { languageCode: lang, title, summary } },');
    expect(output).toContain('where: { bookId_languageCode: { bookId: id, languageCode: lang } },');
  });
});

describe('translation-table search - scoped by searchableFieldPatterns', () => {
  // Regression coverage for a real bug: filter.search matched every translation field
  // unconditionally (including long-form fields like `details`), so searching for a word that
  // only appeared buried in an unrelated item's flavor text returned that item. Base-column
  // search was already scoped by searchableFieldPatterns; translation-table search needs the same
  // scoping, not just whatever fields happen to be marked translatable.
  const scopedMetadata = inferEntityMetadata(translationDmmfModels, { searchableFieldPatterns: [/title/i] });

  it('narrows the translation model fields used, not just the base-column ones', () => {
    expect(scopedMetadata.Book?.translation?.searchableFields).toEqual(['title']);
  });

  it('GraphQL: only searches the scoped field, not every translatable field', () => {
    const output = generateGraphQLResolversContent(scopedMetadata, translationDmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });
    const bookListBlock = output.slice(output.indexOf('bookList:'), output.indexOf('createBook:'));
    expect(bookListBlock).toContain(
      "{ translations: { some: { OR: [{ title: { contains: filter.search, mode: 'insensitive' } }] } } }",
    );
    expect(bookListBlock).not.toContain('summary: { contains: filter.search');
  });

  it('REST: only searches the scoped field, not every translatable field', () => {
    const output = generateRestHandlerContent('Book', scopedMetadata.Book!, { prismaClientPath: REST_PRISMA_PATH });
    expect(output).toContain(
      "{ translations: { some: { OR: [{ title: { contains: search, mode: 'insensitive' } }] } } }",
    );
    expect(output).not.toContain('summary: { contains: search');
  });

  it('falls back to every translation field when none match the configured patterns', () => {
    // e.g. searchableFieldPatterns: [/name/i] against a translation model with only title/summary
    // - no pattern match, but search should still work rather than silently searching nothing.
    const noMatchMetadata = inferEntityMetadata(translationDmmfModels, { searchableFieldPatterns: [/name/i] });
    expect(noMatchMetadata.Book?.translation?.searchableFields).toEqual([]);
    const output = generateGraphQLResolversContent(noMatchMetadata, translationDmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });
    const bookListBlock = output.slice(output.indexOf('bookList:'), output.indexOf('createBook:'));
    expect(bookListBlock).toContain('title: { contains: filter.search');
    expect(bookListBlock).toContain('summary: { contains: filter.search');
  });

  it('create/update still write every translation field regardless of search scoping', () => {
    const output = generateGraphQLResolversContent(scopedMetadata, translationDmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });
    const createBlock = output.slice(output.indexOf('createBook:'), output.indexOf('updateBook:'));
    expect(createBlock).toContain('translations: { create: { languageCode: lang, title, summary } },');
  });
});

// ── Relations pointing AT a translation-table entity (not the entity itself) ───────────────────
//
// Regression coverage for a real bug: a model with a plain relation to a translation-table entity
// (e.g. Library -> Book, where Book has BookTranslation) got a flat `include: { book: true }` -
// Prisma never touched Book's own `translations` relation, so `book.title` etc. came back
// `undefined` in every language, not just the one with missing content. The include needs to be
// scoped the same way a top-level Book query is, and the fetched row needs the same flatten step.

const nestedTranslationDmmfModels: DMMFModel[] = [
  {
    name: 'Library',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'bookId', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      {
        name: 'book',
        kind: 'object',
        type: 'Book',
        isRequired: true,
        isList: false,
        isId: false,
        relationName: 'BookToLibrary',
        relationFromFields: ['bookId'],
        relationToFields: ['id'],
      },
    ],
  },
  {
    name: 'Book',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      {
        name: 'translations',
        kind: 'object',
        type: 'BookTranslation',
        isRequired: false,
        isList: true,
        isId: false,
        relationName: 'BookToBookTranslation',
        relationFromFields: [],
        relationToFields: [],
      },
      {
        name: 'library',
        kind: 'object',
        type: 'Library',
        isRequired: false,
        isList: true,
        isId: false,
        relationName: 'BookToLibrary',
        relationFromFields: [],
        relationToFields: [],
      },
    ],
  },
  {
    name: 'BookTranslation',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'bookId', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'languageCode', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'title', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
      { name: 'summary', kind: 'scalar', type: 'String', isRequired: false, isList: false, isId: false },
      {
        name: 'book',
        kind: 'object',
        type: 'Book',
        isRequired: true,
        isList: false,
        isId: false,
        relationName: 'BookToBookTranslation',
        relationFromFields: ['bookId'],
        relationToFields: ['id'],
      },
    ],
  },
];

const nestedTranslationMetadata = inferEntityMetadata(nestedTranslationDmmfModels, { searchableFieldPatterns: [/name/i] });

describe('inferEntityMetadata - relation pointing at a translation-table entity', () => {
  it('carries the target model translation metadata on the relation, not just its name', () => {
    // targetTranslation comes straight from detectTranslationRelations (shared across every
    // relation pointing at Book), not the per-owner searchableFields-scoped copy Book's own
    // `metadata.Book.translation` gets - nothing reads searchableFields off a nested relation.
    expect(nestedTranslationMetadata.Library?.includeRelations).toEqual([
      {
        name: 'book',
        targetTranslation: {
          relationName: 'translations',
          translationModelName: 'BookTranslation',
          fkFieldName: 'bookId',
          fields: ['title', 'summary'],
        },
      },
    ]);
  });
});

describe('generateGraphQLResolversContent - relation pointing at a translation-table entity', () => {
  const output = generateGraphQLResolversContent(nestedTranslationMetadata, nestedTranslationDmmfModels, {
    prismaClientPath: PRISMA_PATH,
    contextTypePath: CONTEXT_PATH,
    localization: { localizeImport: './localization.entity' },
  });

  it('scopes the nested include to the requested language instead of a flat `true`', () => {
    const libraryBlock = output.slice(output.indexOf('library:'), output.indexOf('libraryList:'));
    expect(libraryBlock).toContain("book: { include: { translations: { where: lang ? { languageCode: lang } : undefined } } }");
    expect(libraryBlock).not.toContain('book: true');
  });

  it('flattens the nested relation after fetching, in the single resolver', () => {
    const libraryBlock = output.slice(output.indexOf('library:'), output.indexOf('libraryList:'));
    expect(libraryBlock).toContain(
      "if (data.book) data.book = flattenTranslation(data.book, 'translations', [\"title\",\"summary\"]);",
    );
  });

  it('flattens the nested relation for every item in the list resolver', () => {
    const libraryListBlock = output.slice(output.indexOf('libraryList:'), output.indexOf('createLibrary:'));
    expect(libraryListBlock).toContain(
      "if (item.book) item.book = flattenTranslation(item.book, 'translations', [\"title\",\"summary\"]);",
    );
  });
});
