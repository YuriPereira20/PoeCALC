// Gemas: Divine Font -> transfigurada da propria gema. Igual a poe.how/economy/gem/transfigure-random:
// lucro = variante transfigurada mais cara - gema base (assume escolher a melhor; garantido com <= 3 variantes).
import { loadTab } from './_gems.mjs';

export const title = 'Gemas: Transfigurar (própria gema)';
export const order = 88;
const val = (slot, league) => (slot?.isVendor ? 1 : typeof slot?.value?.[league] === 'number' ? slot.value[league] : null);
const activeOnly = (tags) => tags.includes('active') && !tags.includes('support');
function baseId(r) {
  const t = r.tags.find(x => x.startsWith('base:'));
  if (t) return t.slice(5);
  const id = r.baseDetailsId?.toLowerCase();
  return id ? id.replace(/^(awakened-|vaal-)/, '').split('-of-')[0] || null : null;
}

export async function load(league) {
  const { records } = await loadTab('transfigure-random');
  const groups = new Map();
  for (const r of records) if (r.metadata.transfigured && !r.tags.includes('vaal')) {
    const k = baseId(r); if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const rows = [];
  for (const q20 of [false, true]) for (const r of records) {
    if (r.metadata.transfigured || r.tags.includes('vaal') || (q20 && !activeOnly(r.tags))) continue;
    const vars = (groups.get(baseId(r)) ?? []).filter(v => !q20 || activeOnly(v.tags));
    if (!vars.length) continue;
    const priced = vars.map(v => ({ name: v.name, p: val(q20 ? v.leveledQuality : v.baseGem, league) })).filter(x => x.p != null).sort((a, b) => b.p - a.p);
    if (!priced.length) continue; // nenhuma variante com preco nesta liga/modo
    const base = val(q20 ? r.leveledQuality : r.baseGem, league), best = priced[0];
    rows.push({
      name: r.name, mode: q20 ? '20/20' : 'nivel 1', base, variants: vars.length, priced: priced.length,
      guaranteed: vars.length <= 3 ? 'sim' : 'nao', best: best?.name ?? null, bestPrice: best?.p ?? null,
      profit: base != null && best ? best.p - base : null,
      others: priced.slice(1).map(x => `${x.name} ${Math.round(x.p)}c`).join(' | '),
    });
  }
  rows.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || a.name.localeCompare(b.name));
  return {
    note: 'Divine Font (Labirinto): converte a gema numa das suas versoes transfiguradas, escolhendo entre ate 3 opcoes. Como no poe.how: lucro = variante mais cara - preco da gema base, so garantido quando ha <= 3 variantes (coluna "Garantido"). Modo "nivel 1" usa precos nv1 (vendor = 1c), "20/20" usa gemas ativas 20/20. Inclui precos de baixa confianca (padrao do site).',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema base', type: 'text' },
      { key: 'mode', label: 'Modo', type: 'text' },
      { key: 'base', label: 'Preço base', type: 'chaos' },
      { key: 'variants', label: 'Variantes', type: 'int' },
      { key: 'priced', label: 'Com preço', type: 'int' },
      { key: 'guaranteed', label: 'Garantido', type: 'text' },
      { key: 'best', label: 'Melhor variante', type: 'text' },
      { key: 'bestPrice', label: 'Preço melhor', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'others', label: 'Outras variantes', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
