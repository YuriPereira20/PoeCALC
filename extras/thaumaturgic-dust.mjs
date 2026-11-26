import { trpc } from './_lib.mjs';

export const title = 'Thaumaturgic Dust';
export const order = 50;
export const group = 'Itens';

export async function load(league) {
  const rows = [];
  let page = 1, last = 1;
  do {
    const r = await trpc('thaumaturgicDust.list', { league, query: '', quality: 20, minListings: 3, includeJewellery: true, includeCorrupted: false, page, pageSize: 100 });
    last = r.totalPages;
    rows.push(...r.items.map((x) => ({
      icon: x.marketVariant?.icon ?? null,
      name: x.item.name ?? null,
      base: x.item.baseType ?? null,
      cls: x.item.itemClass ?? null,
      slots: x.item.inventorySlots ?? null,
      cost: x.totalChaosCost ?? null,
      listings: x.listingCount ?? null,
      dust: x.selectedDust ?? null,
      dpc: x.dustPerChaos ?? null,
      dpcs: x.dustPerChaosPerSlot ?? null,
    })));
  } while (++page <= last);
  return {
    note: 'Únicos para comprar e desencantar em Kingsmarch (item level 84, qualidade 20%).',
    defaultSort: { key: 'dpc', dir: 'desc' },
    columns: [
      { key: 'name', label: 'Item', type: 'text' },
      { key: 'base', label: 'Base', type: 'text' },
      { key: 'cls', label: 'Classe', type: 'text' },
      { key: 'slots', label: 'Slots', type: 'int' },
      { key: 'cost', label: 'Custo', type: 'chaos' },
      { key: 'listings', label: 'Anúncios', type: 'int' },
      { key: 'dust', label: 'Dust', type: 'int' },
      { key: 'dpc', label: 'Dust/chaos', type: 'num' },
      { key: 'dpcs', label: 'Dust/chaos/slot', type: 'num' },
    ],
    rows,
  };
}
