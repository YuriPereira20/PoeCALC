// Rebuilds data/history.json from the poe.ninja data dumps of past leagues (https://poe.ninja/poe1/data).
// Re-run after each league ends: unzip its dump into <folder>/<League>/, then run node import-history.mjs <folder>.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { BELT_IDS } from './custom.mjs';
import { backtest } from './forecast.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DAYS = 120;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const slug = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// the ids a dump item could be, most specific first; the first one that is tracked wins
export function candidateIds({ name, base, variant, links }) {
  const L = links === '5 links' ? '5l' : links === '6 links' ? '6l' : '';
  const b = base === name ? '' : base;
  const tier = /\(Tier (\d+)\)/.exec(base);
  return [
    [name, b, variant, L],
    [name, variant, L],
    [name, b, L],
    [name, L],
    ...(tier ? [[name, `t${tier[1]}`]] : []),
    [name, 'temple'],
  ].map((p) => slug(p.filter(Boolean).join(' ')));
}

// streams the CSV; lines that do not fit are skipped (the header, pieces of names that contain line breaks)
const eachRow = (file, width, fn) => new Promise((resolve, reject) => {
  const input = fs.createReadStream(file);
  input.on('error', reject);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const c = line.split(';');
    if (c.length === width && DATE.test(c[1])) fn(c);
  });
  rl.on('close', resolve);
});

// dense array by day index: 3 significant digits, null where a day has no price
const dense = (m) => {
  const s = new Array(Math.max(...m.keys()) + 1).fill(null);
  for (const [d, p] of m) s[d] = Number(p.toPrecision(3));
  return s;
};

// one league: its start (first day of the currency file) and the series of each tracked id it has
async function league(dir, name, tracked) {
  const cur = [];
  await eachRow(path.join(dir, `${name}.currency.csv`), 6, (c) => cur.push(c));
  if (!cur.length) return null;
  const start = cur.reduce((m, c) => (c[1] < m ? c[1] : m), cur[0][1]);
  const t0 = Date.parse(start), dayOf = (date) => (Date.parse(date) - t0) / 864e5;
  const seen = new Set();

  // X costs V chaos (direct) and 1 chaos buys V of X (inverted): a direct row wins its day
  const prices = new Map(); // id -> Map(day -> chaos)
  const put = (id, d, p, direct) => {
    if (!prices.has(id)) prices.set(id, new Map());
    const m = prices.get(id);
    if (direct || !m.has(d)) m.set(d, p);
  };
  for (const c of cur) {
    const d = dayOf(c[1]), v = Number(c[4]);
    if (!(v > 0) || d < 0 || d >= DAYS) continue;
    seen.add(d);
    if (c[3] === 'Chaos Orb' && c[2] !== 'Chaos Orb') put(slug(c[2]), d, v, true);
    else if (c[2] === 'Chaos Orb' && c[3] !== 'Chaos Orb') put(slug(c[3]), d, 1 / v, false);
  }

  // the mapping is decided once per dump Id; null when no tracked id matches
  const cache = new Map(), dumps = new Map(), best = new Map();
  const itemsFile = path.join(dir, `${name}.items.csv`);
  if (fs.existsSync(itemsFile)) await eachRow(itemsFile, 10, (c) => {
    const v = Number(c[8]), d = dayOf(c[1]);
    if (!(v > 0) || d < 0 || d >= DAYS) return;
    seen.add(d);
    if (!cache.has(c[2])) {
      const cands = candidateIds({ name: c[4], base: c[5], variant: c[6], links: c[7] });
      const rank = cands.findIndex((k) => tracked.has(k));
      cache.set(c[2], rank < 0 ? null : { id: cands[rank], rank });
    }
    const m = cache.get(c[2]);
    if (!m) return;
    if (!dumps.has(c[2])) dumps.set(c[2], { ...m, rows: 0, days: new Map() });
    const e = dumps.get(c[2]);
    e.rows++;
    e.days.set(d, v);
  });
  // two dump Ids for one tracked id: the earlier candidate wins, on a tie the one with more rows
  for (const e of dumps.values()) {
    const b = best.get(e.id);
    if (!b || e.rank < b.rank || (e.rank === b.rank && e.rows > b.rows)) best.set(e.id, e);
  }

  // a currency price replaces the stash line on the days both have
  const found = new Map(); // tracked id -> Map(day -> price)
  for (const [id, e] of best) found.set(id, e.days);
  for (const [id, m] of prices) found.set(id, new Map([...(found.get(id) ?? []), ...m]));
  const series = new Map();
  for (const [id, m] of found) if (tracked.has(id) && m.size) series.set(id, dense(m));
  return { start, days: seen.size, series };
}

async function main(folder) {
  if (!folder) {
    console.error('usage: node import-history.mjs <folder>');
    process.exit(1);
  }
  const { strategies } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'strategies.json'), 'utf8'));
  const names = new Map(); // tracked id -> name, as the strategies print it
  for (const s of strategies) for (const l of [...s.req, ...s.rew]) if (!names.has(l.item)) names.set(l.item, l.name);
  const tracked = new Set([...names.keys(), ...BELT_IDS]);

  const history = { leagues: {}, items: {} };
  for (const name of fs.readdirSync(folder).sort()) {
    if (!fs.existsSync(path.join(folder, name, `${name}.currency.csv`))) continue;
    const r = await league(path.join(folder, name), name, tracked);
    if (!r) {
      console.log(`${name}: empty currency file, skipped`);
      continue;
    }
    history.leagues[name] = r.start;
    for (const [id, s] of r.series) (history.items[id] ??= {})[name] = s;
    console.log(`${name}: start ${r.start}, ${r.days} days with prices, ${r.series.size} tracked ids`);
  }

  const file = path.join(ROOT, 'data', 'history.json');
  fs.writeFileSync(file, JSON.stringify(history));
  const ids = Object.keys(history.items);
  const atLeast = (k) => ids.filter((id) => Object.keys(history.items[id]).length >= k).length;
  const pct = (a, b) => `${(100 * a / b).toFixed(1)}%`;
  console.log(`tracked ids ${tracked.size}: ${atLeast(1)} with data (${pct(atLeast(1), tracked.size)}), ${atLeast(3)} in 3+ leagues`);
  console.log(`${file}: ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`);

  const none = [...tracked].filter((id) => !history.items[id]).sort();
  const k = Math.min(40, none.length);
  console.log(`no data at all: ${none.length} ids, sample of ${k}:`);
  for (let i = 0; i < k; i++) {
    const id = none[Math.floor(i * none.length / k)];
    console.log(`  ${id} | ${names.get(id) ?? 'BELT_IDS'}`);
  }

  const err = (x) => (x == null ? 'n/a' : pct(x, 1));
  for (const h of [7, 14, 30]) {
    const r = backtest(history.items, 12, h);
    console.log(`backtest anchor 12 (day 13), horizon ${h}: model ${err(r.model)} vs naive ${err(r.naive)} (n=${r.n})`);
  }
}

// only when run directly: the tests import the helpers above
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main(process.argv[2]);
