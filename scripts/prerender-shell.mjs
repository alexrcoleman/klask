import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const indexPath = resolve('dist', 'index.html');
const serverEntryPath = resolve('dist-ssr', 'entry-server.js');
const placeholder = '<!--app-html-->';

const { renderShell } = await import(pathToFileURL(serverEntryPath).href);
const html = await readFile(indexPath, 'utf8');

if (!html.includes(placeholder)) {
  throw new Error(`Missing ${placeholder} in ${indexPath}`);
}

await writeFile(indexPath, html.replace(placeholder, renderShell()));
