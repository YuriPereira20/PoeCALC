import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BELT_IDS, BELT_ICON } from '../custom.mjs';
import { backtest, dayOf, forecast } from '../forecast.mjs';

export const title = 'Previsão de preços';
export const order = 0;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pct = (x) => (x == null ? '-' : `${Math.round(100 * x)}%`);
// the +30 forecast's trend in words (the item page uses the same wording)
const sinal = ({ trend, n, up, down }) => (trend === 2 ? `Sobe em todas (${n} de ${n})` : trend === 1 ? `Sobe em quase todas (${up} de ${n})` : trend === -2 ? `Cai em todas (${n} de ${n})` : trend === -1 ? `Cai em quase todas (${down} de ${n})` : 'Sem padrão');

export async function load(league) {
  const day = dayOf(league);
  if (day === null) throw new Error('Previsão só para as ligas da temporada');
  const [all, base, cache] = await Promise.all([
    readFile(join(ROOT, 'data', 'history.json'), 'utf8').then(JSON.parse, () => { throw new Error('Histórico não importado'); }),
    readFile(join(ROOT, 'data', 'strategies.json'), 'utf8').then(JSON.parse, () => ({ strategies: [] })),
    readFile(join(ROOT, 'data', `prices-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`), 'utf8').then(JSON.parse, () => { throw new Error('Sem preços desta liga ainda: clique em Atualizar preços'); }),
  ]);
  const names = new Map(base.strategies.flatMap((s) => [...s.req, ...s.rew]).map((l) => [l.item, l.name]));
  const rows = [];
  for (const [id, byLeague] of Object.entries(all.items)) {
    const now = cache.prices?.[id];
    if (!(now >= 1)) continue; // under 1 c a rounding step is already a huge percentage; the backtest leaves those out too
    const series = Object.values(byLeague), f30 = forecast(series, day + 30, day, now);
    if (!f30) continue;
    const f7 = forecast(series, day + 7, day, now), f14 = forecast(series, day + 14, day, now);
    rows.push({
      id, name: names.get(id) ?? id, icon: base.icons?.[id] ?? (BELT_IDS.includes(id) ? BELT_ICON : null), href: `#/h/${encodeURIComponent(id)}`,
      now, d7: f7?.mid ?? null, d14: f14?.mid ?? null, d30: f30.mid, chg: 100 * (f30.mid / now - 1), sinal: sinal(f30), ligas: f30.n,
    });
  }
  // accuracy of the forecast against "the price stays", tested on the past leagues from today's league day
  const bt = [7, 14, 30].map((h) => [h, backtest(all.items, day, h)]);
  const acc = bt.map(([h, b]) => `${h} dias, ${pct(b.model)} (supondo que o preço não muda: ${pct(b.naive)})`);
  const strong = bt[2][1].strong;
  const perde = bt.filter(([, b]) => b.model > b.naive).map(([h]) => h);
  const note = [
    `Dia ${day + 1} da liga ${league}. A previsão pega o preço de hoje e aplica metade do movimento que o item costuma fazer nas ligas passadas (${Object.keys(all.leagues).join(', ')}) entre o dia de hoje e a data-alvo.`,
    strong.hit == null ? '' : `O sinal vale mais que o número: quando o item foi para o mesmo lado em todas as ligas, a direção se repetiu em ${pct(strong.hit)} dos ${strong.n.toLocaleString('pt-BR')} casos testados (prazo de 30 dias).`,
    `Erro típico medido nessas ligas, partindo do dia ${day + 1}: ${acc.join('; ')}.`,
    perde.length ? `No prazo de ${perde.join(' e ')} dias, supor que o preço não muda errou menos que a previsão.` : '',
    'Cartas, scarabs, essências e óleos só têm dados até 07/05/2026 na fonte (dumps do poe.ninja, CC BY-SA). A quantidade de anúncios começou a ser gravada agora e ainda não entra na conta.',
  ].filter(Boolean).join(' ');
  // strongest signal first, and inside each signal the biggest expected change (the page's sort is stable)
  rows.sort((a, b) => b.chg - a.chg);
  return {
    note,
    defaultSort: { key: 'sinal', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'now', label: 'Hoje', type: 'chaos' },
      { key: 'd7', label: '+7 dias', type: 'chaos' },
      { key: 'd14', label: '+14 dias', type: 'chaos' },
      { key: 'd30', label: '+30 dias', type: 'chaos' },
      { key: 'chg', label: 'Variação em 30 dias', type: 'pct' },
      { key: 'sinal', label: 'Sinal das ligas passadas', type: 'text' },
      { key: 'ligas', label: 'Ligas', type: 'int' },
    ],
    rows,
  };
}
