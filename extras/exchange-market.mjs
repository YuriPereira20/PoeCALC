import { exchange, meta, CHAOS, DIVINE } from './_exchange.mjs';

export const title = 'Bolsa oficial: preço e volume';
export const order = 10;

export async function load(league) {
  const { items, nHours, base } = await exchange(league);
  const rows = [];
  for (const [id, it] of items) {
    if (id === CHAOS || id === DIVINE || it.hours < 4 || it.volume < 500) continue;
    rows.push({ ...meta(base, id), market: it.quote === 'chaos' ? 'Chaos' : 'Divine', price: it.price, lo: it.lo, hi: it.hi, swing: 100 * (it.hi / it.lo - 1), volume: it.volume, hours: it.hours });
  }
  return {
    // no profit column on purpose: the hourly low and high can each be one small trade, so the gap is not a margin anyone can count on
    note: `Trocas realmente executadas na Currency Exchange do jogo (API oficial da GGG), últimas ${nHours} horas fechadas. Preço real = mediana do preço médio de cada hora. Mínimo e máximo = mediana do menor e do maior preço pago em cada hora; cada um pode ser uma única troca pequena, então a oscilação mostra onde ordens abaixo ou acima do preço chegam a ser aceitas, não um lucro garantido. Volume/h é o total trocado, em chaos. Só itens com troca em pelo menos 4 horas e volume a partir de 500 c/h.`,
    defaultSort: { key: 'volume', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'market', label: 'Mercado', type: 'text' },
      { key: 'price', label: 'Preço real', type: 'chaos' },
      { key: 'lo', label: 'Mínimo/h', type: 'chaos' },
      { key: 'hi', label: 'Máximo/h', type: 'chaos' },
      { key: 'swing', label: 'Oscilação', type: 'pct' },
      { key: 'volume', label: 'Volume/h', type: 'chaos' },
      { key: 'hours', label: 'Horas c/ troca', type: 'int' },
    ],
    rows,
  };
}
