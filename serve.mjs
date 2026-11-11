// A tiny local web server, so the browser can load the game.
// Browsers refuse to load this kind of code from a double-clicked file.
//
//   node serve.mjs          start the server
//   node serve.mjs --open   start it and open the game in your browser
//
// It serves this folder to this computer only. It uses nothing but Node.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const URL_TEXT = `http://localhost:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, URL_TEXT).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    // Stay inside this folder, and never serve hidden files such as .git.
    const inside = file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep);
    const hidden = path.split('/').some((part) => part.startsWith('.'));
    if (!inside || hidden) {
      response.writeHead(403, { 'Content-Type': 'text/plain' });
      response.end('Forbidden');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // always serve the latest files while developing
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`The game server is already running. Open ${URL_TEXT} in your browser.`);
    if (process.argv.includes('--open')) openBrowser();
  } else {
    console.error(`The game server could not start: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Harborfall is running at ${URL_TEXT}`);
  console.log('Leave this window open while you play. Close it, or press Ctrl+C, to stop.');
  if (process.argv.includes('--open')) openBrowser();
});

function openBrowser() {
  const command =
    process.platform === 'win32' ? `start "" "${URL_TEXT}"` : process.platform === 'darwin' ? `open "${URL_TEXT}"` : `xdg-open "${URL_TEXT}"`;
  exec(command, () => {});
}
