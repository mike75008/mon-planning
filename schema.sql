-- À exécuter une seule fois dans l'éditeur SQL de Neon (console.neon.tech)
CREATE TABLE IF NOT EXISTS day_status (
  date TEXT PRIMARY KEY,          -- format YYYY-MM-DD
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
