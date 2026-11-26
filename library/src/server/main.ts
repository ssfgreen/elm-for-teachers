import { fileURLToPath } from 'node:url';
import { loadCollections } from '../core/fs.js';
import { loadPluginStoreSafely, PLUGINS_DIR } from '../plugin/store.js';
import { createLibraryServer } from './http.js';

const root = process.env.LIBRARY_COLLECTIONS ?? fileURLToPath(new URL('../../collections', import.meta.url));
const port = Number(process.env.PORT ?? 8787);

const collections = loadCollections(root);
const plugins = loadPluginStoreSafely();
createLibraryServer(collections, plugins).listen(port, () => {
  for (const c of collections.values()) console.log(`  ${c.meta.id}: ${c.docs.length} documents, version ${c.version}`);
  console.log(`  plugins from ${PLUGINS_DIR}`);
  console.log(`Library server on http://localhost:${port} (JSON API under /api, MCP at /mcp, plugins under /p/<owner>/<name>)`);
});
