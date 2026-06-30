import { describe, it, expect } from 'bun:test';
import {
  generateGraphQLResolversContent,
  generateRestHandlerContent,
  generateRestRouterContent,
  parsePrismaModels,
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
    includeRelations: ['Category'],
  },
  Category: {
    filterable: { name: 'contains' as const },
    searchableFields: ['name'],
  },
};

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

// ── generateRestHandlerContent ────────────────────────────────────────────────

const REST_PRISMA_PATH = '../../db/prisma.client';
const handlerMetadata = { filterable: { name: 'contains' as const }, searchableFields: ['name', 'title'] };

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
  });

  describe('custom localizeExport name', () => {
    const output = generateRestHandlerContent('Post', {}, {
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
      const output = generateRestHandlerContent('UserProfile', {}, {
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

    it('extracts lang once before the dispatch block', () => {
      expect(output).toContain('const lang = getLanguageFromRequest(req)');
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
      expect(output).toContain('const lang = extractLang(req)');
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
