// Pure calculation (no DOM). Used by the page and by test.mjs.
// ov = { price: {[item]: chaos}, rate: {[rewardIndex]: 0..1}, excluded: {[rewardIndex]: true} } (all optional)
export function calc(s, live = {}, ov = {}, counts = {}) {
  const P = ov.price || {}, R = ov.rate || {}, X = ov.excluded || {};
  // price: manual override > live > snapshot
  const unitOf = (l) => P[l.item] ?? live[l.item] ?? l.price;
  const srcOf = (l) => (P[l.item] != null ? 'manual' : live[l.item] != null ? 'live' : 'snapshot');

  const req = s.req.map((l) => {
    const unit = unitOf(l);
    return { ...l, unit, total: unit * l.amount, source: srcOf(l) };
  });
  const cost = req.reduce((a, l) => a + (l.cheapest === true ? l.total : 0), 0);

  let ev = 0, variance = 0;
  const rew = s.rew.map((l, i) => {
    const unit = unitOf(l), v = unit * l.amount;
    const rate = R[i] ?? l.rate;
    const excluded = !!X[i];
    const expected = excluded ? 0 : v * rate;
    if (!excluded) {
      ev += expected;
      variance += rate * (1 - rate) * v * v;
    }
    return { ...l, unit, rate, excluded, expected, count: counts[l.item], source: srcOf(l) };
  });

  const profit = ev - cost;
  return {
    cost,
    // cost would be understated: a counted requirement has no price, or no requirement is registered
    costUnknown: req.length === 0 || req.some((l) => l.cheapest === true && !(l.unit > 0)),
    ev,
    profit,
    margin: cost > 0 ? (profit / cost) * 100 : null,
    variance,
    runs80: profit > 0 ? Math.max(1, Math.ceil((0.8416212 ** 2 * variance) / profit ** 2)) : null,
    topShare: ev > 0 ? Math.max(...rew.map((l) => l.expected)) / ev : 0,
    noDropData: !s.fixed && rew.every((l) => l.rate === 0),
    snapshotPrices: [...req, ...rew].filter((l) => l.source === 'snapshot').length,
    // lines that count but have no price: cost or value is understated
    noPrice: [...req.filter((l) => l.cheapest === true), ...rew.filter((l) => !l.excluded && l.rate > 0)].filter((l) => !(l.unit > 0)).length,
    // a reward worth >= 20% of the EV with < 10 listings: its price may not hold
    lowLiq: rew.filter((l) => !l.excluded && l.expected > 0 && l.expected >= 0.2 * ev && Number.isFinite(l.count) && l.count < 10).length,
    req,
    rew,
  };
}
