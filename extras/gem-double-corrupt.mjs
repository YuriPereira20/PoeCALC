// Gemas: dupla corrupcao no templo (Doryani's Institute). Porta o modelo de poe.how/economy/gem/double-corrupt:
// 2 corrupcoes distintas entre {nada, Vaal, nivel +-1, qualidade -10..+10}, cada uma 1/4 e a segunda 1/3 das restantes.
import { loadTab, price, conf, kind } from './_gems.mjs';
import { ninjaIcons } from './_lib.mjs';

export const title = 'Gemas: Dupla corrupção (templo)';
export const order = 86;
export const group = 'Gemas';

const OPS = ['noChange', 'vaal', 'level', 'quality'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const key = (s) => `${s.vaal ? 'vaal' : 'normal'}:${s.level}:${s.quality}`;
function step(s, op, maxLevel, hasVaal) {
  if (op === 'noChange') return [[1, s]];
  if (op === 'vaal') return [[1, hasVaal ? { ...s, vaal: true } : s]];
  if (op === 'level') return [[0.5, { ...s, level: clamp(s.level + 1, 1, maxLevel) }], [0.5, { ...s, level: clamp(s.level - 1, 1, maxLevel) }]];
  const out = [];
  for (let d = -10; d <= 10; d++) out.push([1 / 21, { ...s, quality: clamp(s.quality + d, 0, 23) }]);
  return out;
}
const distCache = new Map();
function dist(baseLevel, hasVaal) { // Map stateKey -> prob, starting from baseLevel/20 non-Vaal
  const ck = `${baseLevel}:${hasVaal}`;
  if (distCache.has(ck)) return distCache.get(ck);
  const m = new Map(), s0 = { level: baseLevel, quality: 20, vaal: false };
  for (const a of OPS) for (const [p1, s1] of step(s0, a, baseLevel + 1, hasVaal))
    for (const b of OPS) if (b !== a) for (const [p2, s2] of step(s1, b, baseLevel + 1, hasVaal))
      m.set(key(s2), (m.get(key(s2)) ?? 0) + 0.25 * p1 * (1 / 3) * p2);
  distCache.set(ck, m);
  return m;
}
function probWhere(baseLevel, hasVaal, pred) {
  let t = 0;
  for (const [k, p] of dist(baseLevel, hasVaal)) { const [v, l, q] = k.split(':'); if (pred({ vaal: v === 'vaal', level: +l, quality: +q })) t += p; }
  return t;
}
// "clarity-21-20c" -> {level:21, quality:20, vaal:false}; same parsing as the site
function parseId(id) {
  const t = id.trim().toLowerCase().replace(/c$/, ''), parts = t.split('-'), nums = [];
  while (parts.length && /^\d+$/.test(parts.at(-1))) nums.push(+parts.pop());
  if (!nums.length) return null;
  return nums.length === 1 ? { level: nums[0], quality: null, vaal: t.startsWith('vaal-') }
    : { level: nums.at(-1), quality: nums[0], vaal: t.startsWith('vaal-') };
}
const BASE_LEVEL = { awakened: 5, exceptional: 3, prime: 3, awakenedExceptional: 4, awakenedPrime: 4 };

export async function load(league) {
  const { records, supplementaryPrices: sp } = await loadTab('double-corrupt');
  const icons = await ninjaIcons(league, ['SkillGem']);
  const prism = price(sp.gemcuttersPrism, league);
  const rows = [];
  if (prism != null) for (const r of records) {
    const tdc = r.templeDoubleCorrupt;
    if (!tdc) continue;
    const base = price(r.baseGem, league), temple = price(tdc.templePrice, league);
    if (base == null || temple == null) continue;
    const quality = 20 * prism, cost = base + quality + temple, u = BASE_LEVEL[r.metadata?.gemClass] ?? 20;
    const contrib = [], seen = new Set();
    const add = (slot, defQ, label, prob, any) => {
      const p = price(slot, league);
      if (p == null || !slot.matchingDetailsId) return;
      const id = parseId(slot.matchingDetailsId);
      if (!id?.level) return;
      const s = { level: id.level, quality: id.quality ?? defQ, vaal: id.vaal };
      if (!any && !((s.level === u + 1 && s.quality >= 20) || (s.level === u && s.vaal && s.quality >= 20) || (s.level === u && s.quality > 20))) return;
      const k = key(s);
      if (seen.has(k)) return;
      const pr = prob ?? (dist(u, r.hasVaal).get(k) ?? 0);
      if (pr <= 0) return;
      seen.add(k);
      const auto = [s.level === u + 1 ? '+1 nível' : s.level === u - 1 ? '-1 nível' : '', s.quality !== 20 ? `${s.quality}% qual.` : '', s.vaal ? 'Vaal' : ''].filter(Boolean).join(' & ');
      contrib.push({ label: label ?? (auto || `${s.level}/${s.quality}`), pr, p, low: conf(slot, league) === 'low' });
    };
    let lvl = price(r.corruptLevel, league) != null ? r.corruptLevel : null;
    if (!lvl && price(r.corruptLevelQ, league) != null) { const q = r.corruptLevelQ.matchingDetailsId ? parseId(r.corruptLevelQ.matchingDetailsId) : null; if (q?.quality != null && q.quality <= 20) lvl = r.corruptLevelQ; }
    add(r.perfectGem, 23); add(r.perfectVaal, 20); add(r.corruptVaalQuality, 23);
    if (lvl) add(lvl, 20, `+1 nível`, probWhere(u, r.hasVaal, s => !s.vaal && s.level === u + 1 && s.quality <= 20), true);
    add(r.corruptQuality, 23); add(r.corruptVaal, 20);
    if (!contrib.length) continue;
    const ev = contrib.reduce((a, c) => a + c.pr * c.p, 0), profit = ev - cost;
    const sale = price(r.leveledQuality, league);
    rows.push({
      name: r.name, icon: icons.get(r.name), kind: kind(r), base, quality, temple, cost, sale, ev, profit,
      delta: sale == null ? null : profit - (sale - (base + quality)),
      roi: cost > 0 ? 100 * profit / cost : null,
      mix: contrib.map(c => `${c.label} ${(100 * c.pr).toFixed(2)}%: ${Math.round(c.p * 10) / 10}c`).join(' | '),
      conf: [conf(r.baseGem, league), conf(sp.gemcuttersPrism, league), conf(tdc.templePrice, league), sale != null ? conf(r.leveledQuality, league) : null].includes('low') || contrib.some(c => c.low) ? 'baixa' : 'ok',
    });
  }
  rows.sort((a, b) => b.profit - a.profit);
  return {
    note: 'Gema nv1 + 20 Gemcutter\'s Prism + sala Doryani\'s Institute (T3) para dupla corrupção. EV soma só resultados bons precificados (+1 nível, 23% qualidade, Vaal) com as chances do modelo do poe.how; o resto vale 0. Custo de upar a gema não entra (igual ao site). "Δ vs vender" compara com vender a 20/20 sem corromper. Sem preços para a liga Hardcore.',
    defaultSort: { key: 'profit', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Gema', type: 'text' },
      { key: 'kind', label: 'Tipo', type: 'text' },
      { key: 'base', label: 'Gema nv1', type: 'chaos' },
      { key: 'quality', label: '20 Prisms', type: 'chaos' },
      { key: 'temple', label: 'Templo', type: 'chaos' },
      { key: 'cost', label: 'Custo total', type: 'chaos' },
      { key: 'sale', label: 'Vender 20/20', type: 'chaos' },
      { key: 'ev', label: 'Receita esperada', type: 'chaos' },
      { key: 'profit', label: 'Lucro esperado', type: 'chaos' },
      { key: 'delta', label: 'Δ vs vender', type: 'chaos' },
      { key: 'roi', label: 'ROI', type: 'pct' },
      { key: 'mix', label: 'Resultados', type: 'text' },
      { key: 'conf', label: 'Confiança', type: 'text' },
    ],
    rows: rows.slice(0, 5000),
  };
}
