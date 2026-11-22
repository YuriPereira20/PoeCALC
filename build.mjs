// GitHub Pages copy: runs server.mjs on port 3299 and saves its JSON as static files under dist/
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const api = join(dist, 'api');
const BASE = 'http://localhost:3299';
const LEAGUES = ['Covens', 'Hardcore Covens', 'Standard', 'Hardcore'];
const lgFile = (lg) => lg.replace(/[^a-zA-Z0-9]/g, '_');

const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: '3299' }, stdio: 'inherit' });
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await fetch(`${BASE}/api/extras`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error('server.mjs did not answer on port 3299 within 20 s');

  await rm(dist, { recursive: true, force: true });
  await cp(join(root, 'public'), dist, { recursive: true });
  await mkdir(api, { recursive: true });
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  if (!html.includes('const STATIC = false;')) throw new Error('const STATIC = false; not found in public/index.html');
  await writeFile(join(dist, 'index.html'), html.replace('const STATIC = false;', 'const STATIC = true;'));

  const extrasText = await (await fetch(`${BASE}/api/extras`)).text();
  await writeFile(join(api, 'extras.json'), extrasText);
  const slugs = JSON.parse(extrasText).map((x) => x.slug);

  // returns the body on HTTP 200; otherwise prints one FAIL line and returns null
  const get = async (path, lg, what) => {
    try {
      const r = await fetch(BASE + path, { signal: AbortSignal.timeout(120000) });
      if (r.status === 200) return await r.text();
      console.log(`FAIL ${lg} ${what} ${r.status}`);
    } catch (e) {
      console.log(`FAIL ${lg} ${what} ${e.message}`);
    }
    return null;
  };

  for (const lg of LEAGUES) {
    const enc = encodeURIComponent(lg);
    const data = await get(`/api/data?league=${enc}&refresh=1`, lg, 'data');
    if (data !== null) await writeFile(join(api, `data-${lgFile(lg)}.json`), data);
    let ok = 0, stale = 0, failed = 0;
    for (const slug of slugs) {
      const body = await get(`/api/extra/${slug}?league=${enc}&refresh=1`, lg, `extra/${slug}`);
      if (body === null) { failed++; continue; }
      await writeFile(join(api, `extra-${slug}-${lgFile(lg)}.json`), body);
      if (JSON.parse(body).stale === true) stale++; else ok++;
    }
    const d = data && JSON.parse(data);
    console.log(`${lg}: pricesAt=${d?.pricesAt ?? '-'} live=${Object.keys(d?.live ?? {}).length} extras ok=${ok} stale=${stale} failed=${failed}`);
  }

  const covens = await readFile(join(api, 'data-Covens.json'), 'utf8').then(JSON.parse, () => null);
  if (!covens?.strategies?.length) throw new Error('dist/api/data-Covens.json was not written or has zero strategies');
} finally {
  child.kill();
}
