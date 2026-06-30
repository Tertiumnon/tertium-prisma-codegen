import { describe, it, expect } from 'bun:test';
import { generateGraphQLResolversContent } from './resolvers-generator';
import type { DMMFModel } from '../types';

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

const metadata = {
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

describe('generateGraphQLResolversContent', () => {
  // ── Without localization ───────────────────────────────────────────────────

  describe('without localization', () => {
    const output = generateGraphQLResolversContent(metadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
    });

    it('imports PrismaClient', () => {
      expect(output).toContain(`import { PrismaClient } from '${PRISMA_PATH}'`);
    });

    it('does not import any localization function', () => {
      expect(output).not.toContain('localizeEntity');
    });

    it('does not add localizationService to ResolverContext', () => {
      expect(output).not.toContain('localizationService');
    });

    it('ResolverContext only declares prisma', () => {
      expect(output).toContain('prisma: PrismaClient;');
      const contextBlock = output.slice(
        output.indexOf('export interface ResolverContext'),
        output.indexOf('}', output.indexOf('export interface ResolverContext')) + 1,
      );
      expect(contextBlock).not.toContain('localizationService');
    });

    it('resolvers do not have a lang parameter', () => {
      const authorBlock = output.slice(
        output.indexOf('author:'),
        output.indexOf('authorList:'),
      );
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

  // ── With localization ──────────────────────────────────────────────────────

  describe('with localization', () => {
    const output = generateGraphQLResolversContent(metadata, dmmfModels, {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      localization: {
        localizeImport: '../localization/localization.entity',
      },
    });

    it('imports the consumer localizeEntity function', () => {
      expect(output).toContain(
        "import { localizeEntity } from '../localization/localization.entity'",
      );
    });

    it('does not add localizationService to ResolverContext', () => {
      expect(output).not.toContain('localizationService');
    });

    it('calls localizeEntity with 3 args (entity, modelName, lang) in single resolver', () => {
      expect(output).toContain("await localizeEntity(data, 'Author', lang)");
    });

    it('calls localizeEntity with 3 args in list resolver', () => {
      expect(output).toContain("localizeEntity(item, 'Author', lang)");
    });

    it('does not generate an inline localization helper function', () => {
      expect(output).not.toContain('async function localizeGraphQLEntity');
      expect(output).not.toContain('getTranslation');
      expect(output).not.toContain('translatableFields');
    });

    it('does not embed default language constant', () => {
      expect(output).not.toContain("=== 'ru'");
    });

    it('adds lang parameter to single resolver args', () => {
      expect(output).toContain("{ id, lang }: { id: string; lang?: string }");
    });

    it('adds lang parameter to list resolver args', () => {
      expect(output).toContain('lang?: string');
    });
  });

  // ── Custom export name ─────────────────────────────────────────────────────

  describe('custom localizeExport name', () => {
    const config = {
      prismaClientPath: PRISMA_PATH,
      contextTypePath: CONTEXT_PATH,
      localization: {
        localizeImport: './translate',
        localizeExport: 'translateEntity',
      },
    };
    const output = generateGraphQLResolversContent(metadata, dmmfModels, config);

    it('uses the custom export name in import', () => {
      expect(output).toContain("import { translateEntity } from './translate'");
    });

    it('calls the custom function by its export name', () => {
      expect(output).toContain("await translateEntity(data, 'Author', lang)");
    });
  });

  // ── FK transform ───────────────────────────────────────────────────────────

  describe('FK to relation transform', () => {
    const output = generateGraphQLResolversContent(metadata, dmmfModels, {
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

  // ── Custom context type ────────────────────────────────────────────────────

  describe('custom context type', () => {
    const output = generateGraphQLResolversContent(metadata, dmmfModels, {
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
