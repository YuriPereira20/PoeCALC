// Gemas: imbuir com Soul Core. Igual a poe.how/economy/gem/gem-imbuing com os filtros padrao
// (esconde baixa confianca e jackpots, >= 1 resultado precificado). O "Safe EV" ja vem calculado do servidor.
import { loadTab, price, conf, kind } from './_gems.mjs';

export const title = 'Gemas: Imbuir (Soul Core)';
export const order = 84;
const CORE = { intelligence: 'Soul Core of Intellect', strength: 'Soul Core of Might', dexterity: 'Soul Core of Finesse', any: 'Soul Core of Instability' };

export async function load(league) {
  const { records, supplementaryPrices: sp } = await loadTab('gem-imbuing');
  const rows = [];
  for (const r of records) {
    const gem = price(r.leveledGem, league);
    if (gem == null) continue;
    for (const attr of Object.keys(CORE)) {
      const a = r.coinOutcomes?.[attr];
      if (!a || a.outcomeCount <= 0) continue;
      const coinSlot = sp.coins?.[attr], coin = price(coinSlot, league);
      const cost = coin == null ? null : gem + coin;
      const priced = a.pricedOutcomeCount?.[league] ?? 0;
      const safeEv = a.safeExpectedValue?.[league] ?? null;
      const trusted = a.trustedPricedOutcomeCount?.[league] ?? (safeEv != null ? priced : 0);
      const low = conf(r.leveledGem, league) === 'low' || conf(coinSlot, league) === 'low' ||
        a.bestOutcomeConfidence?.[league] === 'low' || (priced > 0 && trusted === 0) ||
        (a.outcomes ?? []).some(o => o.pricing?.[league]?.confidence === 'low');
      if (low || priced < 1 || a.jackpotSkewed?.[league]) continue; // filtros padrao do site
      const profit = safeEv != null && cost != null ? safeEv - cost : null;
      rows.push({
        name: r.name, kind: kind(r), core: CORE[attr], gem, coin, cost,
        coverage: Math.round(100 * priced / a.outcomeCount),
        ev: a.expectedValue?.[league] ?? null, safeEv, profit,
        roi: profit != null && cost > 0 ? 100 * profit / cost : null,
        best: a.bestOutcomeName?.[league] ?? null, bestValue: a.bestValue?.[league] ?? null,
      });
    }
  }
  rows.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  return {
    note: 'Gema nivel 20 + Soul Core (Might=FOR, Finesse=DES, Intellect=INT, Instability=qualquer). Safe EV calculado pelo poe.how (media com teto contra outliers; ~1/3 de efeito ruim vale 0). Lucro = Safe EV - (gema + Soul Core). Filtros padrao do site: sem precos de baixa confianca, sem EV distorcido por jackpot, >= 1 resultado precificado. Sem precos para a liga Hardcore.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'core', label: 'Soul Core', type: 'text' },
      { key: 'gem', label: 'Gema nv20', type: 'chaos' },
      { key: 'coin', label: 'Soul Core', type: 'chaos' },
      { key: 'cost', label: 'Custo total', type: 'chaos' },
      { key: 'coverage', label: 'Cobertura', type: 'pct' },
      { key: 'safeEv', label: 'Safe EV', type: 'chaos' },
      { key: 'ev', label: 'EV bruto', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'best', label: 'Melhor resultado', type: 'text' },
      { key: 'bestValue', label: 'Valor melhor', type: 'chaos' },
    ],
    rows: rows.slice(0, 5000),
  };
}
