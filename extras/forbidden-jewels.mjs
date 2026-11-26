import { trpc } from './_lib.mjs';

export const title = 'Forbidden Jewels';
export const order = 30;
export const group = 'Itens';

export async function load(league) {
  const { pairs } = await trpc('forbiddenJewels.list', { leagueId: league });
  return {
    note: 'Custo do par Forbidden Flame + Forbidden Flesh por notável de ascendência.',
    defaultSort: { key: 'pair', dir: 'desc' },
    columns: [
      { key: 'effect', label: 'Notável', type: 'text' },
      { key: 'baseClass', label: 'Classe', type: 'text' },
      { key: 'ascendancy', label: 'Ascendência', type: 'text' },
      { key: 'flame', label: 'Flame', type: 'chaos' },
      { key: 'flesh', label: 'Flesh', type: 'chaos' },
      { key: 'pair', label: 'Par', type: 'chaos' },
      { key: 'conf', label: 'Confiança', type: 'text' },
    ],
    rows: pairs.map((p) => ({
      icon: p.flame?.icon ?? null,
      effect: p.effect ?? null,
      baseClass: p.baseClass ?? null,
      ascendancy: p.ascendancy ?? null,
      flame: p.flame?.chaosValue ?? null,
      flesh: p.flesh?.chaosValue ?? null,
      pair: p.pairChaosValue ?? null,
      conf: p.pairConfidence ?? null,
    })),
  };
}
