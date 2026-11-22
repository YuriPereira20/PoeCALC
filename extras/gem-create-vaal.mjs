// Gemas: criar Vaal. Igual a poe.how/economy/gem/create-vaal: lucro = 25% x Vaal nv1 - (gema nv1 + Vaal Orb).
import { loadTab, price, conf, kind } from './_gems.mjs';

export const title = 'Gemas: Criar Vaal';
export const order = 81;

export async function load(league) {
  const { records, supplementaryPrices: sp } = await loadTab('create-vaal');
  const orb = price(sp.vaalOrb, league);
  const rows = [];
  if (orb != null) for (const r of records) {
    if (!r.hasVaal || !r.vaalOrbEligible) continue;
    const base = price(r.baseGem, league), vaal = price(r.corruptBaseVaal, league);
    if (base == null || vaal == null) continue;
    const cost = base + orb, ev = 0.25 * vaal, profit = ev - cost;
    rows.push({
      name: r.name, kind: kind(r), base, vendor: r.baseGem.isVendor ? 'sim' : '', orb, vaal, ev, cost, profit,
      roi: cost > 0 ? 100 * profit / cost : null,
      conf: [conf(r.baseGem, league), conf(sp.vaalOrb, league), conf(r.corruptBaseVaal, league)].includes('low') ? 'baixa' : 'ok',
    });
  }
  rows.sort((a, b) => b.profit - a.profit);
  return {
    note: 'Compra a gema nivel 1 (vendor conta 1c) e usa um Vaal Orb. Receita esperada = 25% x preco da versao Vaal nv1; qualquer outro resultado vale 0. Lucro = receita - (gema + Vaal Orb). Mesmo calculo de poe.how. Sem precos para a liga Hardcore.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'base', label: 'Compra nv1', type: 'chaos' },
      { key: 'vendor', label: 'Vendor', type: 'text' },
      { key: 'orb', label: 'Vaal Orb', type: 'chaos' },
      { key: 'vaal', label: 'Versão Vaal', type: 'chaos' },
      { key: 'ev', label: 'Receita esperada', type: 'chaos' },
      { key: 'cost', label: 'Custo total', type: 'chaos' },
      { key: 'profit', label: 'Lucro esperado', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'conf', label: 'Confiança', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
