import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './_lib.mjs';

export const title = 'Meta de builds';
export const order = 2;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'var'); // same rule as server.mjs
const SOURCE = 'https://poe.ninja/poe1/api/data/build-index-state';
const buildName = (s) => `${s.class} · ${s.skill}`;

// files: the daily snapshots of the league written by server.mjs, { 'YYYY-MM-DD': { total, top } }.
// The change is measured from the oldest day; it is null when that day is today or the build was not in its top 10.
export function rowsOf(stats, files, today) {
  const oldest = Object.keys(files).sort()[0];
  const before = oldest && oldest < today ? files[oldest].top : [];
  return stats.map((s) => {
    const was = before.find((t) => buildName(t) === buildName(s));
    return {
      name: buildName(s), pct: s.percentage, tend: s.trend > 0 ? 'Subindo' : s.trend < 0 ? 'Caindo' : 'Estável',
      delta: was ? s.percentage - was.percentage : null,
    };
  });
}

export async function load(league) {
  const j = await getJson(SOURCE);
  const e = j.leagueBuilds?.find((x) => x.leagueName === league);
  if (!e) throw new Error('O poe.ninja não tem builds desta liga');
  const files = await readFile(join(DATA_DIR, `meta-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`), 'utf8').then(JSON.parse, () => ({}));
  const first = Object.keys(files).sort()[0];
  // no file: a league the server does not record (it records only its main one), or the first minute after the first boot
  const since = first ? `Gravamos uma foto por dia desde ${first.split('-').reverse().join('/')}, e a variação aparece conforme os dias passam (em pontos percentuais)` : 'Ainda não há foto diária desta liga (o site grava uma por dia, só da liga principal), então a coluna de variação fica vazia';
  return {
    note: `Builds mais jogadas na liga ${league}: ${e.total.toLocaleString('pt-BR')} personagens contados no poe.ninja, que só mostra as 10 combinações de classe e habilidade mais jogadas. ${since}. Fonte: poe.ninja.`,
    defaultSort: { key: 'pct', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Build', type: 'text', links: false }, // not an item name: no Mercado/Wiki links
      { key: 'pct', label: '% dos personagens', type: 'pct' },
      { key: 'tend', label: 'Tendência no poe.ninja', type: 'text' },
      { key: 'delta', label: 'Variação desde o primeiro registro', type: 'pct' },
    ],
    rows: rowsOf(e.statistics, files, new Date().toISOString().slice(0, 10)),
  };
}
