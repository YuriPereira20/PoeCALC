import { exchange, meta } from './_exchange.mjs';

export const title = 'Vendedor: comprar moeda';
export const order = 13;

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

export async function load(league) {
  const { items, nHours, base } = await exchange(league);
  const rows = [];
  for (const [out, n, inp, who] of BUY) {
    const inId = `Metadata/Items/Currency/${inp}`, outId = `Metadata/Items/Currency/${out}`;
    const i = items.get(inId), o = items.get(outId);
    // a market with trades in under 3 hours, or under 100 c/h, gives a price too loose to build a recipe on
    if (!i || !o || i.hours < 3 || o.hours < 3 || i.volume < 100 || o.volume < 100) continue;
    const cost = n * i.price, profit = o.price - cost;
    rows.push({ ...meta(base, outId), who, input: `${n}× ${meta(base, inId).name}`, cost, value: o.price, profit, roi: 100 * profit / cost, volume: o.volume, volIn: i.volume });
  }
  return {
    note: `Moedas que os vendedores das cidades vendem em troca de outra moeda: compre o pagamento na Currency Exchange, troque no vendedor e venda o resultado. Tabela da versão 3.30 (Chromatic e Chance não são mais vendidos; Scouring agora custa 4 Fusing). O lucro é de centavos por unidade, então só vale em volume; as compras podem ser encadeadas (Jeweller's → Fusing → Scouring). Preços das trocas executadas na Currency Exchange oficial, últimas ${nHours} horas, comprando e vendendo pelo preço médio, sem a taxa em ouro do Faustus. Só entram mercados com troca em pelo menos 3 horas e volume a partir de 100 c/h.`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Moeda comprada', type: 'text' },
      { key: 'who', label: 'Vendedor', type: 'text' },
      { key: 'input', label: 'Paga com', type: 'text' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'value', label: 'Vende por', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'Retorno', type: 'pct' },
      { key: 'volume', label: 'Volume/h da moeda', type: 'chaos' },
      { key: 'volIn', label: 'Volume/h do pagamento', type: 'chaos' },
    ],
    rows,
  };
}
