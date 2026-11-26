import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Collection } from '../core/types.js';
import { routePlugin } from '../plugin/routes.js';
import { createPluginStore, type PluginStore } from '../plugin/store.js';
import { handleApi } from './api.js';
import { createMcpServer, type McpScope } from './mcp.js';

const MAX_BODY = 1_000_000;

class BodyError extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new BodyError('body is over 1 MB');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError('body is not JSON');
  }
}

export function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Stateless MCP: a fresh server and transport for every request. */
async function handleMcp(collections: ReadonlyMap<string, Collection>, req: IncomingMessage, res: ServerResponse, body: unknown, scope?: McpScope) {
  if (req.method !== 'POST') {
    send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'use POST: this server is stateless' }, id: null });
    return;
  }
  const server = createMcpServer(collections, scope);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

const NO_PLUGINS = createPluginStore([]);

/** The library's request handler: the JSON API under `/api/`, MCP at `/mcp`, and each plugin under `/p/`. */
export function createLibraryHandler(
  collections: ReadonlyMap<string, Collection>,
  plugins: PluginStore = NO_PLUGINS,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    void (async () => {
      try {
        const body = req.method === 'POST' ? await readJson(req) : undefined;
        if (path === '/mcp') return await handleMcp(collections, req, res, body);
        const plugin = routePlugin(plugins, req.method ?? 'GET', path, body);
        if (plugin?.kind === 'mcp') return await handleMcp(plugin.collections, req, res, body, plugin.scope);
        if (plugin) return send(res, plugin.status, plugin.body);
        if (path === '/' || path === '/health') return send(res, 200, { ok: true, collections: [...collections.keys()] });
        const out = handleApi(collections, req.method ?? 'GET', path, body);
        if (!out) return send(res, 404, { error: `no route for ${path}` });
        send(res, out.status, out.body);
      } catch (e) {
        if (res.headersSent) return res.end();
        if (e instanceof BodyError) return send(res, 400, { error: e.message });
        console.error(e);
        send(res, 500, { error: 'internal error' });
      }
    })();
  };
}

/** The library server: the handler on a Node HTTP server. */
export function createLibraryServer(collections: ReadonlyMap<string, Collection>, plugins?: PluginStore): Server {
  return createServer(createLibraryHandler(collections, plugins));
}
