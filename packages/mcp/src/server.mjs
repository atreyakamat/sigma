// SIGMA MCP server: exposes a SIGMA instance to Model Context Protocol clients (Claude Code,
// Claude Desktop, other agents) through the REST API and a personal API token.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const NODE_FIELDS = {
  name: { type: 'string' },
  x: { type: 'number' },
  y: { type: 'number' },
  width: { type: 'number' },
  height: { type: 'number' },
  rotation: { type: 'number' },
  fill: { type: 'string', description: 'hex colour like #2563eb, or "none"' },
  stroke: { type: 'string', description: 'hex colour, or "none"' },
  strokeWidth: { type: 'number' },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  visible: { type: 'boolean' },
  cornerRadius: { type: 'number' },
  text: { type: 'string', description: 'TEXT nodes: the characters' },
  fontSize: { type: 'number' },
  fontWeight: { type: 'integer' },
};

const id = (description) => ({ type: 'string', description });
const DOC = id('Document (design file) id');

export const TOOLS = [
  {
    name: 'sigma_whoami',
    description:
      'Shows which SIGMA user the configured API token belongs to. Use it first to confirm the connection works.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sigma_list_workspaces',
    description: 'Lists the workspaces the user can access, with the role in each.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sigma_list_projects',
    description: 'Lists the projects of a workspace.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId'],
      properties: { workspaceId: id('Workspace id') },
    },
  },
  {
    name: 'sigma_create_project',
    description: 'Creates a project in a workspace.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId', 'name'],
      properties: { workspaceId: id('Workspace id'), name: { type: 'string' } },
    },
  },
  {
    name: 'sigma_list_documents',
    description: 'Lists the design files of a project (id, name, revision, layer count).',
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: { projectId: id('Project id') },
    },
  },
  {
    name: 'sigma_create_document',
    description:
      'Creates an empty design file in a project and returns its id and the URL to open it in the browser.',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'name'],
      properties: { projectId: id('Project id'), name: { type: 'string' } },
    },
  },
  {
    name: 'sigma_get_outline',
    description:
      'Returns the structure of a design file: pages, then nested layers with id, type, name, x, y, w, h, text and solid fill. Call this before editing so the ids and positions you use are real, and after large edits when you need the new ids.',
    inputSchema: { type: 'object', required: ['documentId'], properties: { documentId: DOC } },
  },
  {
    name: 'sigma_apply_ops',
    description:
      'Edits a design file with a list of operations applied in order: add (type FRAME, RECTANGLE, ELLIPSE, LINE, POLYGON, STAR, TEXT, GROUP, COMPONENT or PAGE), update, move, delete, rename_document. Coordinates are pixels relative to the parent, y grows downward. Give an added node a "ref" and use "$ref" as the "parent" of nodes that belong inside it. Returns one result per operation (the id created or touched, or an error); failed operations are skipped and the rest still run. People with the file open see the changes live.',
    inputSchema: {
      type: 'object',
      required: ['documentId', 'ops'],
      properties: {
        documentId: DOC,
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: { type: 'string', enum: ['add', 'update', 'move', 'delete', 'rename_document'] },
              type: {
                type: 'string',
                enum: [
                  'PAGE',
                  'FRAME',
                  'GROUP',
                  'RECTANGLE',
                  'ELLIPSE',
                  'LINE',
                  'POLYGON',
                  'STAR',
                  'TEXT',
                  'COMPONENT',
                ],
              },
              id: id('update / move / delete: an existing node id'),
              parent: id('add / move: parent node id or "$ref"; defaults to the first page'),
              ref: id('add: short name later ops can use as "$name"'),
              index: { type: 'integer', minimum: 0 },
              ...NODE_FIELDS,
            },
          },
        },
      },
    },
  },
  {
    name: 'sigma_list_frames',
    description:
      'Lists the top-level frames (screens) of a design file with size and review state. Set approvedOnly to list only approved frames.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: { documentId: DOC, approvedOnly: { type: 'boolean' } },
    },
  },
  {
    name: 'sigma_export_png',
    description:
      'Renders a design file (or one frame) to a PNG image and returns it, so you can look at the result of your edits. Use scale 1 unless more detail is needed.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: {
        documentId: DOC,
        frameId: id('Frame id; omit for the whole first page'),
        scale: { type: 'number', minimum: 0.1, maximum: 4 },
      },
    },
  },
  {
    name: 'sigma_export_svg',
    description: 'Exports a design file (or one frame) as SVG markup.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: { documentId: DOC, frameId: id('Frame id; omit for the whole first page') },
    },
  },
  {
    name: 'sigma_design_tokens',
    description:
      'Extracts design tokens (colours, typography, radii) from a design file as JSON, or as CSS custom properties when format is "css".',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: { documentId: DOC, format: { type: 'string', enum: ['json', 'css'] } },
    },
  },
  {
    name: 'sigma_save_version',
    description:
      'Saves a named checkpoint of a design file so the current state can be restored later. Do this before large or destructive edits.',
    inputSchema: {
      type: 'object',
      required: ['documentId', 'label'],
      properties: { documentId: DOC, label: { type: 'string' } },
    },
  },
  {
    name: 'sigma_create_share_link',
    description:
      'Creates a read-only share link for a design file that opens without an account. Optionally expires after expiresInHours.',
    inputSchema: {
      type: 'object',
      required: ['documentId'],
      properties: { documentId: DOC, expiresInHours: { type: 'integer', minimum: 1 } },
    },
  },
];

