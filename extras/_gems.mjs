// Shared helper for the gem calculators (poe.how /economy/gem/<tab>). Not a calculator itself.
import { trpc, getText } from './_lib.mjs';

// compactData = [keys, strings, root]: number<0 -> strings[-n-1]; [1,...] list; [2,x] literal; [0,k,v,...] object (k = key index).
export function decode([keys, strings, root]) {
  const d = (e) => {
    if (typeof e === 'number') return e < 0 ? strings[-e - 1] : e;
    if (!Array.isArray(e)) return e;
    if (e[0] === 1) return e.slice(1).map(d);
    if (e[0] === 2) return e[1];
    if (e[0] !== 0) throw new Error('compactData: marcador desconhecido ' + e[0]);
    const o = {};
    for (let i = 1; i < e.length; i += 2) o[keys[e[i]]] = d(e[i + 1]);
    return o;
  };
  return d(root);
}

// Pull {compactData, totalRecordCount} out of the RSC payload embedded in the page HTML.
function ssrPayload(html) {
  let rsc = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) rsc += JSON.parse(m[1]);
  const i = rsc.indexOf('"compactData":');
  if (i < 0) throw new Error('gem page: compactData nao encontrado');
  let j = i + 14, depth = 0, str = false;
  for (; j < rsc.length; j++) {
    const ch = rsc[j];
    if (str) { if (ch === '\\') j++; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true; else if (ch === '[') depth++; else if (ch === ']' && --depth === 0) break;
  }
  const compactData = JSON.parse(rsc.slice(i + 14, j + 1));
  const total = rsc.slice(j).match(/"totalRecordCount":(\d+)/);
  return { compactData, totalRecordCount: total ? +total[1] : 0 };
}

const cache = new Map(); // tab -> { at, promise }; the tab data holds every league, so one fetch serves all four
export function loadTab(tab) {
  const c = cache.get(tab);
  if (c && Date.now() - c.at < 5 * 60e3) return c.promise;
  const promise = (async () => {
    // Like the site: first page + supplementaryPrices (Vaal Orb etc., absent from tRPC pages) come from the server-rendered page.
    const first = ssrPayload(await getText(`https://poe.how/economy/gem/${tab}`));
    const d0 = decode(first.compactData);
    const records = [...d0.records];
    for (let off = records.length; off < first.totalRecordCount; off += 200) { // sequential, gentle on the site
      const p = await trpc('gem.tabPage', { tab, offset: off, limit: 200 });
      const d = decode(p.compactData);
      if (!d.records.length) break;
      records.push(...d.records);
    }
    return { records, supplementaryPrices: d0.supplementaryPrices ?? {} };
  })();
  promise.catch(() => cache.delete(tab));
  cache.set(tab, { at: Date.now(), promise });
  return promise;
}

// Price of a price slot for a league, as the site reads it (vendor gems count as 1c).
export function price(slot, league) {
  if (!slot) return null;
  if (slot.isVendor) return 1;
  const v = slot.value?.[league];
  return typeof v === 'number' ? v : null;
}
export const conf = (slot, league) => (slot?.isVendor ? 'high' : slot?.confidence?.[league] ?? null);

// Short type label like the site's gem-type filter.
export function kind(r) {
  const m = r.metadata ?? {};
  if (m.transfigured) return 'transfigurada';
  if (m.awakened) return 'awakened';
  if (m.exceptional) return 'exceptional';
  return r.tags?.includes('support') ? 'suporte' : 'ativa';
}
