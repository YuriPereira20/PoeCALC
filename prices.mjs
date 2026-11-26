const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const EXCHANGE = ['Currency', 'Fragment', 'DivinationCard', 'Essence', 'DeliriumOrb', 'Tattoo', 'Runegraft', 'AllflameEmber', 'Astrolabe', 'Oil', 'Fossil', 'Omen', 'Artifact', 'Resonator', 'Scarab'];
const STASH = ['Invitation', 'Beast', 'Map', 'UniqueMap', 'BlightedMap', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueRelic', 'SkillGem', 'ClusterJewel', 'Wombgift', 'Vial', 'ShrineBelt'];
const WATCH = ['corpses', 'jewel', 'currency', 'flask', 'accessory', 'map', 'deepwater'];

// shortcut: requests run one by one with a 10s timeout, so a hung network can take minutes; upgrade to parallel fetch if that hurts
const getJson = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// The 7 daily prices behind a poe.ninja sparkline (7 percent changes against the day before the first point), scaled
// so that the last one is today's price; null without a full line.
// shortcut: the last point may be yesterday's close (checked against the official exchange: the fit is within a day),
// so each price can be one day off; fine for "a week ago" and for a chart, not for exact dates
export const sparkPrices = (now, s) => (now > 0 && s?.length === 7 && s[6] > -100 ? s.map((x) => (x == null ? null : now * (100 + x) / (100 + s[6]))) : null);

// Chaos prices, poe.ninja listing counts and 7-day sparklines for the wanted item ids only, plus `market`: every item
// traded on the Currency Exchange with its volume, wanted or not. The same requests give all of it, so nothing here
// costs an extra call. A failed request is skipped, never aborts.
export async function fetchLivePrices(league, wantedIds) {
  const wanted = new Set(wantedIds);
  wanted.add('divine-orb');
  const prices = {}, counts = {}, spark = {}, market = [], seen = new Set();
  // a count is kept only together with the price of the same line (exchange lines have no count)
  const put = (id, v, n, s) => {
    if (!wanted.has(id) || id in prices || !Number.isFinite(v)) return;
    prices[id] = v;
    if (n != null) counts[id] = n;
    if (s?.data?.length === 7) spark[id] = s.data;
  };
  const warn = (what, e) => console.warn(`preço ignorado (${what}): ${e.message}`);
  const lg = encodeURIComponent(league);

  for (const t of EXCHANGE) {
    try {
      const j = await getJson(`https://poe.ninja/poe1/api/economy/exchange/current/overview?league=${lg}&type=${t}`);
      const itemOf = new Map(j.items.map((i) => [i.id, i]));
      for (const l of j.lines) {
        const it = itemOf.get(l.id);
        put(it?.detailsId, l.primaryValue, null, l.sparkline);
        // volumePrimaryValue = chaos traded per hour on the official exchange (it matched GGG's API to the unit)
        if (!it?.detailsId || seen.has(it.detailsId) || !(l.primaryValue > 0) || !(l.volumePrimaryValue > 0)) continue;
        seen.add(it.detailsId);
        market.push({ id: it.detailsId, name: it.name, icon: it.image ? `https://web.poecdn.com${it.image}` : null, type: t, price: l.primaryValue, volume: l.volumePrimaryValue, chg: l.sparkline?.totalChange ?? null });
      }
    } catch (e) { warn(t, e); }
  }
  const uniqueMaps = new Map();
  for (const t of STASH) {
    try {
      const j = await getJson(`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${lg}&type=${t}`);
      for (const l of j.lines) {
        put(l.detailsId, l.chaosValue, l.listingCount, l.sparkLine);
        if (t === 'UniqueMap') uniqueMaps.set(l.detailsId, l);
      }
    } catch (e) { warn(t, e); }
  }
  // poe.ninja lists unique maps only as tier 0 (cortex-t0), but the strategies ask for cortex-t11 and so on
  for (const id of wanted) {
    const m = /^(.+)-t\d+$/.exec(id);
    if (m) { const u = uniqueMaps.get(`${m[1]}-t0`); put(id, u?.chaosValue, u?.listingCount); }
  }

  const watchIds = [...wanted].filter((id) => /^poewatch-\d+(-|$)/.test(id));
  if (watchIds.length) {
    const byId = new Map();
    for (const c of WATCH) {
      try {
        for (const e of (await getJson(`https://api.poe.watch/get?league=${lg}&category=${c}`)) ?? []) byId.set(e.id, e.mean);
      } catch (e) { warn(`poe.watch ${c}`, e); }
    }
    for (const id of watchIds) put(id, byId.get(Number(id.match(/^poewatch-(\d+)/)[1])));
  }
  return { prices, counts, spark, market };
}
