import { exchange, meta } from './_exchange.mjs';

export const title = 'Montar fragmentos';
export const order = 11;

export async function load(league) {
  const { items, nHours, base } = await exchange(league);
  const rows = [];
  for (const [id, it] of Object.entries(base)) {
    const to = it.properties?.full_stack_turns_into, n = it.properties?.stack_size;
    if (!to || !n || !items.has(id) || !items.has(to)) continue;
    const frag = items.get(id), target = items.get(to), cost = n * frag.price, profit = target.price - cost;
    // under 3 hours with trades the price is too loose (hours is null for chaos and divine themselves)
    if (frag.hours < 3 || (target.hours ?? 3) < 3) continue;
    rows.push({ ...meta(base, id), n, target: meta(base, to).name, cost, value: target.price, profit, roi: 100 * profit / cost, volume: frag.volume, volTarget: target.volume });
  }
  return {
    note: `Juntar a pilha completa de fragmentos vira o item inteiro (dado do próprio jogo). Preços das trocas executadas na Currency Exchange oficial, últimas ${nHours} horas. Volume baixo de um dos lados significa que o lucro some rápido: confira antes de comprar em quantidade. Não desconta a taxa em ouro do Faustus. Só entram mercados com troca em pelo menos 3 horas.`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Fragmento', type: 'text' },
      { key: 'n', label: 'Qtd', type: 'int' },
      { key: 'target', label: 'Vira', type: 'text' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'value', label: 'Valor inteiro', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'Retorno', type: 'pct' },
      { key: 'volume', label: 'Volume/h fragmento', type: 'chaos' },
      { key: 'volTarget', label: 'Volume/h inteiro', type: 'chaos' },
    ],
    rows,
  };
}
