const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const EXCHANGE = ['Currency', 'Fragment', 'DivinationCard', 'Essence', 'DeliriumOrb', 'Tattoo', 'Runegraft', 'AllflameEmber', 'Astrolabe', 'Oil', 'Fossil', 'Omen', 'Artifact', 'Resonator', 'Scarab'];
const STASH = ['Invitation', 'Beast', 'Map', 'UniqueMap', 'BlightedMap', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueRelic', 'SkillGem', 'ClusterJewel', 'Wombgift', 'Vial'];
const WATCH = ['corpses', 'jewel', 'currency', 'flask', 'accessory', 'map', 'deepwater'];

// shortcut: requests run one by one with a 10s timeout, so a hung network can take minutes; upgrade to parallel fetch if that hurts
const getJson = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// chaos prices and poe.ninja listing counts for the wanted item ids only; a failed request is skipped, never aborts
export async function fetchLivePrices(league, wantedIds) {
  const wanted = new Set(wantedIds);
  wanted.add('divine-orb');
  const prices = {}, counts = {};
  // a count is kept only together with the price of the same line (exchange lines have no count)
  const put = (id, v, n) => { if (wanted.has(id) && !(id in prices) && Number.isFinite(v)) { prices[id] = v; if (n != null) counts[id] = n; } };
  const warn = (what, e) => console.warn(`preço ignorado (${what}): ${e.message}`);
  const lg = encodeURIComponent(league);

  for (const t of EXCHANGE) {
    try {
      const j = await getJson(`https://poe.ninja/poe1/api/economy/exchange/current/overview?league=${lg}&type=${t}`);
      const detailOf = new Map(j.items.map((i) => [i.id, i.detailsId]));
      for (const l of j.lines) put(detailOf.get(l.id), l.primaryValue);
    } catch (e) { warn(t, e); }
  }
  const uniqueMaps = new Map();
  for (const t of STASH) {
    try {
      const j = await getJson(`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${lg}&type=${t}`);
      for (const l of j.lines) {
        put(l.detailsId, l.chaosValue, l.listingCount);
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
  return { prices, counts };
}