const text = (value) => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
});

/**
 * @param {{ url: string, token: string, fetch?: typeof fetch }} options
 */
export function createSigmaClient({ url, token, fetch: fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '');
  return async function api(path, init = {}) {
    if (!base || !token)
      throw new Error(
        'SIGMA_URL and SIGMA_TOKEN must be set (create a token under Account → API tokens)',
      );
    const res = await fetchImpl(`${base}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        message = `${res.status}: ${Array.isArray(body.message) ? body.message.join('; ') : body.message}`;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(message);
    }
    return res;
  };
}

/**
 * Runs one tool. Exported for tests and for embedding the tools in other hosts.
 * @param {ReturnType<typeof createSigmaClient>} api
 * @param {string} baseUrl
 */
export async function callTool(api, baseUrl, name, args = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const json = async (path, init) => (await api(path, init)).json();
  const post = (path, body) => json(path, { method: 'POST', body: JSON.stringify(body) });
  switch (name) {
    case 'sigma_whoami':
      return text(await json('/auth/me'));
    case 'sigma_list_workspaces':
      return text(await json('/workspaces'));
    case 'sigma_list_projects':
      return text(await json(`/workspaces/${args.workspaceId}/projects`));
    case 'sigma_create_project':
      return text(await post(`/workspaces/${args.workspaceId}/projects`, { name: args.name }));
    case 'sigma_list_documents':
      return text(
        (await json(`/projects/${args.projectId}/documents`)).map((d) => ({
          id: d.id,
          name: d.name,
          revision: d.revision,
          nodeCount: d.nodeCount,
          updatedAt: d.updatedAt,
          url: `${base}/file/${d.id}`,
        })),
      );
    case 'sigma_create_document': {
      const d = await post(`/projects/${args.projectId}/documents`, { name: args.name });
      return text({ id: d.id, name: d.name, url: `${base}/file/${d.id}` });
    }
    case 'sigma_get_outline':
      return text(await json(`/documents/${args.documentId}/outline`));
    case 'sigma_apply_ops': {
      const r = await post(`/documents/${args.documentId}/ops`, { ops: args.ops });
      return text({ ...r, url: `${base}/file/${args.documentId}` });
    }
    case 'sigma_list_frames':
      return text(
        await json(
          `/documents/${args.documentId}/frames${args.approvedOnly ? '?approved=true' : ''}`,
        ),
      );
    case 'sigma_export_png': {
      const q = new URLSearchParams({ scale: String(args.scale ?? 1) });
      if (args.frameId) q.set('frame', args.frameId);
      const res = await api(`/documents/${args.documentId}/export.png?${q}`);
      return {
        content: [
          {
            type: 'image',
            data: Buffer.from(await res.arrayBuffer()).toString('base64'),
            mimeType: 'image/png',
          },
        ],
      };
    }
    case 'sigma_export_svg':
      return text(
        await (
          await api(
            `/documents/${args.documentId}/export.svg${args.frameId ? `?frame=${encodeURIComponent(args.frameId)}` : ''}`,
          )
        ).text(),
      );
    case 'sigma_design_tokens':
      return args.format === 'css'
        ? text(await (await api(`/documents/${args.documentId}/tokens.css`)).text())
        : text(await json(`/documents/${args.documentId}/tokens.json`));
    case 'sigma_save_version':
      return text(await post(`/documents/${args.documentId}/versions`, { label: args.label }));
    case 'sigma_create_share_link': {
      const l = await post(`/documents/${args.documentId}/share-links`, {
        role: 'VIEWER',
        ...(args.expiresInHours ? { expiresInHours: args.expiresInHours } : {}),
      });
      return text({ url: `${base}/share/${l.token}`, expiresAt: l.expiresAt });
    }
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

/**
 * Builds the MCP server. Connect it to a transport (stdio in bin/sigma-mcp.mjs).
 * @param {{ url: string, token: string, fetch?: typeof fetch, version?: string }} options
 */
export function createSigmaMcpServer(options) {
  const api = createSigmaClient(options);
  const server = new Server(
    { name: 'sigma', version: options.version ?? '0.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Tools for SIGMA, a self-hosted design platform. Typical flow: sigma_list_workspaces → sigma_list_projects → sigma_create_document or sigma_list_documents → sigma_get_outline → sigma_apply_ops → sigma_export_png to check the result.',
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await callTool(api, options.url, request.params.name, request.params.arguments ?? {});
    } catch (e) {
      // Tool failures are reported to the model, not raised as protocol errors, so it can recover.
      return {
        content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      };
    }
  });
  return server;
}
