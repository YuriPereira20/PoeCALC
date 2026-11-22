// Unicas vestigiais: ranking de poe.how/economy/vestigial-uniques (calculado pelo servidor, tRPC external.poeWatch.vestigialRanking).
import { trpc, ninjaIcons } from './_lib.mjs';

export const title = 'Únicas Vestigiais';
export const order = 70;

export async function load(league) {
  const { rows: src = [] } = await trpc('external.poeWatch.vestigialRanking', { leagueId: league });
  const icons = await ninjaIcons(league, ['UniqueArmour']);
  const rows = src.filter(r => r.confident).map(r => { // padrao do site: "Ignore low-confidence prices" ligado
    const c = r.confident, t = c.topOutcome;
    return {
      name: r.uniqueName + (r.variant ? ` (${r.variant})` : ''), icon: icons.get(r.uniqueName), slot: r.slot, mod: r.text,
      input: r.inputPrice, crystal: r.crystalPrice, cost: (r.inputPrice ?? 0) + (r.crystalPrice ?? 0),
      ev: c.expectedValue, profit: c.profit, odds: c.pricedChance == null ? null : 100 * c.pricedChance,
      best: t ? `${t.uniqueName} (${(100 * t.chance).toFixed(1)}%)` : null, bestValue: t?.chaos ?? null,
      rawEv: r.expectedValue,
    };
  }).sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  return {
    note: 'Enshroud de uma única: vira outra única aleatória do mesmo slot mantendo o modificador. EV, lucro (EV - única - cristal) e chances calculados pelo poe.how (odds de amostra da comunidade a 3 Variant Rarity). Como no site, só entram resultados com preço confiável e entradas sem nenhum resultado confiável ficam de fora; "EV bruto" inclui preços de baixa confiança. Ligas Hardcore costumam ficar vazias (nenhum preço confiável).',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Única', type: 'text' },
      { key: 'slot', label: 'Slot', type: 'text' },
      { key: 'mod', label: 'Modificador mantido', type: 'text' },
      { key: 'input', label: 'Preço única', type: 'chaos' },
      { key: 'crystal', label: 'Cristal', type: 'chaos' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'ev', label: 'EV', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'odds', label: 'Chance precificada', type: 'pct' },
      { key: 'best', label: 'Melhor resultado (chance)', type: 'text' },
      { key: 'bestValue', label: 'Valor melhor', type: 'chaos' },
      { key: 'rawEv', label: 'EV bruto', type: 'chaos' },
    ],
    rows: rows.slice(0, 5000),
  };
}
