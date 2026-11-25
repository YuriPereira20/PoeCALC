// Screams of the Desiccated: poe.ninja prices every shrine roll as its own line (type ShrineBelt), but nobody
// publishes the roll chances, so the share of listings stands in for them. It overstates the rare rolls, which
// stay listed longer.
const OFF = ['acceleration', 'brutal', 'diamond', 'echoing', 'gloom', 'resonating', 'greater-freezing', 'greater-shocking', 'greater-skeletal'];
const DEF = ['impenetrable', 'massive', 'replenishing', 'resistance'];
// one shrine, or one of each kind; poe.ninja joins the two names in alphabetical order
const ROLLS = [...OFF, ...DEF].map((a) => [a]).concat(OFF.flatMap((a) => DEF.map((b) => [a, b].sort())));
const pretty = (k) => k.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const UNID = 'poewatch-87982'; // the unidentified belt, as the boss strategy names it
export const BELT_IDS = ROLLS.map((r) => `screams-of-the-desiccated-${r.join('-')}`);
export const BELT_ICON = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQmVsdHMvU291bGNvcmQiLCJ3IjoyLCJoIjoxLCJzY2FsZSI6MX1d/3817a36c97/Soulcord.png';

// ev: chaos value of one unidentified belt (0 without data). strategy: the gamble entry, null without data or
// without a boss strategy that drops the belt.
// Under 10 listings the price is the ask of a few sellers (up to thousands of divines). With those rolls the belt
// would be worth about 27 div, while the unidentified one trades around 16; without them it comes to about 18.
const MIN = 10;

export function belt(strategies, prices, counts) {
  const n = (id) => (prices[id] > 0 && counts[id] >= MIN ? counts[id] : 0);
  const total = BELT_IDS.reduce((a, id) => a + n(id), 0);
  if (!total) return { ev: 0, strategy: null };
  const skipped = BELT_IDS.filter((id) => prices[id] > 0 && !n(id)).length;
  // `from` is the chip the page shows beside the item name; the name stays the belt's so the market and wiki links work
  const rew = ROLLS.map((r, i) => ({ item: BELT_IDS[i], name: 'Screams of the Desiccated', from: r.map(pretty).join(' + '), amount: 1, price: 0, conf: null, group: 1, rate: n(BELT_IDS[i]) / total })).filter((l) => l.rate > 0);
  const ev = rew.reduce((a, l) => a + l.rate * prices[l.item], 0);
  const boss = strategies.find((s) => s.category === 'bosses' && s.rew.some((l) => l.item === UNID && l.rate > 0));
  if (!boss) return { ev, strategy: null };
  const rate = boss.rew.find((l) => l.item === UNID).rate;
  return {
    ev,
    strategy: {
      id: 900001, slug: 'screams-of-the-desiccated', title: 'Screams of the Desiccated: qual shrine vem', img: null, category: 'gamble', fixed: false, custom: true,
      versions: boss.versions, runs: total, contributors: 0, how: null,
      note: `A GGG não publica a chance de cada shrine: a chance aqui é a fatia de anúncios de cada variante no poe.ninja (${total} cintos anunciados, mostrados em Runs). Cinto raro fica mais tempo anunciado, então a chance dele tende a estar exagerada. Ficaram de fora ${skipped} variantes com menos de ${MIN} anúncios, entre elas as mais caras: o preço delas é só o pedido de poucos vendedores. O custo é o das entradas do ${boss.title} para dropar 1 cinto (1 ÷ ${(100 * rate).toFixed(0)}% de chance de drop).`,
      // entries of the boss fight needed for one belt on average
      req: boss.req.map((l) => ({ ...l, amount: Math.round(100 * l.amount / rate) / 100 })),
      rew,
    },
  };
}
