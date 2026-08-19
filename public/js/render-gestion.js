import { api } from './api.js';
import { esc } from './utils.js';
import { ICONS } from './icons.js';

export let currentDetailCoffre = null;

export async function renderGestionList() {
  const grid = document.getElementById('coffre-grid');
  let coffres;
  try {
    coffres = await api.getCoffres();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }
  if (coffres.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${ICONS.chest}<div>Aucun coffre pour l'instant.<br>Créez-en un pour commencer.</div></div>`;
    return;
  }
  grid.innerHTML = coffres
    .map((c) => {
      const occupied = c.slots.filter(Boolean).length;
      const segs = c.slots.map((s) => `<span class="${s ? 'filled' : ''}"></span>`).join('');
      return `
      <button class="coffre-card" onclick="openCoffreDetail('${esc(c.nom)}')">
        <div class="coffre-icon">${ICONS.chest}</div>
        <h3>${esc(c.nom)}</h3>
        <div class="emplacement">${esc(c.emplacement || 'Emplacement non défini')}</div>
        ${c.description ? `<div class="description">${esc(c.description)}</div>` : ''}
        <div class="fill-row">
          <div class="fill-segments">${segs}</div>
          <div class="fill-count">${occupied}/${c.slotsCount}</div>
        </div>
      </button>`;
    })
    .join('');
}

export function openCoffreDetail(nom) {
  currentDetailCoffre = nom;
  document.getElementById('gestion-list-view').hidden = true;
  const detail = document.getElementById('gestion-detail-view');
  detail.hidden = false;
  renderCoffreDetail();
}

export function closeCoffreDetail() {
  currentDetailCoffre = null;
  document.getElementById('gestion-list-view').hidden = false;
  document.getElementById('gestion-detail-view').hidden = true;
  renderGestionList();
}

export async function renderCoffreDetail() {
  if (!currentDetailCoffre) return;
  const detail = document.getElementById('gestion-detail-view');

  let coffres, catalogue;
  try {
    [coffres, catalogue] = await Promise.all([api.getCoffres(), api.getCatalogue()]);
  } catch (err) {
    detail.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }

  const c = coffres.find((x) => x.nom === currentDetailCoffre);
  if (!c) {
    closeCoffreDetail();
    return;
  }
  const itemById = (id) => catalogue.find((i) => i.id === id);

  const slotsHtml = c.slots
    .map((s, idx) => {
      if (!s) {
        return `
        <div class="slot-row">
          <div class="slot-top">
            <div>
              <div class="slot-label">Emplacement ${idx + 1}</div>
              <div class="slot-empty-text">Libre</div>
            </div>
          </div>
          <div class="slot-actions">
            <button class="btn btn-ghost btn-sm btn-block" onclick="openAddToSlot('${esc(c.nom)}', ${idx})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter un objet
            </button>
          </div>
        </div>`;
      }
      const item = itemById(s.itemId);
      const max = item ? item.quantite_max : s.quantite;
      const pct = Math.min(100, (s.quantite / max) * 100);
      const over = s.quantite > max;
      return `
      <div class="slot-row">
        <div class="slot-top">
          <div>
            <div class="slot-label">Emplacement ${idx + 1}</div>
            <div class="slot-item-name">${esc(item ? item.nom : s.itemId)}</div>
          </div>
          <div class="slot-qty ${over ? 'over' : ''}">${s.quantite} / ${max}</div>
        </div>
        <div class="slot-bar"><div class="${over ? 'over' : ''}" style="width:${pct}%"></div></div>
        ${over ? `<div class="slot-warning">${ICONS.warn} Dépasse le maximum autorisé</div>` : ''}
        <div class="slot-actions">
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openAddToSlot('${esc(c.nom)}', ${idx})">Ajouter</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openRemoveFromSlot('${esc(c.nom)}', ${idx})">Retirer</button>
        </div>
      </div>`;
    })
    .join('');

  detail.innerHTML = `
    <button class="detail-back" onclick="closeCoffreDetail()">${ICONS.back} Retour</button>
    <div class="detail-header">
      <div class="top-row">
        <div>
          <h2>${esc(c.nom)}</h2>
          <div class="meta">${esc(c.emplacement || 'Emplacement non défini')} · ${c.slotsCount} emplacement${c.slotsCount > 1 ? 's' : ''}</div>
          ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ''}
        </div>
        <div class="detail-actions">
          <button class="icon-btn" style="color:var(--ink-soft)" onclick="openCoffreForm('${esc(c.nom)}')" title="Modifier">${ICONS.edit}</button>
          <button class="icon-btn" onclick="confirmDeleteCoffre('${esc(c.nom)}')" title="Supprimer">${ICONS.trash}</button>
        </div>
      </div>
    </div>
    <div class="slot-list">${slotsHtml}</div>
  `;
}

window.openCoffreDetail = openCoffreDetail;
window.closeCoffreDetail = closeCoffreDetail;
