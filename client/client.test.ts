import { describe, it, expect } from 'bun:test';
import {
  generateClientTypesContent,
  generateClientSchemaContent,
  generateGraphQLClientContent,
  generateClientBarrelContent,
  generateTypesBarrelContent,
  generateSchemasBarrelContent,
  generateEnumsContent,
  generateTableSchemaTypeContent,
} from './client';
import type { EntityMeta, EnumMeta } from '../dmmf/dmmf.types';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const userEntity: EntityMeta = {
  name: 'User',
  camel: 'user',
  kebab: 'user',
  displayName: 'User',
  fields: [
    {
      name: 'id',
      prismaType: 'String',
      tsType: 'string',
      formType: 'text',
      required: true,
      isPrimary: true,
      isRelation: false,
      isArray: false,
      relationModel: null,
    },
    {
      name: 'email',
      prismaType: 'String',
      tsType: 'string',
      formType: 'text',
      required: true,
      isPrimary: false,
      isRelation: false,
      isArray: false,
      relationModel: null,
    },
    {
      name: 'name',
      prismaType: 'String',
      tsType: 'string | null',
      formType: 'text',
      required: false,
      isPrimary: false,
      isRelation: false,
      isArray: false,
      relationModel: null,
    },
  ],
};

const postEntity: EntityMeta = {
  name: 'Post',
  camel: 'post',
  kebab: 'post',
  displayName: 'Post',
  fields: [
    {
      name: 'id',
      prismaType: 'String',
      tsType: 'string',
      formType: 'text',
      required: true,
      isPrimary: true,
      isRelation: false,
      isArray: false,
      relationModel: null,
    },
    {
      name: 'title',
      prismaType: 'String',
      tsType: 'string',
      formType: 'text',
      required: true,
      isPrimary: false,
      isRelation: false,
      isArray: false,
      relationModel: null,
    },
    {
      name: 'userId',
      prismaType: 'String',
      tsType: 'string',
      formType: 'relation',
      required: true,
      isPrimary: false,
      isRelation: false,
      isArray: false,
      relationModel: 'User',
    },
  ],
};

const statusEnum: EnumMeta = {
  name: 'Status',
  values: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
};

// ── generateClientTypesContent ───────────────────────────────────────────────

describe('generateClientTypesContent', () => {
  it('generates TypeScript interface for entity', () => {
    const output = generateClientTypesContent(userEntity, [userEntity], [], {
      enumsImport: '../../enums',
    });

    expect(output).toContain('export interface User');
    expect(output).toContain("id: string;");
    expect(output).toContain("email: string;");
    expect(output).toContain("name?: string | null;");
  });

  it('imports related entities when fields reference them', () => {
    const output = generateClientTypesContent(postEntity, [userEntity, postEntity], [], {
      enumsImport: '../../enums',
    });

    expect(output).toContain('export interface Post');
    expect(output).toContain('userId');
  });

  it('imports a related entity type via a sibling-relative path, regardless of entitiesDir depth', () => {
    const postWithAuthor: EntityMeta = {
      ...postEntity,
      fields: [
        ...postEntity.fields,
        {
          name: 'Author',
          prismaType: 'User',
          tsType: 'User',
          formType: 'relation',
          required: false,
          isPrimary: false,
          isRelation: true,
          isArray: false,
          relationModel: 'User',
        },
      ],
    };

    const output = generateClientTypesContent(postWithAuthor, [userEntity, postWithAuthor], [], {
      enumsImport: '../../enums',
    });

    // Entity files always live at {entitiesDir}/{kebab}/, so a sibling entity is
    // always exactly one level up — no entitiesDir-specific config should be needed.
    expect(output).toContain("import type { User } from '../user/user.types.auto';");
  });

  it('imports enums when entity uses them', () => {
    const entityWithEnum: EntityMeta = {
      ...postEntity,
      fields: [
        ...postEntity.fields,
        {
          name: 'status',
          prismaType: 'Status',
          tsType: 'Status',
          formType: 'text',
          required: true,
          isPrimary: false,
          isRelation: false,
          isArray: false,
          relationModel: null,
        },
      ],
    };

    const output = generateClientTypesContent(entityWithEnum, [userEntity, postEntity], [statusEnum], {
      enumsImport: '../../enums',
    });

    expect(output).toContain('status: Status;');
    expect(output).toContain("import { Status } from '../../enums';");
  });

  it('imports enums when entity uses an optional enum field', () => {
    const entityWithOptionalEnum: EntityMeta = {
      ...postEntity,
      fields: [
        ...postEntity.fields,
        {
          name: 'status',
          prismaType: 'Status',
          tsType: 'Status | null',
          formType: 'text',
          required: false,
          isPrimary: false,
          isRelation: false,
          isArray: false,
          relationModel: null,
        },
      ],
    };

    const output = generateClientTypesContent(entityWithOptionalEnum, [userEntity, postEntity], [statusEnum], {
      enumsImport: '../../enums',
    });

    expect(output).toContain("import { Status } from '../../enums';");
  });
});

