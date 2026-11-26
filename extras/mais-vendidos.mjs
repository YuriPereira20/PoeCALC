import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTS } from '../forecast.mjs';

export const title = 'Itens mais vendidos';
export const order = 1;
export const group = 'Mercado';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPO = { Currency: 'Moeda', Fragment: 'Fragmento', DivinationCard: 'Carta', Essence: 'Essência', DeliriumOrb: 'Orbe de Delirium', Tattoo: 'Tatuagem', Runegraft: 'Runegraft', AllflameEmber: 'Allflame Ember', Astrolabe: 'Astrolábio', Oil: 'Óleo', Fossil: 'Fóssil', Omen: 'Presságio', Artifact: 'Artefato', Resonator: 'Ressonador', Scarab: 'Scarab' };
const readJson = (path) => readFile(path, 'utf8').then(JSON.parse, () => null); // a missing file is null

// market: the entries of the price cache (see fetchLivePrices in prices.mjs); hasPage(id): whether the item has a page
export function marketRows(market, hasPage) {
  const list = market.filter((m) => m.id !== 'chaos-orb'); // the unit everything is priced in, not a row
  const total = list.reduce((s, m) => s + m.volume, 0);
  return list.map((m) => ({
    id: m.id, name: m.name, icon: m.icon, href: hasPage(m.id) ? `#/h/${encodeURIComponent(m.id)}` : undefined,
    tipo: TIPO[m.type] ?? m.type, price: m.price, volume: m.volume, units: m.volume / m.price, share: 100 * m.volume / total, chg: m.chg,
  }));
}

export async function load(league) {
  const cache = await readJson(join(ROOT, 'data', `prices-${league.replace(/[^a-zA-Z0-9]/g, '_')}.json`));
  if (!cache?.market?.length) throw new Error('Sem volume desta liga ainda: clique em Atualizar preços');
  // history and hours are optional: a missing file means no item has a page
  const [past, hours] = await Promise.all(['history.json', 'hours.json'].map((f) => readJson(join(ROOT, 'data', f)).then((j) => j?.items ?? {})));
  const hasPage = (id) => !!STARTS[league] && (Object.hasOwn(past, id) || Object.hasOwn(hours, id));
  return {
    note: `Volume é o chaos negociado por hora na Currency Exchange oficial do jogo, na média das últimas horas: é o mesmo número da API da GGG. Unidades por hora são o volume dividido pelo preço. Itens únicos, gemas e mapas não entram, porque são vendidos por anúncio e ninguém publica quantos foram vendidos. Itens muito caros com volume enorme (Mirror of Kalandra, por exemplo) incluem transferências entre contas, então olhe também as unidades. A página reaproveita a leitura de preços que o site já fez, sem consulta extra: lida em ${new Date(cache.at).toLocaleString('pt-BR')}. Fonte: poe.ninja.`,
    defaultSort: { key: 'volume', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'tipo', label: 'Tipo', type: 'text' },
      { key: 'price', label: 'Preço', type: 'chaos' },
      { key: 'volume', label: 'Volume por hora', type: 'chaos' },
      { key: 'units', label: 'Unidades por hora', type: 'int' },
      { key: 'share', label: 'Parte do volume total', type: 'pct' },
      { key: 'chg', label: 'Variação em 7 dias', type: 'pct' },
    ],
    rows: marketRows(cache.market, hasPage),
  };
}
