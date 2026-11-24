import { exchange, meta } from './_exchange.mjs';

export const title = 'Vendedor: 3 por 1';
export const order = 12;

const OILS = ['Mushrune1', 'Mushrune2', 'Mushrune3', 'Mushrune4', 'Mushrune5', 'Mushrune6', 'Mushrune6b', 'Mushrune7', 'Mushrune8', 'Mushrune9', 'Mushrune10', 'Mushrune11', 'Mushrune12'].map((s) => `Metadata/Items/Currency/${s}`);
const ESSENCE = /^Metadata\/Items\/Currency\/CurrencyEssence([A-Za-z]+)(\d+)$/;
// The vendors' direct currency sales (Chromatic for 3 Jeweller's and so on) are left out on purpose: at live
// prices they would return up to 1900%, so that table no longer holds.

export async function load(league) {
  const { items, nHours, base } = await exchange(league);
  const recipes = [];
  for (let i = 0; i + 1 < OILS.length; i++) recipes.push({ kind: 'Óleo', inId: OILS[i], outId: OILS[i + 1] });
  for (const id of Object.keys(base)) {
    const m = id.match(ESSENCE);
    const next = m && `Metadata/Items/Currency/CurrencyEssence${m[1]}${+m[2] + 1}`;
    if (next && base[next]) recipes.push({ kind: 'Essência (testar)', inId: id, outId: next });
  }
  const rows = [];
  for (const r of recipes) {
    const i = items.get(r.inId), o = items.get(r.outId);
    // a market with trades in under 3 hours, or under 100 c/h, gives a price too loose to build a recipe on
    if (!i || !o || i.hours < 3 || o.hours < 3 || i.volume < 100 || o.volume < 100) continue;
    const cost = 3 * i.price, profit = o.price - cost;
    rows.push({ ...meta(base, r.outId), kind: r.kind, input: `3× ${meta(base, r.inId).name}`, cost, value: o.price, profit, roi: 100 * profit / cost, volume: o.volume, volIn: i.volume });
  }
  return {
    note: `Vender 3 óleos ou 3 essências iguais a qualquer vendedor dá 1 do nível seguinte. Preços das trocas executadas na Currency Exchange oficial, últimas ${nHours} horas; o lucro é por troca, comprando e vendendo pelo preço médio, sem a taxa em ouro do Faustus. A receita dos óleos está confirmada e os preços mostram isso (lucro perto de zero). A das essências é antiga e não foi confirmada nesta versão: teste com 3 antes de comprar em quantidade. Só entram mercados com troca em pelo menos 3 horas e volume a partir de 100 c/h.`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Resultado', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'input', label: 'Entrega', type: 'text' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'value', label: 'Valor', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'Retorno', type: 'pct' },
      { key: 'volume', label: 'Volume/h resultado', type: 'chaos' },
      { key: 'volIn', label: 'Volume/h entrega', type: 'chaos' },
    ],
    rows,
  };
}
