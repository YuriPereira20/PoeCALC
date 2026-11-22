import { mkdir, writeFile } from 'node:fs/promises';

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const LEAGUE = 'Covens';
const SLUGS = ['bosses', 'divination-card', 'stacked-deck', 'three-to-one', 'gamble', 'incursion', 'invitation', 'sanctum', 'vendor-recipes'];

const trpc = async (proc, json) => {
  const u = `https://poe.how/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({0:{json}}))}`;
  const j = JSON.parse(await (await fetch(u,{headers:UA})).text())[0];
  if (!j.result) throw new Error(proc+': '+JSON.stringify(j.error).slice(0,300));
  return j.result.data.json;
};

// one icon url per item, not per line; divination cards are collected so they can share one icon
const icons = {}, cards = new Set();
const abs = (u) => (u.startsWith('/') ? `https://poe.how${u}` : u);
const noteIcon = (r) => {
  if (!r.item) return;
  if (r.item.category === 'DivinationCard') cards.add(r.itemDetailsId);
  if (r.item.icon && !icons[r.itemDetailsId]) icons[r.itemDetailsId] = abs(r.item.icon);
};

// slim shape used by the app (see calc.js)
const slim = (s, S, category) => {
  const fixed = !!S.strategy?.fixedResult;
  const rates = S.dropRateStats ?? {};
  for (const c of S.requirementCosts ?? []) noteIcon(c.requirement);
  for (const v of S.rewardValues ?? []) noteIcon(v.reward);
  return {
    id: s.id,
    slug: s.name,
    title: s.title,
    img: s.image || null,
    category,
    fixed,
    versions: S.gameVersion || '',
    runs: S.userDataStats?.totalRuns || 0,
    contributors: S.userDataStats?.userResultsCount || 0,
    how: { cost: S.totalCost, ev: S.expectedValue, profit: S.profit },
    req: (S.requirementCosts ?? []).map((c) => {
      const r = c.requirement;
      return { item: r.itemDetailsId, name: r.item?.name ?? '', amount: r.amount, price: r.amount ? c.cost / r.amount : 0, conf: c.confidenceLevel, cheapest: !!c.includedInCheapestSet };
    }),
    rew: (S.rewardValues ?? []).map((v) => {
      const r = v.reward;
      return { item: r.itemDetailsId, name: r.item?.name ?? '', amount: r.amount, price: r.amount ? v.value / r.amount : 0, conf: v.confidenceLevel, group: r.exclusiveGroup ?? null, rate: rates[r.id] ?? (fixed ? 1 : 0) };
    }),
  };
};

const main = async () => {
  const categories = [], strategies = [];
  for (const slug of SLUGS) {
    const { strategies: list } = await trpc('strategies.templates.categoryPage', { categorySlug: slug, offset: 0, limit: 250 });
    const data = {};
    for (let i = 0; i < list.length; i += 50) {
      const r = await trpc('strategies.analysis.batchProfit', { strategyIds: list.slice(i, i + 50).map((s) => s.id), league: LEAGUE, exactOnly: true, includeUnverified: false, useSmart: true });
      Object.assign(data, r.data);
    }
    const sc = list.find((s) => s.StrategyCategory)?.StrategyCategory;
    const name = sc ? (sc.header || sc.name || slug) : slug;
    let count = 0;
    for (const s of list) {
      if (!data[s.id]) continue;
      strategies.push(slim(s, data[s.id], slug));
      count++;
    }
    categories.push({ slug, name, count, icon: sc?.icon?.startsWith('/') ? abs(sc.icon) : null });
    console.log(`${slug}: ${count}`);
  }
  // divination cards share one inventory icon: the cards without one take the icon of a card in this run that has one
  const cardIcon = [...cards].map((id) => icons[id]).find(Boolean);
  if (cardIcon) for (const id of cards) icons[id] ??= cardIcon;
  await mkdir(new URL('data/', import.meta.url), { recursive: true });
  await writeFile(new URL('data/strategies.json', import.meta.url), JSON.stringify({ syncedAt: new Date().toISOString(), league: LEAGUE, categories, strategies, icons }));
  console.log(`total: ${strategies.length}`);
};

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
