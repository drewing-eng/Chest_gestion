import { api } from './api.js';
import { esc } from './utils.js';

export async function renderProduction() {
  const list = document.getElementById('production-list');
  let coffres, catalogue;
  try {
    [coffres, catalogue] = await Promise.all([api.getCoffres(), api.getCatalogue()]);
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }

  const itemById = (id) => catalogue.find((i) => i.id === id);
  const needed = new Map();
  coffres.forEach((c) => {
    c.slots.forEach((s) => {
      if (!s) return;
      const item = itemById(s.itemId);
      if (!item) return;
      const missing = item.quantite_max - s.quantite;
      if (missing <= 0) return;
      needed.set(item.id, (needed.get(item.id) || 0) + missing);
    });
  });

  if (needed.size === 0) {
    list.innerHTML = `<div class="empty-state">Tous les emplacements occupés sont à leur maximum. Rien à produire.</div>`;
    return;
  }

  const rows = [...needed.entries()]
    .map(([itemId, quantite]) => ({ item: itemById(itemId), quantite }))
    .sort((a, b) => b.quantite - a.quantite);

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="cat-row">
      <div class="cat-name">${esc(r.item.nom)}</div>
      <span class="cat-max mono">${r.quantite} à produire</span>
    </div>
  `
    )
    .join('');
}
