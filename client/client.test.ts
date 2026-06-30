import { describe, it, expect } from 'bun:test';
import {
  generateClientTypesContent,
  generateClientSchemaContent,
  generateGraphQLClientContent,
  generateClientBarrelContent,
  generateTypesBarrelContent,
  generateSchemasBarrelContent,
  generateEnumsContent,
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
      entityImportBase: '../../entities',
      enumsImport: '../../enums',
    });

    expect(output).toContain('export interface User');
    expect(output).toContain("id: string;");
    expect(output).toContain("email: string;");
    expect(output).toContain("name?: string | null;");
  });

  it('imports related entities when fields reference them', () => {
    const output = generateClientTypesContent(postEntity, [userEntity, postEntity], [], {
      entityImportBase: '../../entities',
      enumsImport: '../../enums',
    });

    expect(output).toContain('export interface Post');
    expect(output).toContain('userId');
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
      entityImportBase: '../../entities',
      enumsImport: '../../enums',
    });

    expect(output).toContain('status: Status;');
  });
});

// ── generateClientSchemaContent ──────────────────────────────────────────────

describe('generateClientSchemaContent', () => {
  it('generates TableSchema with fields', () => {
    const output = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      skipFields: ['id'],
    });

    expect(output).toContain("const userSchema");
    expect(output).toContain("email");
    expect(output).toContain("name");
  });

  it('generates schema with primaryKey and sortField', () => {
    const output = generateClientSchemaContent(userEntity, {
      tableSchemaImport: '../../types',
      skipFields: [],
    });

    expect(output).toContain("primaryKey: 'id'");
    expect(output).toContain("sortField:");
  });
});

// ── generateGraphQLClientContent ─────────────────────────────────────────────

describe('generateGraphQLClientContent', () => {
  it('generates GraphQL CRUD functions with fetch prefix', () => {
    const output = generateGraphQLClientContent(userEntity, {
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
    const output = generateGraphQLClientContent(userEntity, {
      graphqlRequestImport: '../../graphql',
      apiTypesImport: '../../types',
    });

    expect(output).toContain('query GetUser');
    expect(output).toContain('mutation CreateUser');
    expect(output).toContain('mutation UpdateUser');
    expect(output).toContain('mutation DeleteUser');
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
