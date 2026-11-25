// Hourly prices of the first 72 hours of each league, from GGG's official Currency Exchange API: writes data/hours.json.
// Re-run when a league starts or ends.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BELT_IDS } from './custom.mjs';
import { STARTS } from './forecast.mjs';
import { slug } from './import-history.mjs';
import { CHAOS, baseItems, meta, summarize } from './extras/_exchange.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOURS = 72;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// one hour's prices of the tracked ids in chaos, 3 significant digits; the chaos entry is left out, as in the daily history
export function hourPrices(markets, league, base, tracked) {
  const out = new Map();
  for (const [id, item] of summarize([{ markets }], league).items) {
    const sid = slug(meta(base, id).name);
    if (id !== CHAOS && tracked.has(sid) && item.price > 0) out.set(sid, Number(item.price.toPrecision(3)));
  }
  return out;
}

// one hour of the API as { hour, markets }. hour = next_change_id - 3600 is the hour it really holds, which can be
// another one than the one asked for. A network error is retried once after 2 s; a failed hour is null.
async function getHour(t) {
  let j = null;
  for (let attempt = 0; attempt < 2 && !j; attempt++) {
    if (attempt) await sleep(2000);
    try {
      const r = await fetch(`https://web.poecdn.com/api/currency-exchange/${t}`, { headers: { 'user-agent': 'poe-profit-calculator/1.0' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) j = await r.json();
    } catch {}
  }
  await sleep(300);
  return j && { hour: j.next_change_id - 3600, markets: j.markets ?? [] };
}

// first hour with a market of the league, from 15:00 UTC on its start date, 14 hours at most
async function launchHour(league, start) {
  let t = Date.parse(`${start}T15:00:00Z`) / 1000;
  for (let k = 0; k < 14; k++) {
    const r = await getHour(t);
    if (!r) return null; // a failed request is not an empty hour: the league is skipped, not started a few hours late
    if (r.markets.some((m) => m.league === league)) return r.hour;
    // an hour before the API's first one comes back as that first one, so nothing is missing before it
    t = r.hour + 3600;
  }
  return null;
}

async function main() {
  const history = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'history.json'), 'utf8'));
  const { strategies } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'strategies.json'), 'utf8'));
  const tracked = new Set([...strategies.flatMap((s) => [...s.req, ...s.rew].map((l) => l.item)), ...BELT_IDS]);
  // the past leagues of the daily history and the running ones, except Hardcore
  const leagues = { ...history.leagues, ...Object.fromEntries(Object.entries(STARTS).filter(([name]) => !name.startsWith('Hardcore'))) };
  const base = await baseItems();
  const out = { leagues: {}, items: {} };
  const done = [];
  for (const [league, start] of Object.entries(leagues)) {
    const t0 = await launchHour(league, start);
    if (t0 === null) {
      console.log(`${league}: no launch hour in the API, skipped`);
      continue;
    }
    console.log(`${league}: launch ${new Date(t0 * 1000).toISOString()}, fetching ${HOURS} hours`);
    const series = new Map(); // tracked id -> prices by hour index
    let withData = 0;
    for (let k = 0; k < HOURS; k++) {
      const t = t0 + 3600 * k, r = await getHour(t);
      if (!r || r.hour !== t) continue; // failed, or the API answered with another hour
      if (r.markets.some((m) => m.league === league)) withData++;
      for (const [sid, p] of hourPrices(r.markets, league, base, tracked)) {
        if (!series.has(sid)) series.set(sid, new Array(HOURS).fill(null));
        series.get(sid)[k] = p;
      }
    }
    if (!series.size) {
      console.log(`${league}: no tracked prices, skipped`);
      continue;
    }
    out.leagues[league] = new Date(t0 * 1000).toISOString();
    for (const [sid, prices] of series) {
      while (prices.at(-1) === null) prices.pop();
      (out.items[sid] ??= {})[league] = prices;
    }
    done.push({ league, withData, ids: series.size });
  }

  const file = path.join(ROOT, 'data', 'hours.json');
  fs.writeFileSync(file, JSON.stringify(out));
  for (const d of done) console.log(`${d.league}: launch ${out.leagues[d.league]}, ${d.withData} hours with data, ${d.ids} tracked ids with data`);
  const ids = Object.keys(out.items), atLeast = (n) => ids.filter((id) => Object.keys(out.items[id]).length >= n).length;
  console.log(`ids with 1+ league: ${atLeast(1)}, with 3+ leagues: ${atLeast(3)}`);
  console.log(`${file}: ${(fs.statSync(file).size / 1048576).toFixed(2)} MB`);
}

// only when run directly: the tests import hourPrices
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
