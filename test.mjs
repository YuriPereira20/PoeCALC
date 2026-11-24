import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calc, preFights, withPre } from './public/calc.js';
import { summarize, CHAOS, DIVINE } from './extras/_exchange.mjs';

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

console.log(`ok ${strategies.length} estratégias`);
