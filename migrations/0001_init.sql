CREATE TABLE catalogue (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL UNIQUE,
  description   TEXT,
  quantite_max  INTEGER NOT NULL
);

CREATE TABLE journal (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  horodatage        TEXT NOT NULL,
  type              TEXT NOT NULL CHECK(type IN (
                        'CREATE_COFFRE', 'UPDATE_COFFRE', 'REMOVE_COFFRE', 'IN', 'OUT'
                      )),
  coffre_nom        TEXT NOT NULL,
  description       TEXT,
  emplacement       TEXT,
  nb_emplacements   INTEGER,
  emplacement_index INTEGER,
  item_id           TEXT REFERENCES catalogue(id),
  quantite          INTEGER
);

CREATE INDEX idx_journal_coffre ON journal(coffre_nom);
CREATE INDEX idx_journal_item ON journal(item_id);
