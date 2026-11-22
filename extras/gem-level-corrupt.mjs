// Gemas: corrupcao simples. Igual a poe.how/economy/gem/level-corrupt (as duas tabelas: base 20/0 e base 20/20).
import { loadTab, price, conf, kind } from './_gems.mjs';
import { ninjaIcons } from './_lib.mjs';

export const title = 'Gemas: Corromper (1x)';
export const order = 82;

export async function load(league) {
  const { records, supplementaryPrices: sp } = await loadTab('level-corrupt');
  const icons = await ninjaIcons(league, ['SkillGem']);
  const orb = price(sp.vaalOrb, league);
  const rows = [];
  if (orb != null) for (const r of records) {
    const vaal = r.hasVaal ? price(r.corruptVaal, league) : null;
    for (const [route, baseSlot, outs] of [
      ['20/0', r.leveledGem, [['+1 nível', 0.125, r.corruptLevel]]],
      ['20/20', r.leveledQuality, [['+1 nível', 0.125, r.corruptLevelQ], ['+3 qualidade', 0.125, r.corruptQuality]]],
    ]) {
      const base = price(baseSlot, league);
      if (base == null) continue;
      const mix = outs.map(([l, p, s]) => [l, p, price(s, league)]).filter(o => o[2] != null);
      if (vaal != null) mix.push(['Vaal', 0.25, vaal]);
      if (!mix.length) continue; // site descarta gemas sem nenhum resultado precificado
      const ev = mix.reduce((a, [, p, v]) => a + p * v, 0), cost = base + orb, profit = ev - cost;
      rows.push({
        name: r.name, icon: icons.get(r.name), kind: kind(r), route, base, orb, ev, profit,
        roi: cost > 0 ? 100 * profit / cost : null,
        mix: mix.map(([l, p, v]) => `${l} ${p * 100}%: ${Math.round(v * 10) / 10}c`).join(' | '),
        conf: [conf(baseSlot, league), conf(sp.vaalOrb, league), ...outs.filter(o => price(o[2], league) != null).map(o => conf(o[2], league)), vaal != null ? conf(r.corruptVaal, league) : null].includes('low') ? 'baixa' : 'ok',
      });
    }
  }
  rows.sort((a, b) => b.profit - a.profit);
  return {
    note: 'Um Vaal Orb em gema 20/0 ou 20/20 comprada pronta. EV = 12,5% +1 nível + 12,5% +3 qualidade (só base 20/20) + 25% Vaal (se existir); demais resultados valem 0. Lucro = EV - (gema + Vaal Orb). Mesmo cálculo de poe.how. Sem preços para a liga Hardcore.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'route', label: 'Base', type: 'text' },
      { key: 'base', label: 'Compra', type: 'chaos' },
      { key: 'orb', label: 'Vaal Orb', type: 'chaos' },
      { key: 'ev', label: 'Valor esperado', type: 'chaos' },
      { key: 'profit', label: 'Lucro esperado', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'mix', label: 'Resultados', type: 'text' },
      { key: 'conf', label: 'Confiança', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
