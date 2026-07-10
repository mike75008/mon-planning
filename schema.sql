-- À exécuter une seule fois dans l'éditeur SQL de Neon (console.neon.tech)
CREATE TABLE IF NOT EXISTS day_status (
  user_id TEXT NOT NULL,          -- ID Clerk (ex. user_2abc...)
  date TEXT NOT NULL,             -- format YYYY-MM-DD
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
