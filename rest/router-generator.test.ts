import { describe, it, expect } from 'bun:test';
import { generateRestRouterContent } from './router-generator';
import { parsePrismaModels } from '../schema-parser';
import type { DMMFModel } from '../types';

const dmmfModels: DMMFModel[] = [
  {
    name: 'Author',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
    ],
  },
  {
    name: 'Post',
    dbName: null,
    fields: [
      { name: 'id', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: true },
      { name: 'name', kind: 'scalar', type: 'String', isRequired: true, isList: false, isId: false },
    ],
  },
];

const models = parsePrismaModels(dmmfModels);

describe('generateRestRouterContent', () => {
  // ── Without localization ───────────────────────────────────────────────────

  describe('without localization', () => {
    const output = generateRestRouterContent(models, {
      entityImportBase: '../entities',
    });

    it('does not import a getLang function', () => {
      expect(output).not.toContain('getLanguageFromRequest');
    });

    it('calls list handler with only req', () => {
      expect(output).toContain('listAuthors(req)');
      expect(output).not.toContain('listAuthors(req, lang)');
    });

    it('calls get handler with only id', () => {
      expect(output).toContain('getAuthor(id)');
      expect(output).not.toContain('getAuthor(id, lang)');
    });

    it('does not declare a lang variable', () => {
      expect(output).not.toContain('const lang =');
    });

    it('dispatches all models', () => {
      expect(output).toContain("entity === 'authors'");
      expect(output).toContain("entity === 'posts'");
    });
  });

  // ── With localization ──────────────────────────────────────────────────────

  describe('with localization', () => {
    const output = generateRestRouterContent(models, {
      entityImportBase: '../entities',
      localization: {
        getLangImport: '../localization/localization.utils',
        getLangExport: 'getLanguageFromRequest',
      },
    });

    it('imports the getLang function', () => {
      expect(output).toContain(
        "import { getLanguageFromRequest } from '../localization/localization.utils'",
      );
    });

    it('extracts lang once before the dispatch block', () => {
      expect(output).toContain('const lang = getLanguageFromRequest(req)');
      const count = (output.match(/getLanguageFromRequest\(req\)/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('passes lang to list handlers', () => {
      expect(output).toContain('listAuthors(req, lang)');
      expect(output).toContain('listPosts(req, lang)');
    });

    it('passes lang to get handlers', () => {
      expect(output).toContain('getAuthor(id, lang)');
      expect(output).toContain('getPost(id, lang)');
    });

    it('does not pass lang to create/update/delete', () => {
      expect(output).toContain('createAuthor(req)');
      expect(output).toContain('updateAuthor(id, req)');
      expect(output).toContain('deleteAuthor(id)');
      expect(output).not.toContain('createAuthor(req, lang)');
    });

    it('lang is declared outside the try block so it is available to all entities', () => {
      const langPos = output.indexOf('const lang =');
      const tryPos = output.indexOf('try {');
      expect(langPos).toBeGreaterThan(0);
      expect(langPos).toBeLessThan(tryPos);
    });
  });

  // ── Custom getLangExport ───────────────────────────────────────────────────

  describe('custom getLangExport name', () => {
    const output = generateRestRouterContent(models, {
      entityImportBase: '../entities',
      localization: {
        getLangImport: './lang',
        getLangExport: 'extractLang',
      },
    });

    it('uses the custom export name in import', () => {
      expect(output).toContain("import { extractLang } from './lang'");
    });

    it('calls the custom function to extract lang', () => {
      expect(output).toContain('const lang = extractLang(req)');
    });
  });

  // ── Extra routes / imports ─────────────────────────────────────────────────

  describe('extra routes and imports', () => {
    const output = generateRestRouterContent(models, {
      entityImportBase: '../entities',
      extraImports: `import { handleAuth } from './auth';`,
      extraRoutes: `  if (pathname === '/api/auth') return handleAuth(req);`,
      localization: {
        getLangImport: './lang',
      },
    });

    it('includes extra imports', () => {
      expect(output).toContain("import { handleAuth } from './auth'");
    });

    it('includes extra routes before entity dispatch', () => {
      const extraPos = output.indexOf('/api/auth');
      const entityPos = output.indexOf("entity === 'authors'");
      expect(extraPos).toBeLessThan(entityPos);
    });

    it('still generates entity routes with lang', () => {
      expect(output).toContain('listAuthors(req, lang)');
    });
  });
});
