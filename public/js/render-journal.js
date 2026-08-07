import { api } from './api.js';
import { esc, fmtDate } from './utils.js';
import { ICONS } from './icons.js';

export async function renderJournal() {
  const list = document.getElementById('journal-list');
  let entries;
  try {
    entries = await api.getJournal();
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">${ICONS.chest}<div>Aucune opération enregistrée.</div></div>`;
    return;
  }

  let catalogue = [];
  try {
    catalogue = await api.getCatalogue();
  } catch {
    /* le journal reste affichable même si le catalogue est indisponible */
  }
  const itemById = (id) => catalogue.find((i) => i.id === id);

  const ordered = [...entries].sort((a, b) => b.id - a.id);
  list.innerHTML = ordered
    .map((e) => {
      let nodeClass, tagClass, tagLabel, body;
      if (e.type === 'IN' || e.type === 'OUT') {
        const item = itemById(e.item_id);
        nodeClass = e.type === 'IN' ? 'in' : 'out';
        tagClass = nodeClass;
        tagLabel = e.type === 'IN' ? 'ENTRÉE' : 'SORTIE';
        body = `<b>${esc(item ? item.nom : e.item_id)}</b> — ${e.quantite}
        <div class="sub">${esc(e.coffre_nom)} · emplacement ${e.emplacement_index + 1}</div>`;
      } else {
        nodeClass = 'coffre';
        tagClass = 'coffre';
        const labels = { CREATE_COFFRE: 'CRÉATION', UPDATE_COFFRE: 'MODIFICATION', REMOVE_COFFRE: 'SUPPRESSION' };
        tagLabel = labels[e.type] || e.type;
        body =
          `<b>${esc(e.coffre_nom)}</b>` +
          (e.type !== 'REMOVE_COFFRE'
            ? `<div class="sub">${esc(e.emplacement || '—')} · ${e.nb_emplacements} emplacement${e.nb_emplacements > 1 ? 's' : ''}${e.description ? ' · ' + esc(e.description) : ''}</div>`
            : '');
      }
      const nodeLabel = { IN: 'IN', OUT: 'OUT', CREATE_COFFRE: 'CR', UPDATE_COFFRE: 'MJ', REMOVE_COFFRE: 'RM' }[e.type];
      return `
      <div class="chain-entry">
        <div class="chain-node ${nodeClass}">${nodeLabel}</div>
        <div class="chain-card">
          <div class="top-row">
            <span class="chain-tag ${tagClass}">${tagLabel}</span>
            <span class="chain-time mono">${fmtDate(e.horodatage)}</span>
          </div>
          <div class="chain-body">${body}</div>
          <div style="text-align:right; margin-top:4px;">
            <button class="icon-btn" onclick="deleteJournalEntry(${e.id})" title="Supprimer cette ligne">${ICONS.trash}</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

export async function deleteJournalEntry(id) {
  if (
    !confirm(
      "Supprimer cette ligne du journal ? Cette action est irréversible et recalculera l'état de tous les coffres concernés."
    )
  )
    return;
  try {
    await api.deleteJournalEntry(id);
  } catch (err) {
    alert(err.message);
    return;
  }
  window.renderAll();
}

window.deleteJournalEntry = deleteJournalEntry;
