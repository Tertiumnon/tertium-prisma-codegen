import type { Model, RestRouterConfig } from '../types';
import { toCamelCase, toKebabCase } from '../schema-parser';

/**
 * Returns the file content for the auto-generated REST router file.
 *
 * The router exports a single `handleRestRequest(req)` function that dispatches
 * to the correct entity handler based on the URL pattern `/api/{entity}/{id?}`.
 *
 * Custom routes and imports can be injected via `config.extraImports`,
 * `config.extraRoutes`, and `config.extraHelpers`.
 */
export function generateRestRouterContent(models: Model[], config: RestRouterConfig): string {
  const { entityImportBase, extraImports = '', extraRoutes = '', extraHelpers = '', localization } = config;

  const getLangExport = localization?.getLangExport ?? 'getLanguageFromRequest';

  const localizationImport = localization
    ? `import { ${getLangExport} } from '${localization.getLangImport}';\n`
    : '';

  const entityImports = models
    .map((m) => {
      const kebab = toKebabCase(m.name);
      const camel = toCamelCase(m.name);
      return `import * as ${camel}Rest from '${entityImportBase}/${kebab}/${kebab}.rest.auto';`;
    })
    .join('\n');

  const langArg = localization ? ', lang' : '';

  const routes = models
    .map((m) => {
      const kebab = toKebabCase(m.name);
      const camel = toCamelCase(m.name);
      const plural = kebab.endsWith('s') ? kebab : `${kebab}s`;
      return `    if (entity === '${plural}') {
      if (method === 'GET' && !id) return await ${camel}Rest.list${m.name}s(req${langArg});
      if (method === 'GET' && id) return await ${camel}Rest.get${m.name}(id${langArg});
      if (method === 'POST') return await ${camel}Rest.create${m.name}(req);
      if (method === 'PUT' && id) return await ${camel}Rest.update${m.name}(id, req);
      if (method === 'DELETE' && id) return await ${camel}Rest.delete${m.name}(id);
    }`;
    })
    .join('\n\n');

  const langDeclaration = localization ? `\n    const lang = ${getLangExport}(req);` : '';

  return `/**
 * REST API Router - Auto-generated
 * DO NOT EDIT - regenerate with your codegen script
 */

${entityImports}
${localizationImport}${extraImports ? `\n${extraImports}\n` : ''}
export async function handleRestRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
${extraRoutes ? `\n${extraRoutes}\n` : ''}
  const pathMatch = pathname.match(/^\\/api\\/([^\\/]+)(?:\\/([^\\/]+))?$/);
  if (!pathMatch) {
    return new Response(JSON.stringify({ error: 'Invalid API endpoint' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [, entity, id] = pathMatch;
${langDeclaration}
  try {
${routes}

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
${extraHelpers ? `\n${extraHelpers}` : ''}`;
}
