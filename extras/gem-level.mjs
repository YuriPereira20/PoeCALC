// Gemas: upar gema. Igual a poe.how/economy/gem/level: lucro = preco nivelada - preco nivel 1 (vendor = 1c).
import { loadTab, price, conf, kind } from './_gems.mjs';

export const title = 'Gemas: Upar gema';
export const order = 80;
// XP base para chegar ao nivel-alvo, como no site (U por gemClass)
const XP = { normal: 0x14612deb, exceptional: 0x727c8335, prime: 0x634dd4d1, awakened: 0x727c8335, awakenedExceptional: 0x727c8335, awakenedPrime: 0x727c8335, transfigured: 0x14612deb };

export async function load(league) {
  const { records } = await loadTab('level');
  const rows = [];
  for (const r of records) {
    const buy = price(r.baseGem, league), sell = price(r.leveledGem, league);
    if (buy == null || sell == null) continue; // o site so lista gemas com compra e venda conhecidas
    const profit = sell - buy, xp = XP[r.metadata?.gemClass] ?? null;
    rows.push({
      name: r.name, kind: kind(r), target: r.leveledGem.matchingDetailsId ?? null,
      buy, vendor: r.baseGem.isVendor ? 'sim' : '', sell, profit,
      roi: buy > 0 ? 100 * profit / buy : null,
      perXp: xp ? profit / xp * 1e8 : null,
      conf: [conf(r.baseGem, league), conf(r.leveledGem, league)].includes('low') ? 'baixa' : 'ok',
    });
  }
  rows.sort((a, b) => b.profit - a.profit);
  return {
    note: 'Compra a gema nivel 1 (vendor conta 1c), upa ate o nivel-alvo e vende. Lucro = venda - compra. Mesmo calculo de poe.how. Sem precos para a liga Hardcore (o site so tem Covens, Hardcore Covens e Standard).',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'target', label: 'Alvo', type: 'text' },
      { key: 'buy', label: 'Compra nv1', type: 'chaos' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'sell', label: 'Venda', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'perXp', label: 'Lucro / 100M XP', type: 'chaos' },
      { key: 'conf', label: 'Confianca', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
