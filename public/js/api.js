const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || 'Une erreur est survenue.');
  }
  return data;
}

export const api = {
  getCatalogue: () => request('/catalogue'),
  createCatalogueItem: (body) => request('/catalogue', { method: 'POST', body: JSON.stringify(body) }),
  updateCatalogueItem: (id, body) =>
    request(`/catalogue/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCatalogueItem: (id) => request(`/catalogue/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getJournal: () => request('/journal'),
  createJournalEntry: (body) => request('/journal', { method: 'POST', body: JSON.stringify(body) }),
  deleteJournalEntry: (id) => request(`/journal/${id}`, { method: 'DELETE' }),

  getCoffres: () => request('/coffres'),
};
