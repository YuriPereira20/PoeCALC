import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BELT_IDS, BELT_ICON } from '../custom.mjs';
import { STARTS, W, exact, forecast, sinal } from '../forecast.mjs';

export const title = 'Início de liga: primeiras horas e dias';
export const order = 1;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// [index, key, label]: index 2 is the third hour (or day) of a league
const HOURLY = [[2, 'h3', '3 h'], [5, 'h6', '6 h'], [11, 'h12', '12 h'], [23, 'h24', '24 h']];
const DAILY = [[0, 'd1', 'Dia 1'], [1, 'd2', 'Dia 2'], [2, 'd3', 'Dia 3'], [3, 'd4', 'Dia 4'], [4, 'd5', 'Dia 5'], [5, 'd6', 'Dia 6'], [6, 'd7', 'Dia 7'], [13, 'd14', 'Dia 14']];

const columns = [
  { key: 'name', label: 'Item', type: 'text' },
  ...[...HOURLY, ...DAILY].map(([, key, label]) => ({ key, label, type: 'chaos' })),
  { key: 'chg', label: 'Dia 2 → Dia 7', type: 'pct' },
  { key: 'sinal', label: 'Sinal das ligas passadas', type: 'text' },
  { key: 'ligas', label: 'Ligas', type: 'int' },
];

// typical move from day 2 to day 7 in percent, and its wording. The forecast applies half of the median move (W),
// so the median is taken back out by the power of 1 / W. Day 1 is left out as the base: it lasts a few hours and
// its price comes from a handful of listings (a Mirror at 87 c on day 1, 14,700 c on day 2).
export function move17(series) {
  const f = forecast(series, 6, 1, 1, exact);
  return { chg: f ? 100 * (f.mid ** (1 / W) - 1) : null, sinal: f ? sinal(f) : 'Sem padrão' };
}

export async function load() {
  const [all, hours, base] = await Promise.all([
    readFile(join(ROOT, 'data', 'history.json'), 'utf8').then(JSON.parse, () => { throw new Error('Histórico não importado'); }),
    readFile(join(ROOT, 'data', 'hours.json'), 'utf8').then(JSON.parse, () => ({ leagues: {}, items: {} })),
    readFile(join(ROOT, 'data', 'strategies.json'), 'utf8').then(JSON.parse, () => ({ strategies: [] })),
  ]);
  const names = new Map(base.strategies.flatMap((s) => [...s.req, ...s.rew]).map((l) => [l.item, l.name]));
  // the running leagues are left out: their hours are not a past start
  const hourly = (id) => Object.entries(hours.items[id] ?? {}).filter(([L]) => !STARTS[L]).map(([, s]) => s);
  const rows = [];
  for (const id of new Set([...Object.keys(all.items), ...Object.keys(hours.items)])) {
    const daily = Object.values(all.items[id] ?? {}), hrs = hourly(id);
    // leagues that have this item in their first week, by day or by hour
    const ligas = Math.max(daily.filter((s) => s.slice(0, 7).some((v) => v > 0)).length, hrs.length);
    const row = { id, name: names.get(id) ?? id, icon: base.icons?.[id] ?? (BELT_IDS.includes(id) ? BELT_ICON : null), href: `#/h/${encodeURIComponent(id)}`, ligas, ...move17(daily) };
    for (const [i, key] of HOURLY) row[key] = forecast(hrs, i, null, null, exact)?.mid ?? null;
    for (const [i, key] of DAILY) row[key] = forecast(daily, i, null, null, exact)?.mid ?? null;
    if ([...HOURLY, ...DAILY].some(([, key]) => row[key] != null)) rows.push(row);
  }
  const dailyLeagues = Object.keys(all.leagues), hourLeagues = Object.keys(hours.leagues).filter((L) => !STARTS[L]);
  const note = [
    `Preços típicos das ligas passadas, em chaos: a mediana entre as ligas. Ligas com dados diários: ${dailyLeagues.join(', ')}. Ligas com dados por hora: ${hourLeagues.join(', ') || 'nenhuma'}.`,
    'As horas existem só para itens negociados na Bolsa de Moedas (dados oficiais da GGG) e são contadas a partir da hora em que a liga abriu. Dia 1 é o primeiro dia de calendário da liga (UTC), que dura só algumas horas e tem poucos anúncios; por isso a variação da semana parte do dia 2.',
    'Preços em chaos não são comparáveis de uma liga para outra, porque o próprio chaos muda de valor: leia mais o formato (quão rápido cai ou sobe) do que o número.',
    'Fontes: dumps de dados do poe.ninja (CC BY-SA) e API da Bolsa de Moedas da GGG.',
  ].join(' ');
  return { note, defaultSort: { key: 'd2', dir: 'desc' }, columns, rows };
}
