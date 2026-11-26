// Gemas: Awakened ate nivel 5 via beastcraft. Igual a poe.how/economy/gem/awakened-leveling:
// lucro = preco nv5 - (gema nv1 + N x Wild Brambleback).
import { loadTab, price, conf } from './_gems.mjs';
import { ninjaIcons } from './_lib.mjs';

export const title = 'Gemas: Awakened via Beast';
export const order = 85;
export const group = 'Gemas';

export async function load(league) {
  const { records } = await loadTab('awakened-leveling');
  const icons = await ninjaIcons(league, ['SkillGem']);
  const rows = [];
  for (const r of records) {
    const b = r.awakenedBeastcraft;
    if (!b || !['awakened', 'awakenedExceptional', 'awakenedPrime'].includes(r.metadata?.gemClass)) continue;
    const base = price(r.baseGem, league), unit = price(b.beastPrice, league), sell = price(r.leveledGem, league);
    const beasts = unit == null ? null : unit * (b.beastCount ?? 0);
    const cost = base == null || beasts == null ? null : base + beasts;
    if (cost == null || sell == null) continue; // site so lista quem tem custo e venda
    const profit = sell - cost;
    rows.push({
      name: r.name, icon: icons.get(r.name), base, beasts, beastInfo: `${b.beastCount}x ${b.beastDetailsId} @ ${unit}c`, cost, sell, profit,
      roi: cost > 0 ? 100 * profit / cost : null,
      conf: [conf(r.baseGem, league), conf(b.beastPrice, league), conf(r.leveledGem, league)].includes('low') ? 'baixa' : 'ok',
    });
  }
  rows.sort((a, b) => b.profit - a.profit);
  return {
    note: 'Compra a Awakened nível 1 e usa beastcraft (4 Wild Brambleback) para levá-la ao nível 5. Lucro = venda nv5 - (gema nv1 + bestas). Mesmo cálculo de poe.how. Sem preços para a liga Hardcore.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'base', label: 'Compra nv1', type: 'chaos' },
      { key: 'beasts', label: 'Bestas', type: 'chaos' },
      { key: 'beastInfo', label: 'Beastcraft', type: 'text' },
      { key: 'cost', label: 'Custo total', type: 'chaos' },
      { key: 'sell', label: 'Venda nv5', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'conf', label: 'Confiança', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
