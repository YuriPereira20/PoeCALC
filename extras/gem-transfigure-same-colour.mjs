// Gemas: Divine Font -> transfigurada aleatoria da mesma cor. Igual a poe.how/economy/gem/transfigure-same-colour:
// todas as transfiguradas (sem Vaal) da cor sao igualmente provaveis; sem preco conta 0.
import { loadTab } from './_gems.mjs';

export const title = 'Gemas: Transfigurar (mesma cor)';
export const order = 87;
const COLOURS = { strength: 'Vermelha (FOR)', dexterity: 'Verde (DES)', intelligence: 'Azul (INT)' };
const JACKPOT = 40; // limiar padrao do site
const val = (slot, league) => (slot?.isVendor ? 1 : typeof slot?.value?.[league] === 'number' ? slot.value[league] : null);
const activeOnly = (tags) => tags.includes('active') && !tags.includes('support');

export async function load(league) {
  const { records } = await loadTab('transfigure-same-colour');
  const plain = records.filter(r => !r.metadata.transfigured && !r.tags.includes('vaal'));
  const trans = records.filter(r => r.metadata.transfigured && !r.tags.includes('vaal'));
  const rows = [];
  for (const q20 of [false, true]) for (const [c, label] of Object.entries(COLOURS)) {
    const outs = trans.filter(r => r.tags.includes(c) && (!q20 || activeOnly(r.tags)));
    if (!outs.length) continue;
    let input = 1, inputName = 'qualquer gema (1c)';
    if (q20) {
      const cheapest = plain.filter(r => r.tags.includes(c) && activeOnly(r.tags))
        .map(r => ({ r, p: val(r.leveledQuality, league) })).filter(x => x.p != null)
        .sort((a, b) => a.p - b.p || a.r.name.localeCompare(b.r.name))[0];
      input = cheapest?.p ?? null; inputName = cheapest ? `${cheapest.r.name} 20/20` : null;
    }
    const vals = outs.map(r => ({ name: r.name, v: val(q20 ? r.leveledQuality : r.baseGem, league) }));
    if (!vals.some(x => x.v != null)) continue; // liga sem precos para este modo
    const ev = vals.reduce((a, x) => a + (x.v ?? 0), 0) / outs.length;
    const top = vals.filter(x => x.v != null).sort((a, b) => b.v - a.v).slice(0, 3);
    rows.push({
      colour: label, mode: q20 ? '20/20' : 'nivel 1', input, inputName, count: outs.length, priced: vals.filter(x => x.v != null).length,
      ev, profit: input == null ? null : ev - input,
      jackpot: 100 * vals.filter(x => (x.v ?? 0) >= JACKPOT).length / outs.length,
      top: top.map(x => `${x.name} ${Math.round(x.v)}c`).join(' | '),
    });
  }
  return {
    note: `Divine Font (Labirinto): transforma a gema numa transfigurada aleatoria da mesma cor. Como no poe.how: cada transfigurada (sem Vaal) da cor e igualmente provavel e sem preco vale 0; modo "nivel 1" usa 1c de entrada e preco das transfiguradas nv1, modo "20/20" usa a gema ativa 20/20 mais barata da cor e preco 20/20. Jackpot = chance de >= ${JACKPOT}c. Inclui precos de baixa confianca (padrao do site).`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'colour', label: 'Cor', type: 'text' },
      { key: 'mode', label: 'Modo', type: 'text' },
      { key: 'inputName', label: 'Entrada', type: 'text' },
      { key: 'input', label: 'Custo', type: 'chaos' },
      { key: 'count', label: 'Resultados', type: 'int' },
      { key: 'priced', label: 'Com preço', type: 'int' },
      { key: 'ev', label: 'Valor esperado', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'jackpot', label: `Chance >= ${JACKPOT}c`, type: 'pct' },
      { key: 'top', label: 'Melhores resultados', type: 'text' },
    ],
    rows,
  };
}
