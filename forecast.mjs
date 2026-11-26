// Price forecast from past leagues: how an item's price moved between two league days in each past league, applied to
// today's price. Checked against the past leagues themselves (backtest below): the full typical move predicts worse
// than "the price stays as it is", half of it predicts a little better, and it only really helps when the past
// leagues agree on the direction. So the page shows that agreement next to every number.

// first day of the running leagues; update together with LEAGUES in server.mjs when a league starts
export const STARTS = { Covens: '2026-11-13', 'Hardcore Covens': '2026-11-13' };
// day index (0 = first day) of a date in a league, null for leagues without a start date (the permanent ones)
export const dayOf = (league, date = new Date()) => (STARTS[league] ? Math.floor((date - Date.parse(STARTS[league])) / 864e5) : null);

export const W = 0.5; // share of the past leagues' typical move that is applied: 1 lost to "no change" in the backtest, 0.5 won
const FLAT = 0.05; // a move under 5% counts as neither up nor down

// value of a series on day index d (0 = first day of the league), or the nearest one up to 2 days away
export const at = (s, d) => {
  for (const o of [0, -1, 1, -2, 2]) {
    const v = s?.[d + o];
    if (typeof v === 'number' && v > 0) return v;
  }
  return null;
};

// median of the prices from 2 days before to 2 days after d: one odd daily price must not set a whole league's move
export const smooth = (s, d) => {
  const xs = [];
  for (let k = d - 2; k <= d + 2; k++) if (typeof s?.[k] === 'number' && s[k] > 0) xs.push(s[k]);
  return xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : null;
};

// the price on exactly that index, no neighbours: for the first days and hours of a league, where 2 days either
// side is most of the story
export const exact = (s, i) => (typeof s?.[i] === 'number' && s[i] > 0 ? s[i] : null);

// linear interpolation between sorted values
const quantile = (xs, q) => {
  const p = q * (xs.length - 1), i = Math.floor(p), j = Math.min(i + 1, xs.length - 1);
  return xs[i] + (xs[j] - xs[i]) * (p - i);
};

// past: array of series (arrays of chaos prices by day index, null = no data)
// day: day index to predict. anchor/price: today's day index and price in the running league.
// Returns null when fewer than 3 past leagues have data, else { lo, mid, hi, n, up, down, trend }:
// lo/mid/hi = 25%, 50% and 75% of the past leagues; n = leagues used; up/down = leagues that moved more than 5%;
// trend = 2 or -2 when every league moved the same way (4 leagues or more, median move over 15%), 1 or -1 when all
// but one did, 0 otherwise.
// Without anchor/price (league not started, item without a price) it is the plain spread of the past prices on that day.
// pick reads one series at one index: `smooth` by default, `exact` for day-by-day or hour-by-hour views.
export function forecast(past, day, anchor = null, price = null, pick = smooth) {
  if (anchor == null || !(price > 0)) {
    const xs = past.map((s) => pick(s, day)).filter((x) => x != null).sort((a, b) => a - b);
    return xs.length < 3 ? null : { lo: quantile(xs, 0.25), mid: quantile(xs, 0.5), hi: quantile(xs, 0.75), n: xs.length, up: 0, down: 0, trend: 0 };
  }
  const rs = past.map((s) => {
    const a = pick(s, anchor), v = pick(s, day);
    return a && v ? Math.log(v / a) : null;
  }).filter((x) => x != null).sort((a, b) => a - b);
  if (rs.length < 3) return null;
  const n = rs.length, m = quantile(rs, 0.5), up = rs.filter((r) => r > FLAT).length, down = rs.filter((r) => r < -FLAT).length;
  const same = m > 0 ? up : down;
  const trend = n >= 4 && Math.abs(m) > 0.15 && same >= n - 1 ? Math.sign(m) * (same === n ? 2 : 1) : 0;
  const to = (q) => price * Math.exp(W * quantile(rs, q));
  return { lo: to(0.25), mid: to(0.5), hi: to(0.75), n, up, down, trend, bin: n >= 4 && Math.abs(m) > FLAT ? binOf(same / n, Math.abs(m)) : null };
}

