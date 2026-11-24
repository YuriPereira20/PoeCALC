// Currency Exchange history from GGG's official API, reduced to chaos prices per item.
import { getJson } from './_lib.mjs';

export const CHAOS = 'Metadata/Items/Currency/CurrencyRerollRare';
export const DIVINE = 'Metadata/Items/Currency/CurrencyModValues';
const isQ = (id) => id === CHAOS || id === DIVINE;
const sum = (v) => v.reduce((a, b) => a + b, 0);
const median = (v) => {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(hours, league) {
  const rates = [], byItem = new Map();
  for (const data of hours) for (const m of data.markets) {
    if (m.league !== league) continue;
    const [a, b] = m.market_pair, v = m.volume_traded, lo = m.lowest_ratio, hi = m.highest_ratio;
    if (isQ(a) && isQ(b)) {
      if (v[CHAOS] > 0 && v[DIVINE] > 0) rates.push(v[CHAOS] / v[DIVINE]);
      continue;
    }
    const [item, quote] = isQ(a) ? [b, a] : [a, b];
    // zero volume comes with zero ratios, which would divide by zero
    if (!isQ(quote) || !v[item] || !v[quote] || !lo[item] || !hi[item] || !lo[quote] || !hi[quote]) continue;
    const p1 = lo[quote] / lo[item], p2 = hi[quote] / hi[item];
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item).push({ quote, units: v[item], qv: v[quote], lo: Math.min(p1, p2), hi: Math.max(p1, p2) });
  }
  const divine = rates.length ? median(rates) : null;
  const items = new Map();
  for (const [item, all] of byItem) {
    // without a divine rate, divine markets cannot be priced in chaos
    const recs = all.filter((r) => divine !== null || r.quote === CHAOS);
    if (!recs.length) continue;
    const units = (q) => sum(recs.filter((r) => r.quote === q).map((r) => r.units));
    // the main market is the one with more units; the other one holds junk wealth transfers
    const quote = units(DIVINE) > units(CHAOS) ? DIVINE : CHAOS;
    const rate = quote === CHAOS ? 1 : divine;
    const mine = recs.filter((r) => r.quote === quote);
    items.set(item, {
      quote: quote === CHAOS ? 'chaos' : 'divine',
      price: median(mine.map((r) => (r.qv / r.units) * rate)),
      lo: median(mine.map((r) => r.lo * rate)),
      hi: median(mine.map((r) => r.hi * rate)),
      volume: sum(mine.map((r) => r.qv * rate)) / hours.length,
      hours: mine.length,
    });
  }
  items.set(CHAOS, { quote: 'chaos', price: 1, lo: 1, hi: 1, volume: null, hours: null });
  if (divine !== null) items.set(DIVINE, { quote: 'divine', price: divine, lo: divine, hi: divine, volume: null, hours: null });
  return { divine, items };
}

let baseCache = null;
export async function baseItems() {
  baseCache ??= getJson('https://repoe-fork.github.io/base_items.min.json').catch((e) => { baseCache = null; throw e; });
  return baseCache;
}

// Hour id -> promise of that hour's response; a failed or empty hour is dropped so the next call retries it.
const fetched = new Map();
const fetchHour = async (id) => {
  const r = await fetch(`https://web.poecdn.com/api/currency-exchange/${id}`, { headers: { 'user-agent': 'poe-profit-calculator/1.0' }, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (!r.ok || !j.markets?.length) throw new Error('hora sem dados');
  return j;
};
const hourOf = (id) => {
  if (!fetched.has(id)) fetched.set(id, fetchHour(id).catch(() => { fetched.delete(id); return null; }));
  return fetched.get(id);
};

export async function exchange(league) {
  const h0 = Math.floor(Date.now() / 3600e3) * 3600;
  const ids = [1, 2, 3, 4, 5, 6].map((i) => h0 - 3600 * i);
  for (const id of fetched.keys()) if (!ids.includes(id)) fetched.delete(id);
  const [got, base] = await Promise.all([Promise.all(ids.map(hourOf)), baseItems()]);
  const valid = got.filter(Boolean);
  if (!valid.length) throw new Error('Currency Exchange sem dados');
  return { ...summarize(valid, league), nHours: valid.length, base };
}

export function meta(base, id) {
  const dds = base[id]?.visual_identity?.dds_file;
  return { name: base[id]?.name ?? id.split('/').pop(), icon: dds ? `https://repoe-fork.github.io/${dds.replace(/\.dds$/, '.png')}` : undefined };
}
