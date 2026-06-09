import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) {
      continue;
    }
    const value = argv[index + 1];
    values.set(part.slice(2), value);
    index += 1;
  }
  return values;
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function resourcePath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.replace(/^\/resources\//, ''));
  } catch (error) {
    if (error instanceof URIError) {
      return { kind: 'malformed' };
    }
    throw error;
  }
  const resolved = path.resolve(root, decoded);
  const rootPath = path.resolve(root);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    return { kind: 'missing' };
  }
  return { kind: 'path', path: resolved };
}

export async function startLogh7Server({ host, port, manifestPath, resourceRoot = path.dirname(manifestPath) }) {
  const absoluteManifest = path.resolve(manifestPath);
  const absoluteResourceRoot = path.resolve(resourceRoot);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (url.pathname === '/health') {
      jsonResponse(response, 200, { ok: true, service: 'logh7-local-resource-server' });
      return;
    }
    if (url.pathname === '/manifest') {
      jsonResponse(response, 200, await readManifest(absoluteManifest));
      return;
    }
    if (url.pathname === '/update.ini') {
      jsonResponse(response, 404, { error: 'update.ini is not staged in the current manifest' });
      return;
    }
    if (url.pathname.startsWith('/resources/')) {
      const resolved = resourcePath(absoluteResourceRoot, url.pathname);
      if (resolved.kind === 'malformed') {
        jsonResponse(response, 400, { error: 'malformed resource path' });
        return;
      }
      if (resolved.kind === 'missing') {
        jsonResponse(response, 404, { error: 'resource not found' });
        return;
      }
      try {
        const info = await stat(resolved.path);
        if (!info.isFile()) {
          jsonResponse(response, 404, { error: 'resource not found' });
          return;
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        createReadStream(resolved.path).pipe(response);
      } catch (error) {
        if (error instanceof Error) {
          jsonResponse(response, 404, { error: 'resource not found' });
          return;
        }
        throw error;
      }
      return;
    }
    jsonResponse(response, 404, { error: 'not found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  return {
    host,
    port: boundPort,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function health(argv) {
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '4787');
  const response = await fetch(`http://${host}:${port}/health`);
  console.log(await response.text());
  return response.ok ? 0 : 1;
}

async function serve(argv) {
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '4787');
  const manifestPath = args.get('manifest');
  if (manifestPath === undefined) {
    console.error('--manifest is required');
    return 1;
  }
  const server = await startLogh7Server({ host, port, manifestPath, resourceRoot: args.get('resource-root') });
  console.log(`LOGH7 local resource server listening on http://${server.host}:${server.port}`);
  return new Promise(() => undefined);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'serve') {
    return serve(argv);
  }
  if (command === 'health') {
    return health(argv);
  }
  console.error('usage: logh7-server.mjs <serve|health>');
  return 1;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  process.exitCode = await main();
}
