// Bases influenciadas: rotas de craft de poe.how/economy/influenced-bases. Custo/recompensa/lucro vem prontos
// do servidor (tRPC influencedBases.scan, 50 rotas por pagina, ordenado por lucro), com as opcoes padrao do site.
import { trpc } from './_lib.mjs';

export const title = 'Bases Influenciadas';
export const order = 20;
const PAGES = 10; // shortcut: so as 500 melhores rotas (o site tem ~60 mil em ~1200 paginas); aumentar se precisar de mais
const INF = { shaper: 'Shaper', elder: 'Elder', crusader: 'Crusader', redeemer: 'Redeemer', hunter: 'Hunter', warlord: 'Warlord' };
const METHOD = { 'target-orb': '1: base limpa + orb', 'market-harvest': '2: base influenciada + Harvest', 'orb-harvest': '3: orb mais barato + Harvest' };

export async function load(league) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= PAGES; page++) { // sequencial, gentil com o site
    const r = await trpc('influencedBases.scan', {
      leagueId: league, page, search: '', sort: 'profit',
      includedConfidences: ['high'], useDeterministicCeilings: true, priceBasis: 'conservative', targetInfluenceConfidence: 0.9,
    });
    total = r.pagination;
    for (const { rawGroup: g, route: t } of r.rows ?? []) {
      rows.push({
        icon: g.cleanBaseQuote?.icon ?? null,
        base: g.baseType, type: g.itemType, ilvl: g.itemLevel, target: INF[t.targetInfluence] ?? t.targetInfluence,
        method: METHOD[t.method] ?? t.method,
        detail: [t.startingInfluence ? `de ${INF[t.startingInfluence] ?? t.startingInfluence}` : '', t.harvestAttempts ? `${t.harvestAttempts} tentativas Harvest` : '', t.exclusionReason ?? ''].filter(Boolean).join('; '),
        cleanBase: g.cleanBaseQuote?.unitChaosValue ?? null,
        cost: t.cost, reward: t.reward, profit: t.profit, roi: t.roi == null ? null : 100 * t.roi,
      });
    }
    if (!total || page >= total.pageCount) break;
  }
  return {
    note: `Rotas de craft para base influenciada (1: Exalted influenciado na base limpa; 2: base com outra influencia + reroll Harvest; 3: orb mais barato + Harvest). Custo, recompensa e lucro calculados pelo poe.how com o padrao do site (so precos de alta confianca, filtro deterministico ligado, preco conservador, 90% de sucesso no Harvest). Mostra so as ${rows.length} melhores rotas por lucro de ${total?.totalRoutes ?? '?'} (${total?.totalBaseGroups ?? '?'} grupos de base).`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'base', label: 'Base', type: 'text' },
      { key: 'type', label: 'Tipo', type: 'text' },
      { key: 'ilvl', label: 'ilvl', type: 'int' },
      { key: 'target', label: 'Alvo', type: 'text' },
      { key: 'method', label: 'Método', type: 'text' },
      { key: 'detail', label: 'Detalhe', type: 'text' },
      { key: 'cleanBase', label: 'Base limpa', type: 'chaos' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'reward', label: 'Recompensa', type: 'chaos' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
    ],
    rows,
  };
}