// ── generateTableSchemaTypeContent ───────────────────────────────────────────

describe('generateTableSchemaTypeContent', () => {
  const output = generateTableSchemaTypeContent();

  it('declares the full type union form-field rendering switches on, not just what the generator itself can produce', () => {
    // 'select' | 'uuid' | 'range' are never emitted by generateClientSchemaContent (nothing in a
    // Prisma schema implies them) but are legitimate hand-assigned-after-generation values a
    // consumer's form renderer needs to switch on without a cast.
    expect(output).toContain(
      "type: 'text' | 'number' | 'float' | 'textarea' | 'boolean' | 'date' | 'relation' | 'select' | 'uuid' | 'range';",
    );
  });

  it('includes every FieldSchema property a generic form renderer needs', () => {
    for (const prop of ['placeholder', 'options', 'optionsLoader', 'readOnly', 'min', 'max', 'step']) {
      expect(output).toContain(`${prop}?:`);
    }
  });

  it('carries requiresLang on TableSchema', () => {
    expect(output).toContain('requiresLang?: boolean;');
  });
});

// ── generateClientSchemaContent ──────────────────────────────────────────────

describe('generateClientSchemaContent', () => {
  it('generates TableSchema with fields', () => {
    const output = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
      skipFields: ['id'],
    });

    expect(output).toContain("const userSchema");
    expect(output).toContain("email");
    expect(output).toContain("name");
  });

  it('derives primaryKey from the field marked isPrimary (not hardcoded to "id")', () => {
    const entityWithCustomPk: EntityMeta = {
      name: 'Country',
      camel: 'country',
      kebab: 'country',
      displayName: 'Country',
      fields: [
        {
          name: 'code',
          prismaType: 'String',
          tsType: 'string',
          formType: 'text',
          required: true,
          isPrimary: true,
          isRelation: false,
          isArray: false,
          relationModel: null,
        },
        {
          name: 'displayName',
          prismaType: 'String',
          tsType: 'string',
          formType: 'text',
          required: true,
          isPrimary: false,
          isRelation: false,
          isArray: false,
          relationModel: null,
        },
      ],
    };

    const output = generateClientSchemaContent(entityWithCustomPk, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
    });

    expect(output).toContain("primaryKey: 'code'");
  });

  it('picks sortField from sortFieldPreference when a listed name exists on the entity', () => {
    const output = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
      sortFieldPreference: ['label', 'email', 'name'],
    });

    // userEntity has no "label" but has "email" — expect "email".
    expect(output).toContain("sortField: 'email'");
  });

  it('falls back to primaryKey for sortField when no preferred field exists', () => {
    const output = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
      sortFieldPreference: ['nonexistentA', 'nonexistentB'],
    });

    expect(output).toContain("sortField: 'id'");
  });

  it('throws when the entity has no primary key', () => {
    const entityWithoutPk: EntityMeta = {
      name: 'Broken',
      camel: 'broken',
      kebab: 'broken',
      displayName: 'Broken',
      fields: [
        {
          name: 'value',
          prismaType: 'String',
          tsType: 'string',
          formType: 'text',
          required: true,
          isPrimary: false,
          isRelation: false,
          isArray: false,
          relationModel: null,
        },
      ],
    };

    expect(() =>
      generateClientSchemaContent(entityWithoutPk, {
        tableSchemaImport: '../../types',
        optionsServiceImport: '../../options',
      }),
    ).toThrow(/primary key/);
  });

  it('emits requiresLang: true for a translation-table entity, omitted otherwise', () => {
    const translatedEntity: EntityMeta = { ...userEntity, requiresLang: true };
    const output = generateClientSchemaContent(translatedEntity, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
    });
    expect(output).toContain('requiresLang: true,');

    const plainOutput = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      optionsServiceImport: '../../options',
    });
    expect(plainOutput).not.toContain('requiresLang');
  });
});

