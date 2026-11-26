import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calc, preFights, withPre } from './public/calc.js';
import { summarize, CHAOS, DIVINE } from './extras/_exchange.mjs';
import { belt, UNID, BELT_IDS } from './custom.mjs';
import { at, smooth, exact, dayOf, forecast, backtest, sinal, confidence, liveCheck } from './forecast.mjs';
import { sparkPrices } from './prices.mjs';
import { slug, candidateIds } from './import-history.mjs';
import { hourPrices } from './import-hours.mjs';
import { move17 } from './extras/inicio-liga.mjs';
import { buildRows } from './extras/meta-builds.mjs';
import { marketRows } from './extras/mais-vendidos.mjs';
import { tradeRows } from './extras/trocas.mjs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, sign, verify } from './auth.mjs';

const { strategies } = JSON.parse(await readFile(new URL('./data/strategies.json', import.meta.url), 'utf8'));
const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${what}: ${a} != ${b}`);

// every synced strategy: formula reproduces the site's cost and expected value
for (const s of strategies) {
  const c = calc(s);
  near(c.cost, s.how.cost, `custo ${s.id} ${s.slug}`);
  near(c.ev, s.how.ev, `esperado ${s.id} ${s.slug}`);
}

// hand-made strategy: req A 2 x 10 (snapshot) = 20; rewards R1 = 5 x 0.5, R2 = 100 x 0.1
const h = {
  id: 'h', slug: 'teste', title: 'Teste', category: 'x', fixed: false,
  req: [{ item: 'A', name: 'A', amount: 2, price: 10, cheapest: true }],
  rew: [
    { item: 'R1', name: 'R1', amount: 1, price: 5, group: null, rate: 0.5 },
    { item: 'R2', name: 'R2', amount: 1, price: 100, group: null, rate: 0.1 },
  ],
};

let c = calc(h);
assert.equal(c.req[0].source, 'snapshot');
near(c.cost, 20, 'custo snapshot');
near(c.ev, 12.5, 'ev snapshot');
assert.equal(c.runs80, null); // profit -7.5 <= 0

c = calc(h, { A: 20 }); // live beats snapshot
assert.equal(c.req[0].source, 'live');
near(c.cost, 40, 'custo live');

c = calc(h, { A: 20 }, { price: { A: 30 } }); // override beats live
assert.equal(c.req[0].source, 'manual');
near(c.cost, 60, 'custo override');

c = calc(h, {}, { excluded: { 1: true } }); // excluded reward does not count
assert.equal(c.rew[1].excluded, true);
assert.equal(c.rew[1].expected, 0);
near(c.ev, 2.5, 'ev com R2 excluida');

c = calc(h, {}, { price: { A: 1 } }); // profitable: cost 2, ev 12.5
near(c.profit, 10.5, 'lucro');
assert.ok(Number.isInteger(c.runs80) && c.runs80 >= 1, 'runs80 positivo');

assert.equal(c.noPrice, 0);
assert.equal(calc(h, {}, { price: { A: 0 } }).noPrice, 1); // requirement without price is flagged

assert.equal(calc(h).costUnknown, false); // every counted requirement has a price
assert.equal(calc(h, {}, { price: { A: 0 } }).costUnknown, true); // priced 0: cost would be understated
assert.equal(calc({ ...h, req: [] }).costUnknown, true); // no requirement lines at all

// liquidity: X is half of the EV (20 = X 10 + Y 10) and has 3 listings
const half = { ...h, rew: [{ item: 'X', name: 'X', amount: 1, price: 10, group: null, rate: 1 }, { item: 'Y', name: 'Y', amount: 1, price: 10, group: null, rate: 1 }] };
assert.equal(calc(half, {}, {}, { X: 3 }).lowLiq, 1);
assert.equal(calc(half, {}, {}, { X: 50 }).lowLiq, 0);
assert.equal(calc(half).lowLiq, 0);

// invitation paid with A + B: boss B1 (needs A) is part of the cycle, B2 (needs C) is not
const line = (item, rate = 1) => ({ item, name: item, amount: 1, price: 10, cheapest: true, group: null, rate });
const inv = { id: 'i', title: 'Inv', category: 'invitation', fixed: false, req: [line('A'), line('B')], rew: [line('R')] };
const b1 = { id: 'b1', title: 'B1', category: 'bosses', fixed: false, req: [line('A')], rew: [line('S', 0.5)] };
const pool = [inv, b1, { ...b1, id: 'b2', title: 'B2', req: [line('C')] }];
assert.deepEqual(preFights(inv, pool), [b1]);
assert.equal(withPre(b1, pool), b1); // a boss has no earlier fights
c = calc(withPre(inv, pool));
near(c.ev, 15, 'ev do ciclo'); // R 10 + S 10 x 0.5
near(c.cost, 20, 'custo do ciclo'); // the invitation's own requirements, counted once
assert.deepEqual(c.rew.map((l) => l.from), ['Inv', 'B1']);

// Currency Exchange summary over two hours: chaos and divine markets, a junk divine trade, another league
const mk = (league, pair, volume_traded, lowest_ratio, highest_ratio) => ({ league, market_pair: pair, volume_traded, lowest_ratio, highest_ratio });
const ex = summarize([
  { markets: [
    mk('L', [CHAOS, 'X'], { X: 10, [CHAOS]: 100 }, { X: 1, [CHAOS]: 8 }, { X: 1, [CHAOS]: 12 }),
    mk('L', ['X', DIVINE], { X: 1, [DIVINE]: 50 }, { X: 1, [DIVINE]: 50 }, { X: 1, [DIVINE]: 50 }), // junk: the chaos market has more units
    mk('L', [CHAOS, DIVINE], { [CHAOS]: 2000, [DIVINE]: 10 }, {}, {}),
    mk('Standard', [CHAOS, 'Z'], { Z: 5, [CHAOS]: 50 }, { Z: 1, [CHAOS]: 10 }, { Z: 1, [CHAOS]: 10 }),
  ] },
  { markets: [
    mk('L', ['X', CHAOS], { X: 10, [CHAOS]: 120 }, { X: 1, [CHAOS]: 10 }, { X: 1, [CHAOS]: 14 }),
    mk('L', [CHAOS, DIVINE], { [CHAOS]: 2200, [DIVINE]: 10 }, {}, {}),
    mk('L', ['Y', DIVINE], { Y: 4, [DIVINE]: 2 }, { Y: 2, [DIVINE]: 1 }, { Y: 2, [DIVINE]: 1 }),
  ] },
], 'L');
assert.equal(ex.divine, 210);
const X = ex.items.get('X'), Y = ex.items.get('Y');
assert.equal(X.quote, 'chaos');
near(X.price, 11, 'preço X'); near(X.lo, 9, 'compra X'); near(X.hi, 13, 'venda X'); near(X.volume, 110, 'volume X');
assert.equal(X.hours, 2);
assert.equal(Y.quote, 'divine');
near(Y.price, 105, 'preço Y'); near(Y.lo, 105, 'compra Y'); near(Y.hi, 105, 'venda Y'); near(Y.volume, 210, 'volume Y');
assert.equal(Y.hours, 1);
near(ex.items.get(CHAOS).price, 1, 'preço chaos');
near(ex.items.get(DIVINE).price, 210, 'preço divine');
assert.equal(ex.items.has('Z'), false);

// Screams of the Desiccated: a shrine roll's share of the priced listings is its drop chance
assert.equal(BELT_IDS.length, 49);
for (const id of ['screams-of-the-desiccated-diamond', 'screams-of-the-desiccated-echoing-replenishing', 'screams-of-the-desiccated-greater-skeletal-resistance', 'screams-of-the-desiccated-impenetrable-resonating']) assert.ok(BELT_IDS.includes(id), id);
const boss = [{ category: 'bosses', title: 'Boss', versions: '3.30', req: [{ item: 'key', name: 'Key', amount: 1, price: 10, conf: 'high', cheapest: true }], rew: [{ item: UNID, rate: 0.5 }] }];
const shrinePrices = { 'screams-of-the-desiccated-diamond': 1000, 'screams-of-the-desiccated-brutal': 40, 'screams-of-the-desiccated-gloom': 0, 'screams-of-the-desiccated-echoing-replenishing': 900000 };
const shrineCounts = { 'screams-of-the-desiccated-diamond': 10, 'screams-of-the-desiccated-brutal': 30, 'screams-of-the-desiccated-gloom': 50, 'screams-of-the-desiccated-massive': 90, 'screams-of-the-desiccated-echoing-replenishing': 9 };
const bl = belt(boss, shrinePrices, shrineCounts);
assert.equal(bl.ev, 280); // 0.25 x 1000 + 0.75 x 40; unpriced gloom and massive and the 9-listing roll do not count
assert.equal(bl.strategy.runs, 40);
assert.equal(bl.strategy.rew.length, 2);
assert.match(bl.strategy.note, /1 variantes com menos de 10/);
assert.equal(bl.strategy.req[0].amount, 2); // 1 entry / 0.5 drop chance
assert.equal(bl.strategy.category, 'gamble');
const dia = bl.strategy.rew.find((l) => l.item === 'screams-of-the-desiccated-diamond');
assert.equal(dia.from, 'Diamond');
assert.equal(dia.rate, 0.25);
assert.equal(bl.strategy.rew[0].from, 'Brutal');
const two = belt(boss, shrinePrices, { ...shrineCounts, 'screams-of-the-desiccated-echoing-replenishing': 10 }).strategy.rew.at(-1);
assert.equal(two.from, 'Echoing + Replenishing');
assert.equal(two.rate, 0.2);
assert.equal(belt([], shrinePrices, shrineCounts).ev, 280);
assert.equal(belt([], shrinePrices, shrineCounts).strategy, null);
assert.equal(belt(boss, {}, {}).ev, 0);
assert.equal(belt(boss, {}, {}).strategy, null);

// auth: scrypt hashes and signed session tokens
const stored = await hashPassword('senha-certa');
assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
assert.equal(await verifyPassword('senha-certa', stored), true);
assert.equal(await verifyPassword('senha-errada', stored), false);
assert.equal(await verifyPassword('x', 'scrypt$zz$zz'), false); // malformed stored hash
assert.equal(await verifyPassword('x', 'lixo'), false);
const tok = sign('ana', 'segredo', 3600e3);
assert.equal(verify(tok, 'segredo'), 'ana');
assert.equal(verify(tok, 'outro'), null);
const [, exp, sig] = tok.split('.');
assert.equal(verify(tok.replace(`.${exp}.`, `.${Number(exp) + 1}.`), 'segredo'), null); // tampered expiry
assert.equal(verify(`${Buffer.from('bob').toString('base64url')}.${exp}.${sig}`, 'segredo'), null); // changed user part
assert.equal(verify(sign('ana', 'segredo', -1000), 'segredo'), null); // expired
assert.equal(verify('lixo', 'segredo'), null);

// server: login, sessions, admin rules and the login lock, on a fresh data dir
const base = 'http://localhost:3298';
const dir = await mkdtemp(join(tmpdir(), 'poecalc-'));
const adminPw = randomBytes(12).toString('hex');
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  env: { ...process.env, PORT: '3298', HOST: 'localhost', DATA_DIR: dir, ADMIN_USER: 'admin', ADMIN_PASSWORD: adminPw },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const call = (path, { method = 'GET', body, cookie, type = 'application/json' } = {}) => fetch(base + path, {
  method,
  redirect: 'manual',
  headers: { ...(cookie && { cookie }), ...(body !== undefined && { 'content-type': type }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const login = (user, password) => call('/api/login', { method: 'POST', body: { user, password } });
const sidOf = (r) => r.headers.get('set-cookie').split(';')[0];
try {
  for (let i = 0; ; i++) { // wait until the server answers
    try { await call('/login'); break; } catch (e) { if (i === 100) throw e; await new Promise((r) => setTimeout(r, 100)); }
  }
  let r = await call('/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login');
  assert.equal((await call('/api/data')).status, 401);
  assert.equal((await call('/login')).status, 200);
  assert.equal((await login('admin', 'errada')).status, 401);
  r = await login('admin', adminPw);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  const admin = sidOf(r);
  assert.equal((await (await call('/api/me', { cookie: admin })).json()).admin, true);
  assert.deepEqual(Object.keys((await (await call('/api/admin/users', { cookie: admin })).json())[0]).sort(), ['admin', 'createdAt', 'name']); // no hash in the list
  assert.equal((await call('/api/admin/users', { method: 'POST', cookie: admin, body: {}, type: 'text/plain' })).status, 415);
  assert.equal((await call('/api/admin/users', { method: 'POST', cookie: admin, body: { name: 'ana', password: '12345', admin: false } })).status, 400);
  assert.equal((await call('/api/admin/users', { method: 'POST', cookie: admin, body: { name: 'ana', password: 'senha-ana-1', admin: false } })).status, 200);
  r = await login('ana', 'senha-ana-1');
  assert.equal(r.status, 200);
  const ana = sidOf(r);
  assert.equal((await call('/api/admin/users', { cookie: ana })).status, 403);
  assert.equal((await call('/api/admin/users?name=ana', { method: 'DELETE', cookie: admin })).status, 200);
  assert.equal((await call('/api/me', { cookie: ana })).status, 401);
  assert.equal((await call('/api/admin/users?name=admin', { method: 'DELETE', cookie: admin })).status, 400);
  // /api/extras: the menu; every item has a group and n (null or a count), and an unknown league is refused
  const menu = await call('/api/extras?league=Covens', { cookie: admin });
  assert.equal(menu.status, 200);
  const list = await menu.json();
  assert.ok(Array.isArray(list) && list.length > 0 && list.every((x) => x.group && (x.n === null || typeof x.n === 'number')));
  assert.equal((await call('/api/extras?league=Nope', { cookie: admin })).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await login('ghost', 'x')).status, 401);
  assert.equal((await login('ghost', 'x')).status, 429);
} finally {
  child.kill();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
}

// forecast.mjs: the series are chaos prices by day index; the expected values are worked out in the comments
assert.equal(at([0, 5, 7], 2), 7); // exact day
assert.equal(at([null, 5, null], 2), 5); // the day before
assert.equal(at([null, null, null, 4], 2), 4); // the day after
assert.equal(at([1, null, null, null, null, null, null, null, null, null, 1], 5), null); // nothing within 2 days
assert.equal(at([0], 0), null); // a zero is no price
assert.equal(at([0, 6], 0), 6); // ...the next day is

// smooth: the median of the 5 days around d (1 9 2 8 3 sorted is 1 2 3 8 9, middle 3); null and 0 are not prices
assert.equal(smooth([1, 9, 2, 8, 3], 2), 3);
assert.equal(smooth([null, 5, 0, 7, 100], 2), 7); // 5, 7, 100 -> 7
assert.equal(smooth([null, 0, null], 1), null);

// dayOf: day 0 is the start date (UTC); 2026-11-25 is 12 days later; the evening before the start is -1
assert.equal(dayOf('Covens', new Date('2026-11-13T05:00:00Z')), 0);
assert.equal(dayOf('Covens', new Date('2026-11-25')), 12);
assert.equal(dayOf('Covens', new Date('2026-11-12T23:00:00Z')), -1);
assert.equal(dayOf('Standard'), null); // permanent league: no start date

// a league's series is p on days 0-5 and p x r from day 6 on, so the 5-day medians at day 3 (today) and day 9 are p and p x r
const step = (p, r) => [p, p, p, p, p, p, p * r, p * r, p * r, p * r, p * r, p * r];
const TODAY = 3, DAY = 9;
// every league doubles: the median move is ln 2, half of it is applied (mid = 10 x sqrt 2), all 4 up -> trend 2
const doubled = forecast([step(5, 2), step(5, 2), step(5, 2), step(5, 2)], DAY, TODAY, 10);
near(doubled.lo, 10 * Math.SQRT2, 'lo com ancora'); near(doubled.mid, 10 * Math.SQRT2, 'mid com ancora'); near(doubled.hi, 10 * Math.SQRT2, 'hi com ancora');
assert.equal(doubled.n, 4); assert.equal(doubled.up, 4); assert.equal(doubled.trend, 2);
// 3 of 4 up: the median is still ln 2, but only 3 agree -> trend 1
const most = forecast([step(5, 2), step(5, 2), step(5, 2), step(5, 0.5)], DAY, TODAY, 10);
near(most.mid, 10 * Math.SQRT2, 'mid 3 de 4'); assert.equal(most.up, 3); assert.equal(most.trend, 1);
// 2 up, 2 down: the median move is 0, so mid is the price and there is no trend
const split = forecast([step(5, 2), step(5, 2), step(5, 0.5), step(5, 0.5)], DAY, TODAY, 10);
near(split.mid, 10, 'mid misto'); assert.equal(split.trend, 0);
// every league halves: mid = 10 / sqrt 2, below the price, trend -2
const halved = forecast([step(5, 0.5), step(5, 0.5), step(5, 0.5), step(5, 0.5)], DAY, TODAY, 10);
near(halved.mid, 10 / Math.SQRT2, 'mid em queda'); assert.equal(halved.down, 4); assert.equal(halved.trend, -2);
// no anchor: the spread of the day-2 prices 2, 3, 4, 6 -> 25% 2.75, median 3.5, 75% 4.5; no trend
const plain = forecast([[2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4], [6, 6, 6, 6, 6]], 2);
near(plain.lo, 2.75, 'lo sem ancora'); near(plain.mid, 3.5, 'mid sem ancora'); near(plain.hi, 4.5, 'hi sem ancora'); assert.equal(plain.trend, 0);
// 3 usable leagues are needed: 2 are not enough, with or without anchor
assert.equal(forecast([step(5, 2), step(5, 2), Array(12).fill(null)], DAY, TODAY, 10), null);
assert.equal(forecast([[2, 2, 2, 2, 2], [3, 3, 3, 3, 3]], 2), null);
// kind of forecast, bin 0-15 (binOf in forecast.mjs): agreement (3 = all, 2 = 80% or more, 1 = 60% or more) x median move
// (3 = ln 1 or more, 2 = 0.4 to 1, 1 = 0.15 to 0.4, 0 = under 0.15), bin = 4 x agreement + move
// 4 of 4 double: agreement 3, move ln 2 = 0.69 -> 4 x 3 + 2
assert.equal(doubled.bin, 14);
// 4 of 4 triple: move ln 3 = 1.10 -> 4 x 3 + 3
assert.equal(forecast([step(5, 3), step(5, 3), step(5, 3), step(5, 3)], DAY, TODAY, 10).bin, 15);
// 4 of 5 rise 30%, 1 falls 30%: agreement 0.8 -> 2, median move ln 1.3 = 0.26 -> 1: 4 x 2 + 1
assert.equal(forecast([step(5, 1.3), step(5, 1.3), step(5, 1.3), step(5, 1.3), step(5, 0.7)], DAY, TODAY, 10).bin, 9);
// 2 rise 20%, 2 fall 10%: median move (ln 1.2 + ln 0.9) / 2 = 0.04 is under 5%, so no direction
assert.equal(forecast([step(5, 1.2), step(5, 1.2), step(5, 0.9), step(5, 0.9)], DAY, TODAY, 10).bin, null);
// no anchor, so no direction and no bin
assert.ok(forecast([step(5, 2), step(5, 2), step(5, 2)], DAY).bin == null);

// backtest: 5 leagues, each doubling from day 3 to day 6; the held-out one is predicted from the other 4.
// mid 10 x sqrt 2 against the actual 20: error 1 - sqrt(1/2) = 0.293; the naive price 10 against 20: error 0.5.
// The others all rise by ln 2 (trend 2) and the price did rise, so every strong prediction is a hit
const doubled5 = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((L) => [L, step(10, 2)]));
const bt = backtest({ x: doubled5 }, 3, 3);
assert.equal(bt.n, 5);
near(bt.model, 1 - Math.SQRT1_2, 'erro do modelo'); near(bt.naive, 0.5, 'erro do naive');
assert.ok(bt.model < bt.naive);
assert.equal(bt.strong.n, 5); assert.equal(bt.strong.hit, 1);
// bins: all 5 forecasts are kind 14 (4 of 4 agree, move ln 2) and the price rose in all 5; the other kinds are empty
assert.equal(bt.bins[14].n, bt.n); assert.equal(bt.bins[14].hit, 1);
bt.bins.forEach((b, i) => { if (i !== 14) assert.deepEqual(b, { hit: null, n: 0 }); });
// confidence: the kind's { hit, n } only with a direction and at least 30 tested cases
const cb = Array.from({ length: 16 }, () => ({ hit: 0.9, n: 0 }));
assert.equal(confidence(null, cb), null);
assert.equal(confidence({ bin: null }, cb), null);
cb[14] = { hit: 0.9, n: 29 };
assert.equal(confidence({ bin: 14 }, cb), null);
cb[14] = { hit: 0.9, n: 30 };
assert.deepEqual(confidence({ bin: 14 }, cb), { hit: 0.9, n: 30 });

// sparkPrices: 7 daily prices from a sparkline of percent changes, scaled so the last one is today's price
const spark = [10, 2, -5, 0, null, 8, 4];
const sp = sparkPrices(100, spark);
near(sp[6], 100, 'último ponto é o preço de hoje'); near(sp[0], 100 * (100 + 10) / (100 + 4), 'primeiro ponto');
assert.equal(sp[4], null); // a gap in the line stays a gap
assert.equal(sparkPrices(100, [1, 2, 3]), null); assert.equal(sparkPrices(0, spark), null); // not a full week, or no price
// liveCheck: 4 past leagues that all double from day 0 to day 6 (step); X was 10 then and is 20 now, Y was under 1 then
const four = { A: step(5, 2), B: step(5, 2), C: step(5, 2), D: step(5, 2) };
const lc = liveCheck({ X: four, Y: four }, { X: 10, Y: 0.5 }, { X: 20, Y: 1 }, 0, 6);
assert.equal(lc.n, 1); // Y is left out
assert.equal(lc.strong.n, 1); assert.equal(lc.strong.hit, 1);
near(lc.model, 1 - Math.SQRT1_2, 'erro do modelo'); near(lc.naive, 0.5, 'erro do naive');
assert.ok(lc.model < lc.naive);

// import-history.mjs: dump names to tracked ids
assert.equal(slug("The Wolven King's Bite"), 'the-wolven-kings-bite');
assert.equal(candidateIds({ name: 'The Stormheart', base: 'Royal Staff', variant: '', links: '6 links' })[0], 'the-stormheart-royal-staff-6l');
assert.ok(candidateIds({ name: 'Screams of the Desiccated', base: 'Leather Belt', variant: 'Impenetrable, Resonating', links: '' }).includes('screams-of-the-desiccated-impenetrable-resonating'));
assert.ok(candidateIds({ name: 'Hall of Grandmasters', base: 'Map (Tier 6)', variant: '', links: '' }).includes('hall-of-grandmasters-t6'));

// exact: the league's own day only, no neighbours (smooth would read 1 from the spiky days below)
assert.equal(exact([0, 5, 7], 1), 5); assert.equal(exact([0, 5], 0), null); assert.equal(exact([null, 5], 0), null); assert.equal(exact([5], 3), null);
const spiky = [[1, 1, 10, 1, 1], [1, 1, 20, 1, 1], [1, 1, 30, 1, 1]];
near(forecast(spiky, 2, null, null, exact).mid, 20, 'mid exato sem ancora');
assert.equal(forecast(spiky, 2).mid, 1);
// every league halves from day 2 to day 7 (the odd day-1 price is not the base): -50%, all 4 agree (trend -2)
const halved7 = Array.from({ length: 4 }, () => [999, 10, 10, 10, 10, 10, 5]);
const mv = move17(halved7);
near(mv.chg, -50, 'variação do dia 2 ao 7'); assert.equal(mv.sinal, 'Cai em todas (4 de 4)');
assert.deepEqual(move17([]), { chg: null, sinal: 'Sem padrão' });
// meta-builds: each league counts from its latest day; the change is the selected league's latest minus its oldest day
const tp = (...xs) => xs.map(([c, s, p, t]) => ({ class: c, skill: s, percentage: p, trend: t }));
const bd = {
  Covens: { '2026-11-20': { total: 100, top: tp(['Witch', 'Spark', 4, 1]) }, '2026-11-25': { total: 120, top: tp(['Monk', 'Tempest Flurry', 2, -1], ['Witch', 'Spark', 6, 1]) } },
  'Hardcore Covens': { '2026-11-25': { total: 50, top: tp(['Witch', 'Spark', 5, -1]) } },
  'HC SSF Covens': { '2026-11-25': { total: 30, top: tp(['Ranger', 'Arrow', 3, -1]) } },
};
const br = buildRows(bd, 'Covens', 'Covens');
assert.deepEqual(br.map((r) => r.name), ['Witch · Spark', 'Monk · Tempest Flurry', 'Ranger · Arrow']); // by the selected league's %, missing last
assert.deepEqual([br[0].sc, br[0].hc, br[0].ssf, br[0].n, br[0].tend, br[0].delta], [6, 5, null, 2, 'Subindo', 2]); // 2 leagues; trend from the selected one; 6 - 4
assert.deepEqual([br[1].sc, br[1].hc, br[1].n, br[1].delta], [2, null, 1, null]); // no Monk on the oldest day
assert.deepEqual([br[2].sc, br[2].hcssf, br[2].n, br[2].tend], [null, 3, 1, 'Caindo']); // not in Covens: trend from HC SSF
assert.equal(buildRows({ Covens: { '2026-11-25': bd.Covens['2026-11-25'] } }, 'Covens', 'Covens')[0].delta, null); // one day: no change

// mais-vendidos: chaos-orb is the unit, not a row; units = volume / price; shares add up to 100; a link only where there is a page
const mkt = [
  { id: 'chaos-orb', name: 'Chaos Orb', icon: null, type: 'Currency', price: 1, volume: 9000, chg: 0 },
  { id: 'divine-orb', name: 'Divine Orb', icon: 'd.png', type: 'Currency', price: 200, volume: 3000, chg: 1 },
  { id: 'vaal-x', name: 'Vaal X', icon: null, type: 'Fragment', price: 10, volume: 1000, chg: null },
  { id: 'mirror', name: 'Mirror', icon: null, type: 'Weird', price: 100000, volume: 4000, chg: -5 },
];
const mr = marketRows(mkt, (id) => id !== 'vaal-x');
assert.deepEqual(mr.map((r) => r.id), ['divine-orb', 'vaal-x', 'mirror']); // chaos-orb skipped
assert.equal(mr[0].units, 15); // 3000 / 200
near(mr.reduce((s, r) => s + r.share, 0), 100, 'partes do volume');
assert.equal(mr[0].href, '#/h/divine-orb'); assert.equal(mr[1].href, undefined);
assert.deepEqual(mr.map((r) => r.tipo), ['Moeda', 'Fragmento', 'Weird']); // a type without a label stays as it is
// trocas.mjs: one row from each of the three quick trades, from made-up exchange output (tradeRows reads no network)
const tIt = (price, hours, volume) => ({ price, hours, volume });
const tBase = {
  'Metadata/Items/Currency/Mushrune1': { name: 'Oil 1' },
  'Metadata/Items/Currency/Mushrune2': { name: 'Oil 2' },
  'Metadata/Items/Currency/CurrencyPassiveRefund': { name: 'Passive Refund' },
  'Metadata/Items/Currency/CurrencyUpgradeToRare': { name: 'Upgrade to Rare' },
  'Metadata/Items/Fragments/Frag': { name: 'Fragmento', properties: { stack_size: 5, full_stack_turns_into: 'Metadata/Items/Fragments/Whole' } },
  'Metadata/Items/Fragments/Whole': { name: 'Item Inteiro', visual_identity: { dds_file: 'art/whole.dds' } },
};
const tItems = new Map([
  ['Metadata/Items/Currency/Mushrune1', tIt(2, 5, 300)],
  ['Metadata/Items/Currency/Mushrune2', tIt(8, 5, 200)],
  ['Metadata/Items/Currency/CurrencyPassiveRefund', tIt(2, 4, 150)],
  ['Metadata/Items/Currency/CurrencyUpgradeToRare', tIt(3, 4, 120)],
  ['Metadata/Items/Fragments/Frag', tIt(1, 6, 40)],
  ['Metadata/Items/Fragments/Whole', tIt(9, 6, 30)],
]);
const tr = tradeRows({ items: tItems, base: tBase });
assert.deepEqual(tr.map((r) => r.kind), ['3 por 1: Óleo', 'Comprar do vendedor: Clarissa, ato 3', 'Montar fragmentos']);
assert.deepEqual([tr[0].name, tr[0].input, tr[0].cost, tr[0].value, tr[0].profit, tr[0].volume, tr[0].volIn], ['Oil 2', '3× Oil 1', 6, 8, 2, 200, 300]);
assert.deepEqual([tr[1].name, tr[1].input, tr[1].cost, tr[1].profit, tr[1].roi], ['Upgrade to Rare', '1× Passive Refund', 2, 1, 50]);
assert.deepEqual([tr[2].name, tr[2].icon, tr[2].input, tr[2].cost, tr[2].profit, tr[2].volume, tr[2].volIn], ['Item Inteiro', 'https://repoe-fork.github.io/art/whole.png', '5× Fragmento', 5, 4, 30, 40]);
// the trend in words, shared by the calculators and the item page
assert.equal(sinal({ trend: 2, n: 4, up: 4, down: 0 }), 'Sobe em todas (4 de 4)');
assert.equal(sinal({ trend: 1, n: 4, up: 3, down: 1 }), 'Sobe em quase todas (3 de 4)');
assert.equal(sinal({ trend: 0, n: 4, up: 2, down: 2 }), 'Sem padrão');
assert.equal(sinal({ trend: -1, n: 4, up: 1, down: 3 }), 'Cai em quase todas (3 de 4)');
assert.equal(sinal({ trend: -2, n: 4, up: 0, down: 4 }), 'Cai em todas (4 de 4)');
// import-hours.mjs: an hour's markets to the tracked ids in chaos, 3 significant digits; other leagues and untracked items out
const hourMarkets = [
  mk('L', [CHAOS, 'X'], { X: 10, [CHAOS]: 1234.5 }, { X: 1, [CHAOS]: 1234 }, { X: 1, [CHAOS]: 1235 }), // 1234.5 / 10 = 123.45
  mk('Z', [CHAOS, 'X'], { X: 10, [CHAOS]: 5000 }, { X: 1, [CHAOS]: 4999 }, { X: 1, [CHAOS]: 5001 }),
  mk('L', [CHAOS, 'Y'], { Y: 1, [CHAOS]: 50 }, { Y: 1, [CHAOS]: 50 }, { Y: 1, [CHAOS]: 50 }),
];
assert.deepEqual([...hourPrices(hourMarkets, 'L', { X: { name: 'Thing' }, Y: { name: 'Other' } }, new Set(['thing']))], [['thing', 123]]);

console.log(`ok ${strategies.length} estratégias`);
