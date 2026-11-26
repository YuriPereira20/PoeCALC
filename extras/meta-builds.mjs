import { STARTS } from '../forecast.mjs';
import { buildDays, family } from './_builds.mjs';

export const title = 'Builds mais fortes';
export const order = 2;
export const group = 'Mercado';

const buildName = (s) => `${s.class} · ${s.skill}`;
const KEYS = ['sc', 'hc', 'ssf', 'hcssf']; // row key of each league of family(season), in that order

// days: { [league]: { 'YYYY-MM-DD': { total, top } } } for the 4 leagues of the season.
// Each league counts from its latest day; the change is the selected league's latest day minus its oldest day.
export function buildRows(days, season, league) {
  const leagues = family(season);
  const dates = (L) => Object.keys(days[L] ?? {}).sort(); // oldest first
  const entry = (L, date, name) => days[L]?.[date]?.top.find((t) => buildName(t) === name);
  const latest = (L, name) => entry(L, dates(L).at(-1), name);
  const names = [...new Set(leagues.flatMap((L) => days[L]?.[dates(L).at(-1)]?.top ?? []).map(buildName))];
  const sel = dates(league), k = KEYS[leagues.indexOf(league)];
  return names.map((name) => {
    const pct = leagues.map((L) => latest(L, name)?.percentage ?? null);
    const seen = [league, ...leagues].map((L) => latest(L, name)).find(Boolean); // the selected league first
    const now = entry(league, sel.at(-1), name), was = sel.length > 1 ? entry(league, sel[0], name) : null;
    return {
      name, sc: pct[0], hc: pct[1], ssf: pct[2], hcssf: pct[3], n: pct.filter((p) => p != null).length,
      tend: seen.trend > 0 ? 'Subindo' : seen.trend < 0 ? 'Caindo' : 'Estável',
      delta: now && was ? now.percentage - was.percentage : null,
    };
  }).sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)); // builds missing in the selected league go last
}

export async function load(league) {
  const season = league.replace(/^Hardcore /, '');
  if (!STARTS[league]) throw new Error('Builds só para as ligas da temporada');
  const days = await buildDays(season);
  const counts = family(season).map((L) => {
    const last = Object.keys(days[L]).sort().at(-1);
    return `${L} ${last ? days[L][last].total.toLocaleString('pt-BR') : 'sem dados'}`;
  }).join(', ');
  const first = Object.keys(days[league]).sort()[0];
  const since = first
    ? `Há fotos desta liga desde ${first.split('-').reverse().join('/')}, e a variação aparece conforme os dias passam (em pontos percentuais).`
    : 'Ainda não há fotos desta liga, então a coluna de variação fica vazia.';
  return {
    note: `Builds mais jogadas nas 4 ligas da temporada ${season}. Personagens contados pelo poe.ninja no dia mais recente: ${counts}. O poe.ninja só publica as 10 combinações de classe e habilidade mais jogadas de cada liga e não mede dano, então "forte" aqui quer dizer que a build também está entre as mais jogadas onde a morte é definitiva (Hardcore) e onde não há comércio entre jogadores (SSF). O site grava uma foto por dia, e abrir a página não consulta o poe.ninja de novo quando a foto de hoje já existe. ${since} Fonte: poe.ninja.`,
    defaultSort: { key: 'n', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Build', type: 'text', links: false }, // not an item name: no Mercado/Wiki links
      { key: 'sc', label: 'Liga normal', type: 'pct' },
      { key: 'hc', label: 'Hardcore', type: 'pct' },
      { key: 'ssf', label: 'SSF', type: 'pct' },
      { key: 'hcssf', label: 'Hardcore SSF', type: 'pct' },
      { key: 'n', label: 'Ligas em que está no top 10', type: 'int' },
      { key: 'tend', label: 'Tendência no poe.ninja', type: 'text' },
      { key: 'delta', label: 'Variação desde o primeiro registro', type: 'pct' },
    ],
    rows: buildRows(days, season, league),
  };
}
