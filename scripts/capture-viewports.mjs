import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts', 'viewports');
const profileRoot = path.join(tmpdir(), 'klask-viewport-profiles');
const targetUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';

const viewports = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'narrow-tall', width: 360, height: 800 },
  { name: 'pixel-7', width: 412, height: 915 },
  { name: 'iphone-15-pro-max', width: 430, height: 932 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'desktop-landscape', width: 1280, height: 800 },
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findBrowser() {
  const explicitPath = process.env.BROWSER_PATH;

  if (explicitPath && await exists(explicitPath)) {
    return explicitPath;
  }

  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error('No Chromium browser found. Set BROWSER_PATH to msedge.exe or chrome.exe.');
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function assertReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`${targetUrl} responded with ${response.status}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

class CdpClient {
  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);

      socket.addEventListener('open', () => {
        resolve(new CdpClient(socket));
      });
      socket.addEventListener('error', reject);
    });
  }

  close() {
    this.socket.close();
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
    });
  }
}

async function waitForDevtools(profilePath, child) {
  const portFile = path.join(profilePath, 'DevToolsActivePort');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Browser exited before DevTools was ready with code ${child.exitCode}.`);
    }

    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);

      if (port) {
        return Number(port);
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error('Timed out waiting for DevToolsActivePort.');
}

async function waitForPageWebsocket(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);

      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error('Timed out waiting for a debuggable page target.');
}

async function waitForAppReady(client) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const status = document.querySelector('.statusLine')?.textContent ?? '';
        const canvas = document.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        return Boolean(canvas && rect && rect.width > 0 && rect.height > 0 && status !== 'Loading table');
      })()`,
      returnByValue: true,
    });

    if (result.result?.value === true) {
      await delay(500);
      return;
    }

    await delay(100);
  }

  throw new Error('Timed out waiting for the KLASK scene to render.');
}

async function capture(browserPath, viewport) {
  const screenshotPath = path.join(outputDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`);
  const profilePath = path.join(profileRoot, `${viewport.name}-${Date.now()}`);
  const args = [
    '--headless=new',
    '--hide-scrollbars',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profilePath}`,
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank',
  ];

  await mkdir(profilePath, { recursive: true });

  const child = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const port = await waitForDevtools(profilePath, child);
    const pageWebsocket = await waitForPageWebsocket(port);
    const client = await CdpClient.connect(pageWebsocket);

    try {
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 860,
      });
      await client.send('Page.navigate', { url: targetUrl });
      await waitForAppReady(client);

      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
      });

      await writeFile(screenshotPath, screenshot.data, 'base64');
      return screenshotPath;
    } finally {
      client.close();
    }
  } finally {
    child.kill();

    if (stderr.includes('ERROR') && !stderr.includes('DevTools listening')) {
      console.warn(stderr);
    }
  }
}

await mkdir(outputDir, { recursive: true });
await mkdir(profileRoot, { recursive: true });
await assertReachable();

const browserPath = await findBrowser();
const screenshots = [];

for (const viewport of viewports) {
  const screenshot = await capture(browserPath, viewport);
  screenshots.push({ ...viewport, screenshot });
}

console.log(JSON.stringify({ targetUrl, browserPath, screenshots }, null, 2));