// ── generateGraphQLClientContent ─────────────────────────────────────────────

describe('generateGraphQLClientContent', () => {
  it('generates GraphQL CRUD functions with fetch prefix', () => {
    const output = generateGraphQLClientContent(userEntity, [userEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    expect(output).toContain('export async function fetchUser');
    expect(output).toContain('export async function fetchUserList');
    expect(output).toContain('export async function createUser');
    expect(output).toContain('export async function updateUser');
    expect(output).toContain('export async function deleteUser');
  });

  it('generates GraphQL queries and mutations', () => {
    const output = generateGraphQLClientContent(userEntity, [userEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    expect(output).toContain('query GetUser');
    expect(output).toContain('mutation CreateUser');
    expect(output).toContain('mutation UpdateUser');
    expect(output).toContain('mutation DeleteUser');
  });

  it('selects all scalar fields of the related entity for relation fields', () => {
    const postWithAuthor: EntityMeta = {
      ...postEntity,
      fields: [
        ...postEntity.fields,
        {
          name: 'Author',
          prismaType: 'User',
          tsType: 'User',
          formType: 'relation',
          required: false,
          isPrimary: false,
          isRelation: true,
          isArray: false,
          relationModel: 'User',
        },
      ],
    };

    const output = generateGraphQLClientContent(postWithAuthor, [userEntity, postWithAuthor], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    // userEntity has scalar fields: id, email, name (no title).
    // Assert the exact selection block — proves fields come from metadata, not a hardcoded list.
    expect(output).toContain('Author {\n          id\n          email\n          name\n        }');
  });

  it('falls back to id when the related entity is not in allEntities', () => {
    const orphanRelation: EntityMeta = {
      ...postEntity,
      fields: [
        ...postEntity.fields,
        {
          name: 'External',
          prismaType: 'Unknown',
          tsType: 'Unknown',
          formType: 'relation',
          required: false,
          isPrimary: false,
          isRelation: true,
          isArray: false,
          relationModel: 'Unknown',
        },
      ],
    };

    const output = generateGraphQLClientContent(orphanRelation, [orphanRelation], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    expect(output).toContain('External {\n          id\n        }');
  });

  describe('without language config', () => {
    const output = generateGraphQLClientContent(userEntity, [userEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    it('does not add a lang argument or import anything language-related', () => {
      expect(output).not.toContain('$lang');
      expect(output).not.toContain('getLanguage');
      expect(output).not.toContain('langOverride');
    });

    it('query signatures have no lang parameter', () => {
      expect(output).toContain('query GetUser($id: String!) {');
      expect(output).toContain('query GetUserList($filter: JSON, $pagination: PaginationInput) {');
    });
  });

  describe('with language config', () => {
    const output = generateGraphQLClientContent(userEntity, [userEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
      language: { languageImport: '../../core/language' },
    });

    it('imports the consumer getLanguage function', () => {
      expect(output).toContain("import { getLanguage } from '../../core/language'");
    });

    it('adds a lang argument to both the get and list queries', () => {
      expect(output).toContain('query GetUser($id: String!, $lang: String) {');
      expect(output).toContain('user(id: $id, lang: $lang)');
      expect(output).toContain('query GetUserList($filter: JSON, $pagination: PaginationInput, $lang: String) {');
      expect(output).toContain('userList(filter: $filter, pagination: $pagination, lang: $lang)');
    });

    it('accepts an optional langOverride, defaulting to the live current-language accessor', () => {
      expect(output).toContain('export async function fetchUser(id: string, langOverride?: string)');
      expect(output).toContain('{ id, lang: langOverride ?? getLanguage() }');
      expect(output).toContain(
        'export async function fetchUserList(filter?: any, pagination?: PaginationInput, langOverride?: string)'
      );
      expect(output).toContain('{ filter, pagination, lang: langOverride ?? getLanguage() }');
    });

    it('does not add lang to create/update/delete mutations', () => {
      expect(output).toContain('export async function createUser(input: Partial<User>)');
      expect(output).not.toContain('createUser(input: Partial<User>, lang');
    });
  });

  describe('custom languageExport name', () => {
    const output = generateGraphQLClientContent(userEntity, [userEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
      language: { languageImport: './lang', languageExport: 'currentLang' },
    });

    it('uses the custom export name throughout', () => {
      expect(output).toContain("import { currentLang } from './lang'");
      expect(output).toContain('lang: langOverride ?? currentLang()');
    });
  });

  describe('requiresLang entity (per-entity translation table, no fallback language)', () => {
    const translatedEntity: EntityMeta = { ...userEntity, name: 'Creature', camel: 'creature', kebab: 'creature', requiresLang: true };
    const output = generateGraphQLClientContent(translatedEntity, [translatedEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
      language: { languageImport: '../../core/language' },
    });

    it('uses a non-null $lang: String! instead of the usual optional $lang: String', () => {
      expect(output).toContain('query GetCreature($id: String!, $lang: String!) {');
      expect(output).toContain('query GetCreatureList($filter: JSON, $pagination: PaginationInput, $lang: String!) {');
      expect(output).not.toContain('$lang: String)');
    });

    it('still defaults to the live current-language accessor at the call site (always sends a real string)', () => {
      expect(output).toContain('{ id, lang: langOverride ?? getLanguage() }');
      expect(output).toContain('{ filter, pagination, lang: langOverride ?? getLanguage() }');
    });

    it('widens create/update input types to require lang', () => {
      expect(output).toContain('export async function createCreature(input: Partial<Creature> & { lang: string })');
      expect(output).toContain('export async function updateCreature(id: string, input: Partial<Creature> & { lang: string })');
    });
  });

  describe('requiresLang entity without language config', () => {
    // No `language` config - no $lang query variable and no langOverride (there's no
    // languageExport accessor to default the fetch calls from). Mutations still widen to
    // require `lang` regardless, since that's a fact about the server's input type, not
    // something derived from the fetch-side language accessor.
    const translatedEntity: EntityMeta = { ...userEntity, name: 'Creature', camel: 'creature', kebab: 'creature', requiresLang: true };
    const output = generateGraphQLClientContent(translatedEntity, [translatedEntity], {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    it('adds no lang argument to fetch queries', () => {
      expect(output).not.toContain('$lang');
      expect(output).not.toContain('langOverride');
    });

    it('still widens create/update input types to require lang', () => {
      expect(output).toContain('export async function createCreature(input: Partial<Creature> & { lang: string })');
      expect(output).toContain('export async function updateCreature(id: string, input: Partial<Creature> & { lang: string })');
    });
  });
});

// ── generateClientBarrelContent ──────────────────────────────────────────────

describe('generateClientBarrelContent', () => {
  it('re-exports all client functions', () => {
    const output = generateClientBarrelContent([userEntity, postEntity], {
      entityImportBase: '../../entities',
    });

    expect(output).toContain("from '../../entities/user/user.client.auto'");
    expect(output).toContain("from '../../entities/post/post.client.auto'");
  });
});

// ── generateTypesBarrelContent ───────────────────────────────────────────────

describe('generateTypesBarrelContent', () => {
  it('re-exports all entity types', () => {
    const output = generateTypesBarrelContent([userEntity, postEntity], [statusEnum], {
      entityImportBase: '../../entities',
      enumsImport: '../../enums',
    });

    expect(output).toContain("from '../../entities/user/user.types.auto'");
    expect(output).toContain("from '../../entities/post/post.types.auto'");
    expect(output).toContain("from '../../enums'");
  });
});

// ── generateSchemasBarrelContent ─────────────────────────────────────────────

describe('generateSchemasBarrelContent', () => {
  it('re-exports all schemas', () => {
    const output = generateSchemasBarrelContent([userEntity, postEntity], {
      entityImportBase: '../../entities',
    });

    expect(output).toContain("from '../../entities/user/user.schema.auto'");
    expect(output).toContain("from '../../entities/post/post.schema.auto'");
  });
});

// ── generateEnumsContent ─────────────────────────────────────────────────────

describe('generateEnumsContent', () => {
  it('generates enum declarations', () => {
    const output = generateEnumsContent([statusEnum]);

    expect(output).toContain('export enum Status');
    expect(output).toContain('DRAFT');
    expect(output).toContain('PUBLISHED');
    expect(output).toContain('ARCHIVED');
  });

  it('handles multiple enums', () => {
    const roleEnum: EnumMeta = {
      name: 'Role',
      values: ['ADMIN', 'USER'],
    };

    const output = generateEnumsContent([statusEnum, roleEnum]);

    expect(output).toContain('export enum Status');
    expect(output).toContain('export enum Role');
  });
});
