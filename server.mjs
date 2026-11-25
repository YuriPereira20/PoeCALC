import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchLivePrices } from './prices.mjs';
import { belt, UNID, BELT_IDS, BELT_ICON } from './custom.mjs';
import { STARTS, dayOf, forecast } from './forecast.mjs';
import { hashPassword, verifyPassword, sign, verify } from './auth.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3210;
const HOST = process.env.HOST || 'localhost';
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'var');
const LEAGUES = ['Covens', 'Hardcore Covens', 'Standard', 'Hardcore'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const HOUR = 60 * 60 * 1000;
const SESSION_MS = 30 * 24 * HOUR;
const LOCK = { max: 10, ms: 15 * 60 * 1000 };
const NAME = /^[a-zA-Z0-9_.-]{3,32}$/;

const json = (res, code, obj) => {
  // no-store: the answers need a login, so they must not stay in a shared browser's cache after "Sair"
  res.writeHead(code, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

// one file per league name: its price cache, and the history of its daily prices
const leagueFile = (league) => league.replace(/[^a-zA-Z0-9]/g, '_');

// queued, so two refreshes never read and write the history file at the same time
let recording = Promise.resolve();
// today's prices (UTC date) become one row of DATA_DIR/history-<league>.json; only the first refresh of a day counts
const recordDay = (league, cache) => (recording = recording.catch(() => {}).then(async () => {
  const file = join(DATA_DIR, `history-${leagueFile(league)}.json`), day = cache.at.slice(0, 10);
  let days = {};
  try { days = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (days[day]) return;
  days[day] = Object.fromEntries(Object.entries(cache.prices).map(([id, p]) => [id, [p, cache.counts[id] ?? 0]]));
  // a temp file and a rename, like users.json: a crash mid-write never leaves a broken history
  await writeFile(`${file}.tmp`, JSON.stringify(days));
  await rename(`${file}.tmp`, file);
}));

// fetches the live prices of a league and keeps them as its cache; null when every request failed
const refreshPrices = async (league) => {
  const base = JSON.parse(await readFile(join(ROOT, 'data', 'strategies.json'), 'utf8'));
  const wanted = new Set([...BELT_IDS, ...base.strategies.flatMap((s) => [...s.req, ...s.rew].map((l) => l.item))]);
  const { prices, counts } = await fetchLivePrices(league, wanted).catch(() => ({ prices: {}, counts: {} }));
  // empty result = every request failed: keep the old cache if there is one
  if (!Object.keys(prices).length) return null;
  const cache = { at: new Date().toISOString(), prices, counts };
  await writeFile(join(ROOT, 'data', `prices-${leagueFile(league)}.json`), JSON.stringify(cache));
  await recordDay(league, cache).catch((e) => console.error('histórico não gravado:', e.message));
  return cache;
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

  const file = join(ROOT, 'data', `prices-${leagueFile(league)}.json`);
  let cache = null;
  try { cache = JSON.parse(await readFile(file, 'utf8')); } catch {}
  const fresh = cache && u.searchParams.get('refresh') !== '1' && Date.now() - Date.parse(cache.at) < HOUR;
  if (!fresh) cache = (await refreshPrices(league)) ?? cache;

  const live = { ...(cache?.prices ?? {}) }, counts = cache?.counts ?? {};
  const b = belt(base.strategies, live, counts);
  // no price source lists the unidentified belt, so it is worth the average roll
  if (b.ev > 0) live[UNID] ??= b.ev;
  json(res, 200, {
    syncedAt: base.syncedAt,
    league,
    pricesAt: cache?.at ?? null,
    categories: b.strategy ? base.categories.map((c) => (c.slug === b.strategy.category ? { ...c, count: c.count + 1 } : c)) : base.categories,
    strategies: b.strategy ? [...base.strategies, b.strategy] : base.strategies,
    icons: { ...Object.fromEntries([UNID, ...BELT_IDS].map((id) => [id, BELT_ICON])), ...(base.icons ?? {}) },
    live,
    counts,
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

// data/history.json (import-history.mjs) is read on first use and then kept in memory
let pastCache = null;
const pastHistory = async () => (pastCache ??= JSON.parse(await readFile(join(ROOT, 'data', 'history.json'), 'utf8')));

// one item: its past leagues, the running league and the forecast; the item page and the calculator read the same numbers
const itemHistory = async (u, res) => {
  const league = u.searchParams.get('league') || 'Covens', id = u.searchParams.get('id') || '';
  if (!LEAGUES.includes(league)) return json(res, 400, { error: 'Liga inválida' });
  if (!STARTS[league]) return json(res, 400, { error: 'Previsão só para as ligas da temporada' });
  let all;
  try { all = await pastHistory(); } catch (e) { if (e.code !== 'ENOENT') throw e; return json(res, 503, { error: 'Histórico não importado' }); }
  if (!Object.hasOwn(all.items, id)) return json(res, 404, { error: 'Sem histórico para este item' });
  const past = all.items[id], series = Object.values(past);
  const base = await readFile(join(ROOT, 'data', 'strategies.json'), 'utf8').then(JSON.parse, () => ({ strategies: [] }));
  const line = base.strategies.flatMap((s) => [...s.req, ...s.rew]).find((l) => l.item === id);
  const cache = await readFile(join(ROOT, 'data', `prices-${leagueFile(league)}.json`), 'utf8').then(JSON.parse, () => null);
  const days = await readFile(join(DATA_DIR, `history-${leagueFile(league)}.json`), 'utf8').then(JSON.parse, () => ({}));
  const day = dayOf(league), now = cache?.prices?.[id] > 0 ? cache.prices[id] : null;
  const cur = Object.entries(days).map(([date, rows]) => [dayOf(league, new Date(date)), rows[id]?.[0]]).filter(([d, p]) => d >= 0 && p > 0);
  if (now && day >= 0 && !cur.some(([d]) => d === day)) cur.push([day, now]);
  cur.sort((a, b) => a[0] - b[0]);
  // anchored on today's price when there is one; otherwise the plain spread of the past prices on that day
  const fc = (d) => (now && day >= 0 ? forecast(series, d, day, now) : forecast(series, d));
  const band = [];
  for (let d = Math.max(day + 1, 0); d < 120; d++) { const f = fc(d); if (f) band.push({ d, lo: f.lo, mid: f.mid, hi: f.hi }); }
  json(res, 200, { id, name: line?.name ?? id, icon: base.icons?.[id] ?? (BELT_IDS.includes(id) ? BELT_ICON : null), league, day, now, past, cur, band, at: Object.fromEntries([7, 14, 30, 60].map((h) => [h, fc(day + h)])) });
};

// shortcut: users in one JSON file, fine for dozens of logins; move to a database if it grows
const USERS_FILE = join(DATA_DIR, 'users.json');
await mkdir(DATA_DIR, { recursive: true });
let users = new Map();
try { users = new Map(Object.entries(JSON.parse(await readFile(USERS_FILE, 'utf8')))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
let saving = Promise.resolve();
// one write at a time, through a temp file: parallel saves or a crash never leave users.json half-written
const saveUsers = () => (saving = saving.catch(() => {}).then(async () => {
  await writeFile(`${USERS_FILE}.tmp`, JSON.stringify(Object.fromEntries(users), null, 2));
  await rename(`${USERS_FILE}.tmp`, USERS_FILE);
}));
// creates the login, or replaces its password and admin flag
const putUser = async (name, password, admin) => {
  users.set(name, { hash: await hashPassword(password), admin, createdAt: users.get(name)?.createdAt ?? new Date().toISOString() });
  await saveUsers();
};
if (process.env.ADMIN_PASSWORD) await putUser(process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASSWORD, true);
else if (!users.size) console.warn('no users yet: nobody can log in until ADMIN_PASSWORD is set');

// sessions survive restarts: the secret is kept in DATA_DIR unless SESSION_SECRET is set
const SECRET_FILE = join(DATA_DIR, 'secret');
let SECRET = process.env.SESSION_SECRET || (await readFile(SECRET_FILE, 'utf8').catch(() => '')).trim();
if (!SECRET) { SECRET = randomBytes(32).toString('hex'); await writeFile(SECRET_FILE, SECRET); }

// unknown names pay for one scrypt check too, so the reply time does not tell them apart
const DUMMY = await hashPassword(randomBytes(16).toString('hex'));

// shortcut: the lock is per user name, so someone can keep a known name locked; switch to per-IP if that happens
const failures = new Map(); // lower-cased name -> { n, until }
setInterval(() => { for (const [k, f] of failures) if (f.until <= Date.now()) failures.delete(k); }, LOCK.ms).unref(); // made-up names must not grow it forever

// shortcut: changing a password does not end that user's open sessions; add a per-user counter to the token if that matters
const sessionUser = (req) => {
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  const name = sid && verify(sid, SECRET);
  return name && users.has(name) ? name : null;
};
const setSid = (req, res, value, maxAge) => res.setHeader('set-cookie', `sid=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);

// CSRF guard: a cross-site form cannot send application/json, and SameSite=Lax keeps the cookie off cross-site posts
const fail = (status, message) => Object.assign(new Error(message), { status });
const jsonOnly = (req) => {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Envie application/json');
};
const readBody = async (req) => {
  jsonOnly(req);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    if ((size += c.length) > 10_000) throw fail(413, 'Dados grandes demais');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) ?? {}; } catch { throw fail(400, 'JSON inválido'); }
};

const login = async (req, res) => {
  const { user, password } = await readBody(req);
  const key = String(user ?? '').toLowerCase(), now = Date.now(), f = failures.get(key);
  if (f?.until > now && f.n >= LOCK.max) return json(res, 429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  // counted before the slow check, so parallel requests cannot all slip past the limit
  failures.set(key, f?.until > now ? { n: f.n + 1, until: f.until } : { n: 1, until: now + LOCK.ms });
  const u = users.get(user);
  const ok = await verifyPassword(String(password ?? ''), u?.hash ?? DUMMY);
  if (!u || !ok) return json(res, 401, { error: 'Usuário ou senha incorretos' });
  failures.delete(key);
  setSid(req, res, sign(user, SECRET, SESSION_MS), SESSION_MS / 1000);
  json(res, 200, { user, admin: u.admin });
};

const logout = (req, res) => {
  jsonOnly(req);
  setSid(req, res, '', 0);
  json(res, 200, { ok: true });
};

const adminUsers = async (req, res, u, me) => {
  if (!users.get(me).admin) return json(res, 403, { error: 'Só para admin' });
  if (req.method === 'GET') {
    return json(res, 200, [...users].map(([name, x]) => ({ name, admin: x.admin, createdAt: x.createdAt })).sort((a, b) => a.name.localeCompare(b.name)));
  }
  if (req.method === 'POST') {
    const { name, password, admin } = await readBody(req);
    if (typeof name !== 'string' || !NAME.test(name)) throw fail(400, 'Usuário: de 3 a 32 letras, números, _ . ou -');
    if (typeof password !== 'string' || password.length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres');
    if (name === me && admin !== true) throw fail(400, 'Você não pode tirar o seu próprio acesso de admin');
    await putUser(name, password, admin === true);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    const name = u.searchParams.get('name');
    if (name === me) throw fail(400, 'Você não pode excluir a sua própria conta');
    users.delete(name);
    await saveUsers();
    return json(res, 200, { ok: true });
  }
  json(res, 405, { error: 'Método não permitido' });
};

const sendFile = async (res, p) => {
  const body = await readFile(join(ROOT, 'public', p)).catch(() => null);
  if (!body) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  res.end(body);
};

const server = createServer(async (req, res) => {
  try {
    // never framed by another site: a hidden frame could trick an admin into clicking "Excluir"
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('x-content-type-options', 'nosniff');
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/login') return await sendFile(res, 'login.html');
    if (u.pathname === '/api/login' && req.method === 'POST') return await login(req, res);
    if (u.pathname === '/api/logout' && req.method === 'POST') return logout(req, res);

    const me = sessionUser(req);
    if (!me) {
      if (u.pathname.startsWith('/api/')) return json(res, 401, { error: 'Faça login' });
      res.writeHead(302, { location: '/login' });
      return res.end();
    }
    if (u.pathname === '/api/me') return json(res, 200, { user: me, admin: users.get(me).admin });
    if (u.pathname === '/api/admin/users') return await adminUsers(req, res, u, me);
    if (u.pathname === '/api/data') return await api(u, res);
    if (u.pathname === '/api/history') return await itemHistory(u, res);
    if (u.pathname === '/api/extras') return json(res, 200, (await discoverExtras()).map(({ slug, title, order }) => ({ slug, title, order })));
    if (u.pathname.startsWith('/api/extra/')) return await extra(u, res, u.pathname.slice('/api/extra/'.length));

    const p = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    if (p.includes('..')) return json(res, 400, { error: 'Caminho inválido' });
    await sendFile(res, p);
  } catch (e) {
    if (!res.headersSent) json(res, e.status ?? 500, { error: e.message });
  }
});

// the running league's history also grows when nobody opens the page: a refresh 10 s after boot, then every 6 hours
const refreshTimer = () => refreshPrices(LEAGUES[0]).catch((e) => console.error('atualização automática falhou:', e.message));
setTimeout(refreshTimer, 10_000).unref();
setInterval(refreshTimer, 6 * HOUR).unref();

// HOST stays localhost locally; Railway sets HOST=0.0.0.0 so its proxy can reach the app
server.listen(PORT, HOST, () => console.log(`http://localhost:${PORT}`));
