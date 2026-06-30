import type { EntityMetadata, RestHandlerConfig } from '../types';
import { toCamelCase } from '../schema-parser';

/**
 * Returns the file content for a `{entity}.rest.auto.ts` file.
 *
 * Generates five handler functions per entity: list, get, create, update, delete.
 * All handlers validate UUID format and return JSON `Response` objects.
 * Localization is opt-in via `config.localization`. When enabled, `list` and `get`
 * accept an explicit `lang?` parameter — the router is responsible for extracting
 * the language from the request and passing it down.
 */
export function generateRestHandlerContent(
  modelName: string,
  metadata: EntityMetadata,
  config: RestHandlerConfig,
): string {
  const camelCase = toCamelCase(modelName);
  const filterLogic = buildFilterLogic(metadata);
  const orderBy = metadata.orderBy || 'createdAt';
  const { localization } = config;
  const localizeExport = localization?.localizeExport ?? 'localizeEntity';

  const localizationImport = localization
    ? `import { ${localizeExport} } from '${localization.localizeImport}';\n`
    : '';

  const listSignature = localization
    ? `list${modelName}s(req: Request, lang?: string)`
    : `list${modelName}s(req: Request)`;

  const localizeList = localization
    ? `\n    const localizedData = lang\n      ? await Promise.all(data.map((item: any) => ${localizeExport}(item, '${modelName}', lang)))\n      : data;`
    : '';
  const listData = localization ? 'localizedData' : 'data';

  const getSignature = localization
    ? `get${modelName}(id: string, lang?: string)`
    : `get${modelName}(id: string)`;

  const localizeGet = localization
    ? `\n    const localizedData = lang ? await ${localizeExport}(data, '${modelName}', lang) : data;`
    : '';
  const getData = localization ? 'localizedData' : 'data';

  return `/**
 * ${modelName} REST API Handlers
 * Auto-generated - DO NOT EDIT
 */

import prisma from '${config.prismaClientPath}';
${localizationImport}
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function validateInputIDs(input: any): string | null {
  if (!input || typeof input !== 'object') return null;
  for (const [key, value] of Object.entries(input)) {
    if (key.endsWith('Id') && value !== null && value !== undefined) {
      if (typeof value !== 'string' || !isValidUUID(value as string)) {
        return \`Invalid ID format for field '\${key}' - must be a valid UUID\`;
      }
    }
  }
  return null;
}

export async function ${listSignature}: Promise<Response> {
  try {
    const url = new URL(req.url);

    const limitParam = url.searchParams.get('limit');
    if (limitParam && isNaN(parseInt(limitParam))) {
      return jsonError(400, 'Invalid pagination parameter', { parameter: 'limit', value: limitParam, reason: 'Must be a positive integer' });
    }
    const limit = Math.min(Math.max(parseInt(limitParam || '50'), 1), 1000);

    const offsetParam = url.searchParams.get('offset');
    let offset = 0;
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam);
      if (isNaN(parsedOffset)) {
        return jsonError(400, 'Invalid pagination parameter', { parameter: 'offset', value: offsetParam, reason: 'Must be a non-negative integer' });
      }
      offset = Math.max(parsedOffset, 0);
    }

    ${filterLogic}

    const [data, total] = await Promise.all([
      (prisma as any).${camelCase}.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { ${orderBy}: 'asc' },
      }),
      (prisma as any).${camelCase}.count({ where }),
    ]);
${localizeList}
    return new Response(
      JSON.stringify({ data: ${listData}, pagination: { limit, offset, total, hasMore: offset + limit < total } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

export async function ${getSignature}: Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const data = await (prisma as any).${camelCase}.findUnique({ where: { id } });
    if (!data) return jsonError(404, '${modelName} not found');
${localizeGet}
    return new Response(JSON.stringify(${getData}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

export async function create${modelName}(req: Request): Promise<Response> {
  try {
    const input = await req.json();
    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.create({ data: input });
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(400, (error as Error).message);
  }
}

export async function update${modelName}(id: string, req: Request): Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const input = await req.json();
    const idError = validateInputIDs(input);
    if (idError) return jsonError(400, idError);
    const data = await (prisma as any).${camelCase}.update({ where: { id }, data: input });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(400, (error as Error).message);
  }
}

export async function delete${modelName}(id: string): Promise<Response> {
  try {
    if (!isValidUUID(id)) return jsonError(400, 'Invalid ID format - must be a valid UUID');
    const data = await (prisma as any).${camelCase}.delete({ where: { id } });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

function jsonError(status: number, error: string, details?: unknown): Response {
  return new Response(
    JSON.stringify(details ? { error, details } : { error }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilterLogic(metadata: EntityMetadata): string {
  if (!metadata.filterable && !metadata.searchableFields?.length) {
    return 'const where: any = {};';
  }

  let code =
    "const where: any = {};\n\n    const filterPrefix = 'filter.';\n    url.searchParams.forEach((value, key) => {\n      if (!key.startsWith(filterPrefix)) return;\n      const field = key.slice(filterPrefix.length);\n";

  for (const [field, mode] of Object.entries(metadata.filterable ?? {})) {
    if (mode === 'contains') {
      code += `      if (field === '${field}') where['${field}'] = { contains: value, mode: 'insensitive' };\n`;
    } else {
      code += `      if (field === '${field}') where['${field}'] = value;\n`;
    }
  }

  code += '    });\n';

  if (metadata.searchableFields?.length) {
    code += `\n    const search = url.searchParams.get('search');\n    if (search) {\n      where.OR = [\n`;
    for (const field of metadata.searchableFields) {
      code += `        { ${field}: { contains: search, mode: 'insensitive' } },\n`;
    }
    code += '      ];\n    }';
  }

  return code;
}
