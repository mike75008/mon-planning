-- Migration : si vous aviez déjà créé l'ancienne table (sans user_id),
-- exécutez ce script UNE FOIS dans l'éditeur SQL Neon.
-- ⚠️ Supprime les données existantes (table mono-utilisateur obsolète).

DROP TABLE IF EXISTS day_status;

CREATE TABLE day_status (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
