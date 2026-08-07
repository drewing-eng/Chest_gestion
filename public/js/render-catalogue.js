import { api } from './api.js';
import { esc } from './utils.js';
import { ICONS } from './icons.js';

let cachedCatalogue = [];

export async function renderCatalogue() {
  const list = document.getElementById('cat-list');
  try {
    cachedCatalogue = await api.getCatalogue();
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }
  filterCatalogue();
}

export function filterCatalogue() {
  const list = document.getElementById('cat-list');
  const q = (document.getElementById('cat-search').value || '').toLowerCase().trim();
  const items = cachedCatalogue.filter((i) => i.nom.toLowerCase().includes(q));
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">Aucun objet ne correspond.</div>`;
    return;
  }
  list.innerHTML = items
    .map(
      (i) => `
    <div class="cat-row">
      <div>
        <div class="cat-name">${esc(i.nom)}</div>
        ${i.description ? `<div class="cat-desc">${esc(i.description)}</div>` : ''}
        <span class="cat-max mono">max ${i.quantite_max} / emplacement</span>
      </div>
      <div class="cat-row-actions">
        <button class="icon-btn" style="color:var(--ink-soft)" onclick="openItemForm('${esc(i.id)}')" title="Modifier">${ICONS.edit}</button>
        <button class="icon-btn" onclick="confirmDeleteItem('${esc(i.id)}')" title="Supprimer">${ICONS.trash}</button>
      </div>
    </div>
  `
    )
    .join('');
}

window.filterCatalogue = filterCatalogue;