// Kind of forecast, 0 to 15: how many past leagues agree with the direction (under 60%, 60%, 80%, all) times how big
// the typical move is, in log units (under 0.15, 0.4, 1, more: for a rise that is about +16%, +49% and +172%, for
// a fall -14%, -33% and -63%). Measured on the past leagues these two say most about
// whether the direction repeats: from about 40% of the time in the lowest kind to about 85% in the highest.
const binOf = (agree, move) => 4 * (agree === 1 ? 3 : agree >= 0.8 ? 2 : agree >= 0.6 ? 1 : 0) + (move < 0.15 ? 0 : move < 0.4 ? 1 : move < 1 ? 2 : 3);

// A forecast from 3 leagues has no kind, like it has no trend: "all 3 agree" is too easy to be worth a number.
// How far to trust a forecast's direction: the share of the same kind of forecast that got the direction right in
// the backtest. bins comes from backtest(). null without a direction or with fewer than 30 tested cases.
export const confidence = (f, bins) => (f?.bin != null && bins[f.bin].n >= 30 ? bins[f.bin] : null);

// a forecast's trend in words: the calculators and the item page use the same wording
export const sinal = ({ trend, n, up, down }) => (trend === 2 ? `Sobe em todas (${n} de ${n})` : trend === 1 ? `Sobe em quase todas (${up} de ${n})` : trend === -2 ? `Cai em todas (${n} de ${n})` : trend === -1 ? `Cai em quase todas (${down} de ${n})` : 'Sem padrão');

// leave-one-out check: each past league in turn plays the running league, predicted from the others
// items: object id -> { League: series }. Errors are the median of |predicted / actual - 1|.
// Returns { model, naive, n } over every prediction ("naive" = the price stays as it is), plus `strong` with the same
// three for the predictions with trend 2 or -2 and `hit`, the share of those where the price did move that way;
// and `bins`, 16 of { hit, n }: for each kind of forecast (see binOf), how many were tested and the share whose
// price moved more than 5% in the predicted direction.
export function backtest(items, anchor, horizon) {
  const all = { model: [], naive: [] }, strong = { model: [], naive: [] }, bins = Array.from({ length: 16 }, () => ({ hit: 0, n: 0 }));
  let hit = 0;
  for (const byLeague of Object.values(items)) {
    for (const [L, s] of Object.entries(byLeague)) {
      const now = at(s, anchor), actual = smooth(s, anchor + horizon);
      if (!(now >= 1) || !actual) continue;
      const f = forecast(Object.entries(byLeague).filter(([k]) => k !== L).map(([, o]) => o), anchor + horizon, anchor, now);
      if (!f) continue;
      for (const g of Math.abs(f.trend) === 2 ? [all, strong] : [all]) {
        g.model.push(Math.abs(f.mid / actual - 1));
        g.naive.push(Math.abs(now / actual - 1));
      }
      const real = Math.log(actual / now);
      if (Math.abs(f.trend) === 2 && Math.sign(real) === Math.sign(f.trend)) hit++;
      if (f.bin != null) {
        bins[f.bin].n++;
        if (Math.abs(real) > FLAT && Math.sign(real) === Math.sign(f.mid - now)) bins[f.bin].hit++;
      }
    }
  }
  const median = (xs) => (xs.length ? quantile(xs.sort((a, b) => a - b), 0.5) : null);
  const sum = (g) => ({ model: median(g.model), naive: median(g.naive), n: g.model.length });
  return { ...sum(all), strong: { ...sum(strong), hit: strong.model.length ? hit / strong.model.length : null }, bins: bins.map((b) => ({ hit: b.n ? b.hit / b.n : null, n: b.n })) };
}
