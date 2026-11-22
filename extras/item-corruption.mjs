import { trpc } from './_lib.mjs';

export const title = 'Item Corruption';
export const order = 40;

export async function load(league) {
  const rows = [];
  let page = 1, last = 1;
  do {
    const r = await trpc('external.poeWatch.itemCorruption', { league, page, pageSize: 50, search: '', includeLowConfidence: false, showAllOutcomes: false, doubleCorrupt: false, optimizeItemLevel: false });
    last = r.totalPages;
    rows.push(...r.items.map((x) => {
      const best = (x.corruptions ?? []).reduce((a, c) => (!a || c.mean > a.mean ? c : a), null);
      return {
        icon: x.item.icon ?? null,
        name: x.item.name ?? null,
        base: x.item.baseType ?? null,
        type: x.item.itemType ?? null,
        cost: x.totalCost ?? null,
        ev: x.expectedValue ?? null,
        profit: x.expectedProfit ?? null,
        chance: x.profitChance == null ? null : x.profitChance * 100,
        runs: x.runsForProfitAtConfidence ?? null,
        best: best ? `${best.name} (${(best.actualChance * 100).toFixed(2)}% → ${Math.round(best.mean)}c)` : null,
      };
    }));
  } while (++page <= last);
  return {
    note: 'Usar Vaal Orb em únicos: valor esperado dos implícitos de corrupção com preço confiável.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'base', label: 'Base', type: 'text' },
      { key: 'type', label: 'Tipo', type: 'text' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'ev', label: 'Esperado', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'chance', label: 'Chance de lucro', type: 'pct' },
      { key: 'runs', label: 'Runs p/ 80%', type: 'int' },
      { key: 'best', label: 'Melhor resultado', type: 'text' },
    ],
    rows,
  };
}
