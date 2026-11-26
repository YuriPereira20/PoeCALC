import { exchange, meta } from './_exchange.mjs';

export const title = 'Trocas rápidas';
export const order = 10;
export const group = 'Itens';

const OILS = ['Mushrune1', 'Mushrune2', 'Mushrune3', 'Mushrune4', 'Mushrune5', 'Mushrune6', 'Mushrune6b', 'Mushrune7', 'Mushrune8', 'Mushrune9', 'Mushrune10', 'Mushrune11', 'Mushrune12'].map((s) => `Metadata/Items/Currency/${s}`);
const ESSENCE = /^Metadata\/Items\/Currency\/CurrencyEssence([A-Za-z]+)(\d+)$/;

// Town vendors' currency sales as of 3.30: poedb's table corrected by the patch notes (3.29: Chromatic no longer sold;
// 3.30: Chance no longer sold, Scouring costs 4 Fusing, Transmutation costs 1 Augmentation). [sold, n, paid with, vendor]
const BUY = [
  ['CurrencyUpgradeToRare', 1, 'CurrencyPassiveRefund', 'Clarissa, ato 3'],
  ['CurrencyPassiveRefund', 2, 'CurrencyConvertToNormal', 'Yeena, ato 2'],
  ['CurrencyConvertToNormal', 4, 'CurrencyRerollSocketLinks', 'Yeena, ato 2'],
  ['CurrencyRerollSocketLinks', 4, 'CurrencyRerollSocketNumbers', 'Yeena, ato 2'],
  ['CurrencyRerollSocketNumbers', 2, 'CurrencyRerollMagic', 'Yeena, ato 2'],
  ['CurrencyRerollMagic', 4, 'CurrencyAddModToMagic', 'Nessa, ato 1'],
  ['CurrencyAddModToMagic', 4, 'CurrencyUpgradeToMagic', 'Nessa, ato 1'],
  ['CurrencyUpgradeToMagic', 1, 'CurrencyAddModToMagic', 'Nessa, ato 1'],
  ['CurrencyPortal', 3, 'CurrencyIdentification', 'Nessa, ato 1'],
  ['CurrencyWeaponQuality', 3, 'CurrencyArmourQuality', 'Greust, ato 3'],
  ['CurrencyArmourQuality', 1, 'CurrencyWeaponQuality', 'Tarkleigh, ato 1'],
  ['CurrencyAtlasPassiveRefund', 2, 'CurrencyPassiveRefund', 'Kirac'],
];

// pure: takes exchange() output, so the test can feed it made-up prices
export function tradeRows({ items, base }) {
  const trades = [];
  for (let i = 0; i + 1 < OILS.length; i++) trades.push({ kind: '3 por 1: Óleo', n: 3, inId: OILS[i], outId: OILS[i + 1] });
  for (const id of Object.keys(base)) {
    const m = id.match(ESSENCE);
    const next = m && `Metadata/Items/Currency/CurrencyEssence${m[1]}${+m[2] + 1}`;
    if (next && base[next]) trades.push({ kind: '3 por 1: Essência (testar)', n: 3, inId: id, outId: next });
  }
  for (const [out, n, inp, who] of BUY) trades.push({ kind: `Comprar do vendedor: ${who}`, n, inId: `Metadata/Items/Currency/${inp}`, outId: `Metadata/Items/Currency/${out}` });
  const rows = [];
  for (const t of trades) {
    const i = items.get(t.inId), o = items.get(t.outId);
    // a market with trades in under 3 hours, or under 100 c/h, gives a price too loose to build a trade on
    if (!i || !o || i.hours < 3 || o.hours < 3 || i.volume < 100 || o.volume < 100) continue;
    const cost = t.n * i.price, profit = o.price - cost;
    rows.push({ ...meta(base, t.outId), kind: t.kind, input: `${t.n}× ${meta(base, t.inId).name}`, cost, value: o.price, profit, roi: 100 * profit / cost, volume: o.volume, volIn: i.volume });
  }
  for (const [id, it] of Object.entries(base)) {
    const to = it.properties?.full_stack_turns_into, n = it.properties?.stack_size;
    if (!to || !n || !items.has(id) || !items.has(to)) continue;
    const frag = items.get(id), target = items.get(to), cost = n * frag.price, profit = target.price - cost;
    // under 3 hours with trades the price is too loose (hours is null for chaos and divine themselves)
    if (frag.hours < 3 || (target.hours ?? 3) < 3) continue;
    rows.push({ ...meta(base, to), kind: 'Montar fragmentos', input: `${n}× ${meta(base, id).name}`, cost, value: target.price, profit, roi: 100 * profit / cost, volume: target.volume, volIn: frag.volume });
  }
  return rows;
}

export async function load(league) {
  const ex = await exchange(league);
  return {
    note: `Três tipos de troca, com preços das trocas executadas na Currency Exchange oficial nas últimas ${ex.nHours} horas. O lucro é por troca, comprando e vendendo pelo preço médio, sem a taxa em ouro do Faustus. 3 por 1: vender 3 óleos ou 3 essências iguais a qualquer vendedor dá 1 do nível seguinte. A receita dos óleos está confirmada; a das essências é antiga e não foi confirmada nesta versão, então teste com 3 antes de comprar em quantidade. Comprar do vendedor: compre o pagamento na Currency Exchange, troque no vendedor e venda o resultado. A tabela é da versão 3.30 (Chromatic e Chance não são mais vendidos; Scouring agora custa 4 Fusing), e o lucro é de centavos por unidade, então só vale em volume; as compras podem ser encadeadas (Jeweller's → Fusing → Scouring). Montar fragmentos: juntar a pilha completa de fragmentos vira o item inteiro (dado do próprio jogo). Volume baixo de um dos lados significa que o lucro some rápido: confira antes de comprar em quantidade. Só entram mercados com troca em pelo menos 3 horas; no 3 por 1 e na compra do vendedor, também volume a partir de 100 c/h.`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Resultado', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'input', label: 'Entrega', type: 'text' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'value', label: 'Valor', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'Retorno', type: 'pct' },
      { key: 'volume', label: 'Volume/h do resultado', type: 'chaos' },
      { key: 'volIn', label: 'Volume/h da entrega', type: 'chaos' },
    ],
    rows: tradeRows(ex),
  };
}
