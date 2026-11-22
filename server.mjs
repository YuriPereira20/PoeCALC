import { createServer } from 'node:http';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchLivePrices } from './prices.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3210;
const LEAGUES = ['Covens', 'Hardcore Covens', 'Standard', 'Hardcore'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const HOUR = 60 * 60 * 1000;

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': TYPES['.json'] });
  res.end(JSON.stringify(obj));
};

const api = async (u, res) => {
  const league = u.searchParams.get('league') || 'Covens';
  if (!LEAGUES.includes(league)) return json(res, 400, { error: 'Liga inválida' });

  let base;
  try {
    base = JSON.parse(await readFile(join(ROOT, 'data', 'strategies.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return json(res, 503, { error: 'Rode: npm run sync' });
    throw e;
  }

  const file = join(ROOT, 'data', `prices-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  let cache = null;
  try { cache = JSON.parse(await readFile(file, 'utf8')); } catch {}
  const fresh = cache && u.searchParams.get('refresh') !== '1' && Date.now() - Date.parse(cache.at) < HOUR;
  if (!fresh) {
    const wanted = new Set(base.strategies.flatMap((s) => [...s.req, ...s.rew].map((l) => l.item)));
    const { prices, counts } = await fetchLivePrices(league, wanted).catch(() => ({ prices: {}, counts: {} }));
    // empty result = every request failed: keep the old cache if there is one
    if (Object.keys(prices).length) {
      cache = { at: new Date().toISOString(), prices, counts };
      await writeFile(file, JSON.stringify(cache));
    }
  }

  json(res, 200, {
    syncedAt: base.syncedAt,
    league,
    pricesAt: cache?.at ?? null,
    categories: base.categories,
    strategies: base.strategies,
    icons: base.icons ?? {},
    live: cache?.prices ?? {},
    counts: cache?.counts ?? {},
  });
};

// special calculators: extras/<slug>.mjs, contract in extras/_lib.mjs
const extraJobs = new Map(); // `${slug}|${league}` -> in-flight load(), shared by simultaneous requests

const discoverExtras = async () => {
  const dir = join(ROOT, 'extras');
  const found = [];
  for (const f of await readdir(dir)) {
    const slug = f.slice(0, -4);
    if (!f.endsWith('.mjs') || f.startsWith('_') || !/^[a-z0-9-]+$/.test(slug)) continue;
    const path = join(dir, f);
    try {
      // mtime in the URL: an edited or previously broken module is imported again, not taken from Node's module cache
      const url = pathToFileURL(path);
      url.search = `v=${(await stat(path)).mtimeMs}`;
      const mod = await import(url.href);
      found.push({ slug, title: mod.title ?? slug, order: mod.order ?? 0, load: mod.load });
    } catch (e) {
      console.error(`extras/${f} skipped:`, e);
    }
  }
  return found.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR'));
};

const runExtra = (m, league, file) => {
  const key = `${m.slug}|${league}`;
  if (!extraJobs.has(key)) {
    extraJobs.set(key, (async () => {
      const out = { at: new Date().toISOString(), ...(await m.load(league)) };
      await writeFile(file, JSON.stringify(out));
      return out;
    })().finally(() => extraJobs.delete(key)));
  }
  return extraJobs.get(key);
};

const extra = async (u, res, slug) => {
  const league = u.searchParams.get('league') || 'Covens';
  if (!LEAGUES.includes(league)) return json(res, 400, { error: 'Liga inválida' });
  const m = (await discoverExtras()).find((x) => x.slug === slug);
  if (!m) return json(res, 404, { error: 'Calculadora não encontrada' });

  const file = join(ROOT, 'data', `extra-${slug}-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  let cache = null;
  try { cache = JSON.parse(await readFile(file, 'utf8')); } catch {}
  const fresh = cache && u.searchParams.get('refresh') !== '1' && Date.now() - Date.parse(cache.at) < HOUR;
  let stale = false;
  if (!fresh) {
    try {
      cache = await runExtra(m, league, file);
    } catch (e) {
      if (!cache) return json(res, 502, { error: e.message });
      stale = true; // load() failed: serve the previous cache, marked as stale
    }
  }
  json(res, 200, { slug, title: m.title, league, at: cache.at, stale, note: cache.note, defaultSort: cache.defaultSort, columns: cache.columns, rows: cache.rows });
};

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/api/data') return await api(u, res);
    if (u.pathname === '/api/extras') return json(res, 200, (await discoverExtras()).map(({ slug, title, order }) => ({ slug, title, order })));
    if (u.pathname.startsWith('/api/extra/')) return await extra(u, res, u.pathname.slice('/api/extra/'.length));

    const p = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    if (p.includes('..')) return json(res, 400, { error: 'Caminho inválido' });
    const body = await readFile(join(ROOT, 'public', p)).catch(() => null);
    if (!body) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});

// loopback only: nothing here needs to be reachable from the network
server.listen(PORT, 'localhost', () => console.log(`http://localhost:${PORT}`));
