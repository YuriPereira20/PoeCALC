import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BELT_IDS, BELT_ICON } from '../custom.mjs';
import { backtest, confidence, dayOf, forecast, liveCheck, sinal } from '../forecast.mjs';
import { sparkPrices } from '../prices.mjs';

export const title = 'Previsão de preços';
export const order = 0;
export const group = 'Mercado';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pct = (x) => (x == null ? '-' : `${Math.round(100 * x)}%`);

export async function load(league) {
  const day = dayOf(league);
  if (day === null) throw new Error('Previsão só para as ligas da temporada');
  const [all, base, cache] = await Promise.all([
    readFile(join(ROOT, 'data', 'history.json'), 'utf8').then(JSON.parse, () => { throw new Error('Histórico não importado'); }),
    readFile(join(ROOT, 'data', 'strategies.json'), 'utf8').then(JSON.parse, () => ({ strategies: [] })),
    readFile(join(ROOT, 'data', `prices-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`), 'utf8').then(JSON.parse, () => { throw new Error('Sem preços desta liga ainda: clique em Atualizar preços'); }),
  ]);
  const names = new Map(base.strategies.flatMap((s) => [...s.req, ...s.rew]).map((l) => [l.item, l.name]));
  // accuracy of the forecast against "the price stays", tested on the past leagues from today's league day
  const bt = [7, 14, 30].map((h) => [h, backtest(all.items, day, h)]);
  const bins = bt[2][1].bins; // hit rate of each kind of forecast over 30 days, for the confidence column
  // a week ago's price of each item: its sparkline scaled to today's price, so the change in the last 7 days is real
  const then = {};
  for (const [id, s] of Object.entries(cache.spark ?? {})) { const p = sparkPrices(cache.prices?.[id], s)?.[0]; if (p > 0) then[id] = p; }
  // the same forecast run on this league from a week ago: the backtest above never saw it
  const lc = day >= 6 ? liveCheck(all.items, then, cache.prices, day - 6, day) : null;
  let live = '';
  if (lc?.n >= 30) {
    live = `Conferência na própria liga ${league}, que o teste não conhecia: partindo dos preços de cerca de uma semana atrás, a previsão errou ${pct(lc.model)} no preço de hoje (supondo que o preço não muda: ${pct(lc.naive)}), em ${lc.n.toLocaleString('pt-BR')} itens.`;
    if (lc.strong.n >= 10) live += ` Onde todas as ligas passadas concordavam, a direção se confirmou em ${pct(lc.strong.hit)} de ${lc.strong.n.toLocaleString('pt-BR')} itens.`;
  }
  const rows = [];
  for (const [id, byLeague] of Object.entries(all.items)) {
    const now = cache.prices?.[id];
    if (!(now >= 1)) continue; // under 1 c a rounding step is already a huge percentage; the backtest leaves those out too
    const series = Object.values(byLeague), f30 = forecast(series, day + 30, day, now);
    if (!f30) continue;
    const f7 = forecast(series, day + 7, day, now), f14 = forecast(series, day + 14, day, now);
    const k = confidence(f30, bins); // how often this kind of forecast got the direction right in the past leagues
    rows.push({
      id, name: names.get(id) ?? id, icon: base.icons?.[id] ?? (BELT_IDS.includes(id) ? BELT_ICON : null), href: `#/h/${encodeURIComponent(id)}`,
      now, sem: then[id] ? 100 * (now / then[id] - 1) : null, d7: f7?.mid ?? null, d14: f14?.mid ?? null, d30: f30.mid, chg: 100 * (f30.mid / now - 1), sinal: sinal(f30), conf: k ? 100 * k.hit : null, ligas: f30.n,
    });
  }
  const acc = bt.map(([h, b]) => `${h} dias, ${pct(b.model)} (supondo que o preço não muda: ${pct(b.naive)})`);
  const strong = bt[2][1].strong;
  const perde = bt.filter(([, b]) => b.model > b.naive).map(([h]) => h);
  const note = [
    `Dia ${day + 1} da liga ${league}. A previsão pega o preço de hoje e aplica metade do movimento que o item costuma fazer nas ligas passadas (${Object.keys(all.leagues).join(', ')}) entre o dia de hoje e a data-alvo.`,
    strong.hit == null ? '' : `O sinal vale mais que o número: quando o item foi para o mesmo lado em todas as ligas, a direção se repetiu em ${pct(strong.hit)} dos ${strong.n.toLocaleString('pt-BR')} casos testados (prazo de 30 dias).`,
    live,
    'A confiança é a parcela das previsões do mesmo tipo (mesmo acordo entre as ligas passadas e movimento de tamanho parecido) que acertou a direção nas ligas passadas, medida a partir de hoje para 30 dias à frente; abaixo de 60% é quase cara ou coroa.',
    `Erro típico medido nessas ligas, partindo do dia ${day + 1}: ${acc.join('; ')}.`,
    perde.length ? `No prazo de ${perde.join(' e ')} dias, supor que o preço não muda errou menos que a previsão.` : '',
    'Cartas, scarabs, essências e óleos só têm dados até 07/05/2026 na fonte (dumps do poe.ninja, CC BY-SA). A quantidade de anúncios começou a ser gravada agora e ainda não entra na conta.',
  ].filter(Boolean).join(' ');
  // biggest expected change first: the page's default sort by confidence is stable, so this order holds inside a tie
  rows.sort((a, b) => b.chg - a.chg);
  return {
    note,
    defaultSort: { key: 'conf', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'now', label: 'Hoje', type: 'chaos' },
      { key: 'sem', label: 'Últimos 7 dias (real)', type: 'pct' },
      { key: 'd7', label: '+7 dias', type: 'chaos' },
      { key: 'd14', label: '+14 dias', type: 'chaos' },
      { key: 'd30', label: '+30 dias', type: 'chaos' },
      { key: 'chg', label: 'Variação em 30 dias', type: 'pct' },
      { key: 'sinal', label: 'Sinal das ligas passadas', type: 'text' },
      { key: 'conf', label: 'Confiança (acerto no teste)', type: 'pct' },
      { key: 'ligas', label: 'Ligas', type: 'int' },
    ],
    rows,
  };
}
