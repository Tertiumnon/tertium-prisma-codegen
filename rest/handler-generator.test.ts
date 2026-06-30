import { describe, it, expect } from 'bun:test';
import { generateRestHandlerContent } from './handler-generator';

const PRISMA_PATH = '../../db/prisma.client';

const metadata = {
  filterable: { name: 'contains' as const },
  searchableFields: ['name', 'title'],
};

describe('generateRestHandlerContent', () => {
  // ── Without localization ───────────────────────────────────────────────────

  describe('without localization', () => {
    const output = generateRestHandlerContent('Author', metadata, {
      prismaClientPath: PRISMA_PATH,
    });

    it('imports the Prisma client', () => {
      expect(output).toContain(`import prisma from '${PRISMA_PATH}'`);
    });

    it('does not import any localization function', () => {
      expect(output).not.toContain('localizeEntity');
      expect(output).not.toContain('getLanguageFromRequest');
    });

    it('list signature has no lang parameter', () => {
      expect(output).toContain('listAuthors(req: Request): Promise<Response>');
    });

    it('get signature has no lang parameter and no req', () => {
      expect(output).toContain('getAuthor(id: string): Promise<Response>');
    });

    it('generates the five CRUD functions', () => {
      expect(output).toContain('export async function listAuthors(');
      expect(output).toContain('export async function getAuthor(');
      expect(output).toContain('export async function createAuthor(');
      expect(output).toContain('export async function updateAuthor(');
      expect(output).toContain('export async function deleteAuthor(');
    });
  });

  // ── With localization ──────────────────────────────────────────────────────

  describe('with localization', () => {
    const output = generateRestHandlerContent('Author', metadata, {
      prismaClientPath: PRISMA_PATH,
      localization: {
        localizeImport: '../../core/localization/localization.entity',
      },
    });

    it('imports only the consumer localizeEntity function (no getLang)', () => {
      expect(output).toContain(
        "import { localizeEntity } from '../../core/localization/localization.entity'",
      );
      expect(output).not.toContain('getLanguageFromRequest');
    });

    it('list signature accepts lang as an explicit parameter', () => {
      expect(output).toContain('listAuthors(req: Request, lang?: string): Promise<Response>');
    });

    it('get signature accepts lang instead of req', () => {
      expect(output).toContain('getAuthor(id: string, lang?: string): Promise<Response>');
      expect(output).not.toContain('getAuthor(id: string, req');
    });

    it('does not call getLang inside the handler body', () => {
      expect(output).not.toContain('getLanguageFromRequest(req)');
    });

    it('calls localizeEntity with 3 args (entity, modelName, lang) in list', () => {
      expect(output).toContain("localizeEntity(item, 'Author', lang)");
    });

    it('calls localizeEntity with 3 args (entity, modelName, lang) in get', () => {
      expect(output).toContain("localizeEntity(data, 'Author', lang)");
    });

    it('does not generate an inline localization helper', () => {
      expect(output).not.toContain('getTranslation');
      expect(output).not.toContain('translatableFields');
      expect(output).not.toContain('async function localizeEntity');
    });
  });

  // ── Custom export name ─────────────────────────────────────────────────────

  describe('custom localizeExport name', () => {
    const output = generateRestHandlerContent('Post', {}, {
      prismaClientPath: PRISMA_PATH,
      localization: {
        localizeImport: './my-localize',
        localizeExport: 'myLocalizer',
      },
    });

    it('uses the custom export name in import', () => {
      expect(output).toContain("import { myLocalizer } from './my-localize'");
    });

    it('calls the custom function by its export name', () => {
      expect(output).toContain("myLocalizer(item, 'Post', lang)");
      expect(output).toContain("myLocalizer(data, 'Post', lang)");
    });
  });

  // ── modelName propagation ──────────────────────────────────────────────────

  describe('modelName propagation', () => {
    it('embeds the correct model name in localize calls', () => {
      const output = generateRestHandlerContent('UserProfile', {}, {
        prismaClientPath: PRISMA_PATH,
        localization: { localizeImport: './localize' },
      });
      expect(output).toContain("localizeEntity(item, 'UserProfile', lang)");
      expect(output).toContain("localizeEntity(data, 'UserProfile', lang)");
    });
  });
});
