import { renderGestionList, renderCoffreDetail, openCoffreDetail, closeCoffreDetail } from './render-gestion.js';
import { renderJournal } from './render-journal.js';
import { renderCatalogue } from './render-catalogue.js';
import './modals.js';

window.openCoffreDetail = openCoffreDetail;
window.closeCoffreDetail = closeCoffreDetail;

async function renderAll() {
  await Promise.all([renderGestionList(), renderCoffreDetail(), renderJournal(), renderCatalogue()]);
}
window.renderAll = renderAll;

document.querySelectorAll('nav.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  renderAll();
}

renderAll();
