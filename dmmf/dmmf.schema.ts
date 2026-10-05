import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DMMFEnum, DMMFModel } from './dmmf.types';

export type SchemaDMMF = {
  datamodel: {
    models: DMMFModel[];
    enums: DMMFEnum[];
  };
};

/** Read full Prisma schema DMMF at generation time, without constructing PrismaClient. */
export async function readSchemaDMMF(schemaPath: string): Promise<SchemaDMMF> {
  let getDMMF: (options: { datamodel: string }) => Promise<SchemaDMMF>;
  try {
    // Resolve from the consuming project so @prisma/internals matches its Prisma version.
    const requireFromProject = createRequire(resolve(process.cwd(), 'package.json'));
    ({ getDMMF } = requireFromProject('@prisma/internals'));
  } catch (error) {
    throw new Error('Schema generation requires @prisma/internals installed in the consuming project.', { cause: error });
  }
  return getDMMF({ datamodel: readFileSync(resolve(schemaPath), 'utf8') });
}
