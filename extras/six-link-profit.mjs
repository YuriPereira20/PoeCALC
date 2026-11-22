// 6-Link Profit: reproduz o calculo client-side de poe.how/economy/six-link-profit (configuracao padrao).
import { trpc, ninjaIcons } from './_lib.mjs';

export const title = 'Lucro 6-Link';
export const order = 60;

const QUALITY = 20, MIN_LISTINGS = 10;
const P_FUSE = 0.001 * (1 + QUALITY / 100) / 1.2; // chance de 6L por Fusing, igual ao site
const METHOD = { beast: 'Beastcraft', bench: 'Bancada (1500 fusings)', omen: 'Omen of Connections', fusing: 'Spam de Fusing' };
const sum = (...v) => (v.some(x => x == null) ? null : v.reduce((a, b) => a + b, 0));

export async function load(league) {
  let data;
  try { data = await trpc('sixLinkProfit.market', { league }); } catch (e) {
    if (!/active supported league/.test(e.message)) throw e;
    return { note: `O poe.how só calcula 6-link para as ligas ativas (Covens e Hardcore Covens); "${league}" não é suportada.`, defaultSort: { key: 'name', dir: 'asc' }, columns: [{ key: 'name', label: 'Única', type: 'text' }], rows: [] };
  }
  const { pairs, inputs: i } = data;
  const icons = await ninjaIcons(league, ['UniqueArmour', 'UniqueWeapon']);
  const f = i.fusing ?? null;
  const links = [
    ['beast', sum(i.blackMorrigan, i.craicicSandSpitter)],
    ['bench', f == null ? null : 1500 * f],
    ['omen', sum(i.omenOfConnections, f)],
    ['fusing', f == null ? null : f / P_FUSE],
  ].filter(m => m[1] != null).sort((a, b) => a[1] - b[1]);
  const link = links[0] ?? null;
  const sockets = [sum(i.omenOfTheJeweller, i.jeweller), i.jeweller == null ? null : 350 * i.jeweller].filter(x => x != null);
  const socket = sockets.length ? Math.min(...sockets) : null;
  const ok = (q) => (q?.listingCount ?? 0) >= MIN_LISTINGS;

  const rows = [];
  for (const p of pairs) {
    if (!p.sixLink || p.sixLink.chaosValue == null) continue;
    const cands = [{ ...p.unlinked, src: '0-4L' }, ...(p.fiveLink ? [{ ...p.fiveLink, src: '5L' }] : [])].filter(c => c.chaosValue != null);
    if (!cands.length) continue;
    const pool = cands.filter(ok).length ? cands.filter(ok) : cands;
    const base = pool.reduce((a, b) => (b.chaosValue < a.chaosValue ? b : a));
    if (!ok(base) || !ok(p.sixLink)) continue; // o site esconde mercados "thin" por padrao
    const cost = link && socket != null ? base.chaosValue + socket + link[1] : null;
    const profit = cost == null ? null : p.sixLink.chaosValue - cost;
    rows.push({
      name: p.name, icon: icons.get(p.name), base: p.baseType + (p.variant ? ` (${p.variant})` : ''), buy: base.src,
      basePrice: base.chaosValue, baseListings: base.listingCount, sixLink: p.sixLink.chaosValue, sixListings: p.sixLink.listingCount,
      cost, method: link ? METHOD[link[0]] : null, profit, roi: profit == null || cost <= 0 ? null : 100 * profit / cost,
    });
  }
  return {
    note: `Únicas que valem mais 6-linkadas do que base + custo de linkar. Igual ao padrão do poe.how: base mais barata entre 0-4L e 5L, 6 sockets pelo mais barato entre Omen of the Jeweller+Jeweller e bancada (350 jewellers), 6-link pelo método mais barato (Beastcraft, 1500 fusings, Omen of Connections+1 fusing ou spam de fusing a qualidade ${QUALITY}%), só mercados com >= ${MIN_LISTINGS} anúncios.`,
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Única', type: 'text' },
      { key: 'base', label: 'Base', type: 'text' },
      { key: 'buy', label: 'Comprar', type: 'text' },
      { key: 'basePrice', label: 'Preço base', type: 'chaos' },
      { key: 'baseListings', label: 'Anúncios base', type: 'int' },
      { key: 'sixLink', label: 'Preço 6L', type: 'chaos' },
      { key: 'sixListings', label: 'Anúncios 6L', type: 'int' },
      { key: 'cost', label: 'Custo total', type: 'chaos' },
      { key: 'method', label: 'Método 6L', type: 'text' },
      { key: 'profit', label: 'Lucro', type: 'chaos' },
      { key: 'roi', label: 'Retorno', type: 'pct' },
    ],
    rows: rows.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity)).slice(0, 5000),
  };
}
