/**
 * Screenshots of the settings tabs, the popup, the open filter editor,
 * and the timeline counts. Serves the built extension and stubs the
 * extension storage API so the pages render outside Chrome.
 *
 *   pnpm build && node scripts/screenshot-settings.mjs
 *
 * Playwright is loaded from the environment. The pictures land in
 * screenshots/ at the repo root.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..');
const output = join(root, '.output/chrome-mv3');
const shots = join(root, 'screenshots');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};

const chromeStub = `(() => {
  const store = {};
  const listeners = new Set();
  const storageArea = {
    get(keys) {
      const result = {};
      if (keys == null) {
        return Promise.resolve({ ...store });
      }
      if (typeof keys === 'string') {
        if (keys in store) result[keys] = store[keys];
        return Promise.resolve(result);
      }
      if (Array.isArray(keys)) {
        for (const name of keys) if (name in store) result[name] = store[name];
        return Promise.resolve(result);
      }
      for (const name of Object.keys(keys)) result[name] = name in store ? store[name] : keys[name];
      return Promise.resolve(result);
    },
    set(items, cb) {
      Object.assign(store, items);
      const promise = Promise.resolve();
      if (typeof cb === 'function') promise.then(cb);
      for (const listen of listeners) listen({ settings: { newValue: items } }, 'local');
      return promise;
    },
    remove(keys) {
      for (const key of [].concat(keys)) delete store[key];
      return Promise.resolve();
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
      return Promise.resolve();
    },
    onChanged: {
      addListener(fn) { listeners.add(fn); },
      removeListener(fn) { listeners.delete(fn); },
    },
  };
  globalThis.chrome = {
    runtime: {
      id: 'preview',
      getURL: (path) => path,
      sendMessage: (message) => {
        if (message && message.type === 'getPublicSettings') {
          return Promise.resolve({
            hasKey: true,
            settings: {
              enabled: true,
              provider: 'typesafe',
              typesafeApiKey: '',
              openrouterApiKey: '',
              model: '',
              signals: {
                slop: { enabled: true, threshold: 0.7 },
                ragebait: { enabled: true, threshold: 0.7 },
                ads: { enabled: true, threshold: 0.6 },
              },
              slopCategories: {},
              replyBotThreshold: 0.55,
              slopWeights: null,
              labeling: false,
              aiWritten: { show: true, floor: 0.5 },
              hideAiWritten: false,
              minQuality: 0,
              customFilters: [],
              mediaFilters: { images: false, videos: false, gifs: false },
              hidePromoted: false,
              hideMode: 'collapse',
              cards: { colorCoding: true, style: 'solid', textSize: 'medium', hideAnimation: 'particles', animatedBorder: true, colors: {} },
              hideUntilChecked: false,
              allowlist: [],
              blocklist: [],
              repeatThreshold: 3,
              preset: 'balanced',
              presetBase: 'balanced',
            },
          });
        }
        if (message && message.type === 'getStats') {
          return Promise.resolve({ stats: { checked: 12, filtered: 4, settledLocally: 3, bySignal: {}, inputTokens: 0, cost: 0.004 } });
        }
        if (message && message.type === 'getError') return Promise.resolve({ lastError: null });
        return Promise.resolve({ ok: true, stats: null, lastError: null });
      },
      openOptionsPage: () => Promise.resolve(),
      onMessage: { addListener() {}, removeListener() {} },
    },
    storage: {
      local: storageArea,
      sync: storageArea,
      onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
    },
    tabs: { query: () => Promise.resolve([]), create: () => Promise.resolve(), update: () => Promise.resolve() },
  };
  globalThis.browser = globalThis.chrome;
})();`;

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
    const file = rel === '/timeline-preview.html'
      ? join(root, 'scripts/fixtures/timeline-preview.html')
      : join(output, rel);
    try {
      let body = readFileSync(file);
      const type = types[extname(file)] ?? 'application/octet-stream';
      if (rel === '/options.html' || rel === '/popup.html') {
        const html = body.toString('utf8').replace('<head>', `<head><script>${chromeStub}</script>`);
        body = Buffer.from(html);
      }
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('missing');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const port = server.address().port;
const browser = await chromium.launch();
mkdirSync(shots, { recursive: true });

async function pageAt(width, path) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', (err) => console.error('pageerror', err.message));
  await page.addInitScript(chromeStub);
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'networkidle' });
  return page;
}

const tabs = [
  ['filtering', 'Filtering'],
  ['lists', 'Lists'],
  ['appearance', 'Appearance'],
  ['account', 'Account'],
];

for (const width of [1280, 800]) {
  const page = await pageAt(width, '/options.html');
  await page.waitForSelector('h1');
  for (const [id, label] of tabs) {
    await page.getByRole('tab', { name: label }).click();
    await page.screenshot({ path: join(shots, `options-${id}-${width}.png`), fullPage: true });
  }
  await page.getByRole('tab', { name: 'Filtering' }).click();
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('button', { name: 'Add a filter' }).click();
  await page.screenshot({ path: join(shots, `options-filter-${width}.png`), fullPage: true });
  await page.close();

  const popup = await pageAt(width, '/popup.html');
  await popup.waitForSelector('h1');
  await popup.screenshot({ path: join(shots, `popup-${width}.png`), fullPage: true });
  await popup.close();
}

const timeline = await pageAt(1280, '/timeline-preview.html');
await timeline.waitForSelector('.ct-ai-pill');
await timeline.screenshot({ path: join(shots, 'timeline-overlay.png'), fullPage: true });
await timeline.close();

await browser.close();
server.close();
console.log(shots);
