// Shared helpers for the special calculators in this folder.
// Each calculator is one file extras/<slug>.mjs exporting: title, order, load(league).
// Rows may carry an optional "icon": absolute image url, shown before the row's first text column.
// Files starting with "_" are helpers, not calculators.
export const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };

const get = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 120)}`);
  return r;
};
export const getText = async (url) => (await get(url)).text();
export const getJson = async (url) => (await get(url)).json();

// poe.how tRPC query. Optional inputs must be OMITTED, not null (null is rejected).
export async function trpc(proc, json) {
  const u = `https://poe.how/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json } }))}`;
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) });
  const j = JSON.parse(await r.text())[0];
  if (!j.result) throw new Error(`${proc}: ${JSON.stringify(j.error).slice(0, 300)}`);
  return j.result.data.json;
}

// poe.ninja stash lines of the given types -> Map name -> icon url. Memoized per league|type;
// a failed request gives nothing and is retried on the next call.
const ninjaCache = new Map();
const ninjaLines = (league, type) => {
  const key = `${league}|${type}`;
  if (!ninjaCache.has(key)) {
    ninjaCache.set(key, (async () => {
      try {
        const j = await getJson(`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`);
        return j.lines.filter((l) => l.icon).map((l) => [l.name, l.icon]);
      } catch {
        ninjaCache.delete(key);
        return [];
      }
    })());
  }
  return ninjaCache.get(key);
};
export async function ninjaIcons(league, types) {
  const icons = new Map();
  for (const pairs of await Promise.all(types.map((t) => ninjaLines(league, t)))) for (const [name, icon] of pairs) icons.set(name, icon);
  return icons;
}
