import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'var'); // same rule as server.mjs
const SOURCE = 'https://poe.ninja/poe1/api/data/build-index-state';

// the 4 leagues of a season, named as poe.ninja names them
export const family = (season) => [season, 'Hardcore ' + season, 'SSF ' + season, 'HC SSF ' + season];
// one file per league: { 'YYYY-MM-DD': { total, top } }; the main league keeps the file name the server always used
const fileOf = (league) => join(DATA_DIR, `meta-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
const readDays = (league) => readFile(fileOf(league), 'utf8').then(JSON.parse, (e) => { if (e.code !== 'ENOENT') throw e; return {}; });

// queued, so the server timer and a page opened at the same moment never both fetch or write
let queue = Promise.resolve();
export const buildDays = (season) => (queue = queue.catch(() => {}).then(() => update(season)));

// one request a day (UTC), made only when the season has no snapshot of today. A failed request is an error only
// when the season has no snapshot at all; otherwise the files on disk are the answer.
const update = async (season) => {
  const leagues = family(season), today = new Date().toISOString().slice(0, 10);
  const days = Object.fromEntries(await Promise.all(leagues.map(async (L) => [L, await readDays(L)])));
  if (!days[season][today]) {
    try {
      const r = await fetch(SOURCE, { headers: { 'user-agent': 'poe-profit-calculator/1.0' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { leagueBuilds = [] } = await r.json();
      await mkdir(DATA_DIR, { recursive: true });
      for (const { leagueName, total, statistics } of leagueBuilds) {
        if (!leagues.includes(leagueName) || !statistics?.length || days[leagueName][today]) continue;
        days[leagueName][today] = { total, top: statistics.map(({ class: c, skill, percentage, trend }) => ({ class: c, skill, percentage, trend })) };
        // a temp file and a rename, like the history: a crash mid-write never leaves a broken file
        await writeFile(`${fileOf(leagueName)}.tmp`, JSON.stringify(days[leagueName]));
        await rename(`${fileOf(leagueName)}.tmp`, fileOf(leagueName));
      }
    } catch (e) {
      if (!Object.keys(days[season]).length) throw e;
    }
  }
  return days;
};
