import { api } from './api.js';
import { esc } from './utils.js';
import { ICONS } from './icons.js';

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="overlay" onclick="if(event.target===this) closeModal()"><div class="modal">${html}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function showFormError(boxId, message) {
  const box = document.getElementById(boxId);
  box.textContent = message;
  box.classList.add('show');
}

/* ---------- Coffre : créer / modifier ---------- */

async function openCoffreForm(nomExistant) {
  const editing = !!nomExistant;
  let coffres;
  try {
    coffres = await api.getCoffres();
  } catch (err) {
    alert(err.message);
    return;
  }
  const c = editing ? coffres.find((x) => x.nom === nomExistant) : null;
  if (editing && !c) return;
  const emplacements = [...new Set(coffres.map((x) => x.emplacement).filter(Boolean))];

  openModal(`
    <h3>${editing ? 'Modifier le coffre' : 'Nouveau coffre'}</h3>
    <div class="modal-sub">${editing ? 'Le nom ne peut pas être modifié : il identifie le coffre dans le journal.' : 'Trois emplacements par défaut, ajustable via "Avancé".'}</div>
    <div class="form-error" id="coffre-form-error"></div>
    <div class="field">
      <label>Nom</label>
      <input type="text" id="cf-nom" value="${editing ? esc(c.nom) : ''}" ${editing ? 'disabled' : ''} placeholder="Ex. Coffre du Nord">
    </div>
    <div class="field">
      <label>Description (optionnelle)</label>
      <textarea id="cf-desc">${editing ? esc(c.description) : ''}</textarea>
    </div>
    <div class="field">
      <label>Emplacement</label>
      <select id="cf-emplacement-select" onchange="document.getElementById('cf-emplacement-new').style.display = this.value==='__new__' ? 'block' : 'none'">
        ${emplacements.map((e) => `<option value="${esc(e)}" ${editing && c.emplacement === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
        <option value="__new__" ${editing && !emplacements.includes(c.emplacement) ? 'selected' : ''}>+ Nouvel emplacement…</option>
      </select>
      <input type="text" id="cf-emplacement-new" placeholder="Nom du nouvel emplacement" style="margin-top:8px; display:${!editing || !emplacements.includes(c?.emplacement) ? 'block' : 'none'}" value="${editing && !emplacements.includes(c.emplacement) ? esc(c.emplacement) : ''}">
    </div>
    <button class="advanced-toggle" id="adv-toggle" onclick="toggleAdvanced()">${ICONS.chevron} Avancé — nombre d'emplacements</button>
    <div class="field" id="adv-slots" style="display:${editing && c.slotsCount !== 3 ? 'block' : 'none'}">
      <label>Nombre d'emplacements</label>
      <input type="number" id="cf-slots" min="1" max="12" value="${editing ? c.slotsCount : 3}">
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitCoffreForm(${editing ? `'${esc(nomExistant)}'` : 'null'})">${editing ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);

  if (editing && c.slotsCount !== 3) {
    document.getElementById('adv-toggle').classList.add('open');
  }
}

function toggleAdvanced() {
  const el = document.getElementById('adv-slots');
  const btn = document.getElementById('adv-toggle');
  const show = el.style.display === 'none';
  el.style.display = show ? 'block' : 'none';
  btn.classList.toggle('open', show);
}

async function submitCoffreForm(nomExistant) {
  const editing = !!nomExistant;
  const nom = editing ? nomExistant : document.getElementById('cf-nom').value.trim();
  const description = document.getElementById('cf-desc').value.trim();
  const empSelect = document.getElementById('cf-emplacement-select').value;
  const emplacement = empSelect === '__new__' ? document.getElementById('cf-emplacement-new').value.trim() : empSelect;
  const slotsVisible = document.getElementById('adv-slots').style.display !== 'none';
  const nb_emplacements = slotsVisible ? parseInt(document.getElementById('cf-slots').value, 10) : undefined;

  if (!nom) return showFormError('coffre-form-error', 'Le nom est obligatoire.');
  if (!emplacement) return showFormError('coffre-form-error', "L'emplacement est obligatoire.");

  const body = { type: editing ? 'UPDATE_COFFRE' : 'CREATE_COFFRE', coffre_nom: nom, description, emplacement };
  if (nb_emplacements !== undefined) body.nb_emplacements = nb_emplacements;

  try {
    await api.createJournalEntry(body);
  } catch (err) {
    showFormError('coffre-form-error', err.message);
    return;
  }

  closeModal();
  window.renderAll();
}

/* ---------- Suppression d'un coffre ---------- */

async function confirmDeleteCoffre(nom) {
  let coffres;
  try {
    coffres = await api.getCoffres();
  } catch (err) {
    alert(err.message);
    return;
  }
  const c = coffres.find((x) => x.nom === nom);
  if (!c) return;
  const occupied = c.slots.some(Boolean);
  openModal(`
    <div class="confirm-icon">${ICONS.warn}</div>
    <h3>Supprimer « ${esc(nom)} » ?</h3>
    <div class="modal-sub">
      ${occupied
        ? "Ce coffre et tout ce qu'il contient vont être supprimés. Voulez-vous déplacer ces objets dans un nouveau coffre avant de continuer ?"
        : 'Ce coffre est vide. Cette action est enregistrée dans le journal et peut être annulée en supprimant la ligne correspondante.'}
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="deleteCoffre('${esc(nom)}')">${occupied ? 'Supprimer quand même' : 'Supprimer'}</button>
    </div>
  `);
}

async function deleteCoffre(nom) {
  try {
    await api.createJournalEntry({ type: 'REMOVE_COFFRE', coffre_nom: nom });
  } catch (err) {
    alert(err.message);
    return;
  }
  closeModal();
  window.closeCoffreDetail();
}

/* ---------- Ajouter / retirer un objet d'un emplacement ---------- */

let pickerCatalogue = [];
let pickerSelectedItemId = null;

async function openAddToSlot(coffreNom, slotIdx) {
  let coffres;
  try {
    coffres = await api.getCoffres();
  } catch (err) {
    alert(err.message);
    return;
  }
  const c = coffres.find((x) => x.nom === coffreNom);
  if (!c) return;
  const current = c.slots[slotIdx];
  pickerSelectedItemId = current ? current.itemId : null;

  if (current) {
    let catalogue;
    try {
      catalogue = await api.getCatalogue();
    } catch (err) {
      alert(err.message);
      return;
    }
    const item = catalogue.find((i) => i.id === current.itemId);
    openModal(`
      <h3>Ajouter à l'emplacement ${slotIdx + 1}</h3>
      <div class="modal-sub">${esc(c.nom)}</div>
      <div class="selected-item-chip">
        <span><b>${esc(item ? item.nom : current.itemId)}</b> — actuellement ${current.quantite} / ${item ? item.quantite_max : '?'}</span>
      </div>
      <div class="form-error" id="slot-form-error"></div>
      <div class="field">
        <label>Quantité à ajouter</label>
        <input type="number" id="slot-qty" min="1" value="1">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="submitAddToSlot('${esc(coffreNom)}', ${slotIdx})">Ajouter</button>
      </div>
    `);
  } else {
    try {
      pickerCatalogue = await api.getCatalogue();
    } catch (err) {
      alert(err.message);
      return;
    }
    openModal(`
      <h3>Ajouter à l'emplacement ${slotIdx + 1}</h3>
      <div class="modal-sub">${esc(c.nom)} — choisissez un objet du catalogue</div>
      <div class="field">
        <input type="text" id="picker-search" placeholder="Rechercher…" oninput="renderItemPicker()">
      </div>
      <div class="item-picker" id="item-picker"></div>
      <div class="form-error" id="slot-form-error" style="margin-top:12px;"></div>
      <div class="field" style="margin-top:12px;">
        <label>Quantité</label>
        <input type="number" id="slot-qty" min="1" value="1">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="submitAddToSlot('${esc(coffreNom)}', ${slotIdx})">Ajouter</button>
      </div>
    `);
    renderItemPicker();
  }
}

function renderItemPicker() {
  const box = document.getElementById('item-picker');
  const q = (document.getElementById('picker-search').value || '').toLowerCase().trim();
  const items = pickerCatalogue.filter((i) => i.nom.toLowerCase().includes(q));
  if (items.length === 0) {
    box.innerHTML = `<div class="item-picker-row">Aucun objet trouvé</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (i) => `
    <div class="item-picker-row ${pickerSelectedItemId === i.id ? 'selected' : ''}" onclick="selectPickerItem('${esc(i.id)}')">
      <span>${esc(i.nom)}</span>
      <span class="max-tag">max ${i.quantite_max}</span>
    </div>
  `
    )
    .join('');
}

function selectPickerItem(id) {
  pickerSelectedItemId = id;
  renderItemPicker();
}

async function submitAddToSlot(coffreNom, slotIdx) {
  const qty = parseInt(document.getElementById('slot-qty').value, 10);
  if (!pickerSelectedItemId) return showFormError('slot-form-error', 'Choisissez un objet.');
  if (!qty || qty < 1) return showFormError('slot-form-error', 'Indiquez une quantité valide.');

  try {
    await api.createJournalEntry({
      type: 'IN',
      coffre_nom: coffreNom,
      emplacement_index: slotIdx,
      item_id: pickerSelectedItemId,
      quantite: qty,
    });
  } catch (err) {
    showFormError('slot-form-error', err.message);
    return;
  }
  closeModal();
  window.renderAll();
}

async function openRemoveFromSlot(coffreNom, slotIdx) {
  let coffres, catalogue;
  try {
    [coffres, catalogue] = await Promise.all([api.getCoffres(), api.getCatalogue()]);
  } catch (err) {
    alert(err.message);
    return;
  }
  const c = coffres.find((x) => x.nom === coffreNom);
  if (!c) return;
  const current = c.slots[slotIdx];
  if (!current) return;
  const item = catalogue.find((i) => i.id === current.itemId);

  openModal(`
    <h3>Retirer de l'emplacement ${slotIdx + 1}</h3>
    <div class="modal-sub">${esc(c.nom)} — ${esc(item ? item.nom : current.itemId)} (${current.quantite} présents)</div>
    <div class="form-error" id="slot-form-error"></div>
    <div class="field">
      <label>Quantité à retirer</label>
      <input type="number" id="slot-qty" min="1" max="${current.quantite}" value="${current.quantite}">
    </div>
    <button class="btn btn-ghost btn-sm" onclick="document.getElementById('slot-qty').value=${current.quantite}">Retirer tout</button>
    <div class="form-actions" style="margin-top:14px;">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="submitRemoveFromSlot('${esc(coffreNom)}', ${slotIdx})">Retirer</button>
    </div>
  `);
}

async function submitRemoveFromSlot(coffreNom, slotIdx) {
  const qty = parseInt(document.getElementById('slot-qty').value, 10);
  if (!qty || qty < 1) return showFormError('slot-form-error', 'Quantité invalide.');

  try {
    await api.createJournalEntry({ type: 'OUT', coffre_nom: coffreNom, emplacement_index: slotIdx, quantite: qty });
  } catch (err) {
    showFormError('slot-form-error', err.message);
    return;
  }
  closeModal();
  window.renderAll();
}

/* ---------- Catalogue : créer / modifier / supprimer ---------- */

async function openItemForm(itemId) {
  const editing = !!itemId;
  let item = null;
  if (editing) {
    try {
      const catalogue = await api.getCatalogue();
      item = catalogue.find((i) => i.id === itemId);
    } catch (err) {
      alert(err.message);
      return;
    }
    if (!item) return;
  }
  openModal(`
    <h3>${editing ? "Modifier l'objet" : 'Nouvel objet'}</h3>
    <div class="form-error" id="item-form-error"></div>
    <div class="field">
      <label>Nom</label>
      <input type="text" id="it-nom" value="${editing ? esc(item.nom) : ''}" placeholder="Ex. Bois de chêne">
    </div>
    <div class="field">
      <label>Description (optionnelle)</label>
      <textarea id="it-desc">${editing ? esc(item.description) : ''}</textarea>
    </div>
    <div class="field">
      <label>Quantité maximale par emplacement</label>
      <input type="number" id="it-max" min="1" value="${editing ? item.quantite_max : ''}">
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitItemForm(${editing ? `'${esc(itemId)}'` : 'null'})">${editing ? 'Enregistrer' : 'Créer'}</button>
    </div>
  `);
}

async function submitItemForm(itemId) {
  const editing = !!itemId;
  const nom = document.getElementById('it-nom').value.trim();
  const description = document.getElementById('it-desc').value.trim();
  const quantite_max = parseInt(document.getElementById('it-max').value, 10);

  if (!nom) return showFormError('item-form-error', 'Le nom est obligatoire.');
  if (!quantite_max || quantite_max < 1) return showFormError('item-form-error', 'Indiquez un maximum valide.');

  try {
    if (editing) {
      await api.updateCatalogueItem(itemId, { nom, description, quantite_max });
    } else {
      await api.createCatalogueItem({ nom, description, quantite_max });
    }
  } catch (err) {
    showFormError('item-form-error', err.message);
    return;
  }
  closeModal();
  window.renderAll();
}

async function confirmDeleteItem(itemId) {
  let catalogue;
  try {
    catalogue = await api.getCatalogue();
  } catch (err) {
    alert(err.message);
    return;
  }
  const item = catalogue.find((i) => i.id === itemId);
  if (!item) return;

  openModal(`
    <div class="confirm-icon">${ICONS.warn}</div>
    <h3>Supprimer « ${esc(item.nom)} » du catalogue ?</h3>
    <div class="modal-sub">Cette action est immédiate et n'est pas historisée dans le journal.</div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
      <button class="btn btn-danger" onclick="deleteItem('${esc(itemId)}')">Supprimer</button>
    </div>
  `);
}

async function deleteItem(itemId) {
  try {
    await api.deleteCatalogueItem(itemId);
  } catch (err) {
    openModal(`
      <div class="confirm-icon">${ICONS.warn}</div>
      <h3>Impossible de supprimer</h3>
      <div class="modal-sub">${esc(err.message)}</div>
      <div class="form-actions">
        <button class="btn btn-primary btn-block" onclick="closeModal()">Compris</button>
      </div>
    `);
    return;
  }
  closeModal();
  window.renderAll();
}

/* ---------- Catalogue : import JSON ---------- */

function openImportForm() {
  openModal(`
    <h3>Importer un catalogue JSON</h3>
    <div class="modal-sub">Un tableau d'objets avec les champs <code>nom</code>, <code>description</code> (optionnelle) et <code>quantite_max</code>. Un objet dont le nom existe déjà dans le catalogue est mis à jour.</div>
    <div class="form-error" id="import-form-error"></div>
    <div class="field">
      <label>Fichier JSON</label>
      <input type="file" id="import-file" accept="application/json,.json">
    </div>
    <div id="import-result"></div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Fermer</button>
      <button class="btn btn-primary" onclick="submitImportForm()">Importer</button>
    </div>
  `);
}

async function submitImportForm() {
  const input = document.getElementById('import-file');
  const file = input.files[0];
  if (!file) return showFormError('import-form-error', 'Choisissez un fichier.');

  let items;
  try {
    items = JSON.parse(await file.text());
  } catch (err) {
    return showFormError('import-form-error', 'Fichier JSON invalide.');
  }
  if (!Array.isArray(items)) return showFormError('import-form-error', 'Le fichier doit contenir un tableau JSON.');

  let result;
  try {
    result = await api.importCatalogue(items);
  } catch (err) {
    showFormError('import-form-error', err.message);
    return;
  }

  document.getElementById('import-result').innerHTML = `
    <div class="modal-sub">
      ${result.created.length} créé(s), ${result.updated.length} mis à jour, ${result.skipped.length} ignoré(s).
      ${result.skipped.length ? `<ul>${result.skipped.map((s) => `<li>${esc(s.nom)} — ${esc(s.reason)}</li>`).join('')}</ul>` : ''}
    </div>
  `;
  window.renderAll();
}

Object.assign(window, {
  closeModal,
  openCoffreForm,
  toggleAdvanced,
  submitCoffreForm,
  confirmDeleteCoffre,
  deleteCoffre,
  openAddToSlot,
  renderItemPicker,
  selectPickerItem,
  submitAddToSlot,
  openRemoveFromSlot,
  submitRemoveFromSlot,
  openItemForm,
  submitItemForm,
  confirmDeleteItem,
  deleteItem,
  openImportForm,
  submitImportForm,
});
