/* Worker Coffre — routeur API + assets statiques.
   Aucune table "coffres" en base : leur état est recalculé à la volée
   en rejouant le journal (event sourcing, cf. PRD §5.2/§6.3). */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, url, env);
      } catch (err) {
        console.error(err);
        return json({ error: 'Erreur serveur inattendue.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

/* ---------- réponses ---------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

/* ---------- routeur ---------- */

async function handleApi(request, url, env) {
  const { pathname } = url;
  const method = request.method;
  const db = env.DB;

  if (pathname === '/api/catalogue' && method === 'GET') return listCatalogue(db);
  if (pathname === '/api/catalogue' && method === 'POST') return createCatalogueItem(db, request);

  const catMatch = pathname.match(/^\/api\/catalogue\/([^/]+)$/);
  if (catMatch && method === 'PUT') return updateCatalogueItem(db, catMatch[1], request);
  if (catMatch && method === 'DELETE') return deleteCatalogueItem(db, catMatch[1]);

  if (pathname === '/api/journal' && method === 'GET') return listJournal(db);
  if (pathname === '/api/journal' && method === 'POST') return createJournalEntry(db, request);

  const journalMatch = pathname.match(/^\/api\/journal\/(\d+)$/);
  if (journalMatch && method === 'DELETE') return deleteJournalEntry(db, Number(journalMatch[1]));

  if (pathname === '/api/coffres' && method === 'GET') return listCoffres(db);

  return errorResponse('Route inconnue.', 404);
}

/* ---------- accès D1 ---------- */

async function getJournal(db) {
  const { results } = await db.prepare('SELECT * FROM journal ORDER BY id ASC').all();
  return results;
}

async function insertJournalRow(db, row) {
  const horodatage = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO journal (horodatage, type, coffre_nom, description, emplacement, nb_emplacements, emplacement_index, item_id, quantite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      horodatage,
      row.type,
      row.coffre_nom,
      row.description ?? null,
      row.emplacement ?? null,
      row.nb_emplacements ?? null,
      row.emplacement_index ?? null,
      row.item_id ?? null,
      row.quantite ?? null
    )
    .run();
  return { id: result.meta.last_row_id, horodatage, ...row };
}

/* ---------- recalcul de l'état dérivé (PRD §6.3) ---------- */

function computeCoffres(journalRows) {
  const map = new Map();
  for (const e of journalRows) {
    if (e.type === 'CREATE_COFFRE') {
      map.set(e.coffre_nom, {
        nom: e.coffre_nom,
        description: e.description || '',
        emplacement: e.emplacement,
        slotsCount: e.nb_emplacements,
        slots: Array(e.nb_emplacements).fill(null),
        removed: false,
      });
    } else if (e.type === 'UPDATE_COFFRE') {
      const c = map.get(e.coffre_nom);
      if (!c) continue;
      c.description = e.description || '';
      c.emplacement = e.emplacement;
      if (e.nb_emplacements > c.slotsCount) {
        c.slots = c.slots.concat(Array(e.nb_emplacements - c.slotsCount).fill(null));
      } else if (e.nb_emplacements < c.slotsCount) {
        c.slots = c.slots.slice(0, e.nb_emplacements);
      }
      c.slotsCount = e.nb_emplacements;
    } else if (e.type === 'REMOVE_COFFRE') {
      const c = map.get(e.coffre_nom);
      if (c) c.removed = true;
    } else if (e.type === 'IN') {
      const c = map.get(e.coffre_nom);
      if (!c) continue;
      const slot = c.slots[e.emplacement_index];
      if (slot && slot.itemId === e.item_id) {
        slot.quantite += e.quantite;
      } else if (!slot) {
        c.slots[e.emplacement_index] = { itemId: e.item_id, quantite: e.quantite };
      }
    } else if (e.type === 'OUT') {
      const c = map.get(e.coffre_nom);
      if (!c) continue;
      const slot = c.slots[e.emplacement_index];
      if (slot) {
        slot.quantite -= e.quantite;
        if (slot.quantite <= 0) c.slots[e.emplacement_index] = null;
      }
    }
  }
  return [...map.values()].filter((c) => !c.removed);
}

function isItemUsedAnywhere(coffres, itemId) {
  return coffres.some((c) => c.slots.some((s) => s && s.itemId === itemId));
}

function maxQuantityUsedFor(coffres, itemId) {
  let max = 0;
  coffres.forEach((c) =>
    c.slots.forEach((s) => {
      if (s && s.itemId === itemId) max = Math.max(max, s.quantite);
    })
  );
  return max;
}

/* ---------- catalogue ---------- */

async function listCatalogue(db) {
  const { results } = await db
    .prepare('SELECT id, nom, description, quantite_max FROM catalogue ORDER BY nom')
    .all();
  return json(results);
}

async function createCatalogueItem(db, request) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Corps de requête invalide.');

  const nom = (body.nom || '').trim();
  const description = (body.description || '').trim();
  const max = Number(body.quantite_max);

  if (!nom) return errorResponse('Le nom est obligatoire.');
  if (!Number.isInteger(max) || max < 1) return errorResponse('Indiquez un maximum valide.');

  const dup = await db.prepare('SELECT id FROM catalogue WHERE lower(nom) = lower(?)').bind(nom).first();
  if (dup) return errorResponse('Ce nom d’objet est déjà utilisé.');

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO catalogue (id, nom, description, quantite_max) VALUES (?, ?, ?, ?)')
    .bind(id, nom, description, max)
    .run();

  return json({ id, nom, description, quantite_max: max }, 201);
}

async function updateCatalogueItem(db, id, request) {
  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Corps de requête invalide.');

  const existingItem = await db.prepare('SELECT id FROM catalogue WHERE id = ?').bind(id).first();
  if (!existingItem) return errorResponse('Objet introuvable.', 404);

  const nom = (body.nom || '').trim();
  const description = (body.description || '').trim();
  const max = Number(body.quantite_max);

  if (!nom) return errorResponse('Le nom est obligatoire.');
  if (!Number.isInteger(max) || max < 1) return errorResponse('Indiquez un maximum valide.');

  const dup = await db
    .prepare('SELECT id FROM catalogue WHERE lower(nom) = lower(?) AND id != ?')
    .bind(nom, id)
    .first();
  if (dup) return errorResponse('Ce nom d’objet est déjà utilisé.');

  const coffres = computeCoffres(await getJournal(db));
  const usedMax = maxQuantityUsedFor(coffres, id);
  if (max < usedMax) {
    return errorResponse(
      `Impossible : ${usedMax} unités de cet objet sont déjà présentes dans un même emplacement. Répartissez la quantité dans les coffres avant d'abaisser ce maximum.`
    );
  }

  await db
    .prepare('UPDATE catalogue SET nom = ?, description = ?, quantite_max = ? WHERE id = ?')
    .bind(nom, description, max, id)
    .run();

  return json({ id, nom, description, quantite_max: max });
}

async function deleteCatalogueItem(db, id) {
  const item = await db.prepare('SELECT id FROM catalogue WHERE id = ?').bind(id).first();
  if (!item) return errorResponse('Objet introuvable.', 404);

  const coffres = computeCoffres(await getJournal(db));
  if (isItemUsedAnywhere(coffres, id)) {
    return errorResponse('Veuillez supprimer tous les objets associés dans les coffres avant de le supprimer.');
  }

  await db.prepare('DELETE FROM catalogue WHERE id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}

/* ---------- journal ---------- */

async function listJournal(db) {
  return json(await getJournal(db));
}

async function deleteJournalEntry(db, id) {
  await db.prepare('DELETE FROM journal WHERE id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}

async function createJournalEntry(db, request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.type) return errorResponse('Corps de requête invalide.');

  const coffres = computeCoffres(await getJournal(db));

  switch (body.type) {
    case 'CREATE_COFFRE':
      return handleCreateCoffre(db, coffres, body);
    case 'UPDATE_COFFRE':
      return handleUpdateCoffre(db, coffres, body);
    case 'REMOVE_COFFRE':
      return handleRemoveCoffre(db, coffres, body);
    case 'IN':
      return handleIn(db, coffres, body);
    case 'OUT':
      return handleOut(db, coffres, body);
    default:
      return errorResponse('Type d’opération inconnu.');
  }
}

async function handleCreateCoffre(db, coffres, body) {
  const nom = (body.coffre_nom || '').trim();
  const description = (body.description || '').trim();
  const emplacement = (body.emplacement || '').trim();
  const nbEmplacements = Number.isInteger(body.nb_emplacements) ? body.nb_emplacements : 3;

  if (!nom) return errorResponse('Le nom est obligatoire.');
  if (!emplacement) return errorResponse("L'emplacement est obligatoire.");
  if (!nbEmplacements || nbEmplacements < 1)
    return errorResponse("Le nombre d'emplacements doit être d'au moins 1.");

  const exists = coffres.some((c) => c.nom.toLowerCase() === nom.toLowerCase());
  if (exists) return errorResponse('Ce nom de coffre est déjà utilisé.');

  const row = await insertJournalRow(db, {
    type: 'CREATE_COFFRE',
    coffre_nom: nom,
    description,
    emplacement,
    nb_emplacements: nbEmplacements,
  });
  return json(row, 201);
}

async function handleUpdateCoffre(db, coffres, body) {
  const nom = (body.coffre_nom || '').trim();
  const c = coffres.find((x) => x.nom === nom);
  if (!c) return errorResponse('Coffre introuvable.', 404);

  const description = (body.description || '').trim();
  const emplacement = (body.emplacement || '').trim();
  const nbEmplacements = Number.isInteger(body.nb_emplacements) ? body.nb_emplacements : c.slotsCount;

  if (!emplacement) return errorResponse("L'emplacement est obligatoire.");
  if (!nbEmplacements || nbEmplacements < 1)
    return errorResponse("Le nombre d'emplacements doit être d'au moins 1.");

  if (nbEmplacements < c.slotsCount) {
    const occupiedBeyond = c.slots.slice(nbEmplacements).some(Boolean);
    if (occupiedBeyond) {
      return errorResponse("Videz les emplacements concernés avant de réduire le nombre d'emplacements.");
    }
  }

  const row = await insertJournalRow(db, {
    type: 'UPDATE_COFFRE',
    coffre_nom: nom,
    description,
    emplacement,
    nb_emplacements: nbEmplacements,
  });
  return json(row, 201);
}

async function handleRemoveCoffre(db, coffres, body) {
  const nom = (body.coffre_nom || '').trim();
  const c = coffres.find((x) => x.nom === nom);
  if (!c) return errorResponse('Coffre introuvable.', 404);

  const row = await insertJournalRow(db, { type: 'REMOVE_COFFRE', coffre_nom: nom });
  return json(row, 201);
}

async function handleIn(db, coffres, body) {
  const nom = (body.coffre_nom || '').trim();
  const idx = Number(body.emplacement_index);
  const itemId = body.item_id;
  const qty = Number(body.quantite);

  const c = coffres.find((x) => x.nom === nom);
  if (!c) return errorResponse('Coffre introuvable.', 404);
  if (!Number.isInteger(idx) || idx < 0 || idx >= c.slotsCount) return errorResponse('Emplacement invalide.');
  if (!itemId) return errorResponse('Choisissez un objet.');
  if (!Number.isInteger(qty) || qty < 1) return errorResponse('Indiquez une quantité valide.');

  const item = await db
    .prepare('SELECT id, nom, quantite_max FROM catalogue WHERE id = ?')
    .bind(itemId)
    .first();
  if (!item) return errorResponse('Objet introuvable.', 404);

  const slot = c.slots[idx];
  if (slot && slot.itemId !== itemId) {
    return errorResponse('Cet emplacement contient déjà un autre objet.');
  }

  const already = slot ? slot.quantite : 0;
  if (already + qty > item.quantite_max) {
    return errorResponse(
      `Cette quantité dépasse le maximum autorisé (${item.quantite_max}) pour ${item.nom}. Utilisez un autre emplacement pour le surplus.`
    );
  }

  const row = await insertJournalRow(db, {
    type: 'IN',
    coffre_nom: nom,
    emplacement_index: idx,
    item_id: itemId,
    quantite: qty,
  });
  return json(row, 201);
}

async function handleOut(db, coffres, body) {
  const nom = (body.coffre_nom || '').trim();
  const idx = Number(body.emplacement_index);
  const qty = Number(body.quantite);

  const c = coffres.find((x) => x.nom === nom);
  if (!c) return errorResponse('Coffre introuvable.', 404);
  if (!Number.isInteger(idx) || idx < 0 || idx >= c.slotsCount) return errorResponse('Emplacement invalide.');

  const slot = c.slots[idx];
  if (!slot) return errorResponse('Cet emplacement est déjà vide.');
  if (!Number.isInteger(qty) || qty < 1 || qty > slot.quantite) return errorResponse('Quantité invalide.');

  const row = await insertJournalRow(db, {
    type: 'OUT',
    coffre_nom: nom,
    emplacement_index: idx,
    item_id: slot.itemId,
    quantite: qty,
  });
  return json(row, 201);
}

/* ---------- vue calculée des coffres ---------- */

async function listCoffres(db) {
  return json(computeCoffres(await getJournal(db)));
}
