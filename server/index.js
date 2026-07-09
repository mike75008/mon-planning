// Serveur Express — à déployer sur Render (Web Service)
// Variable d'environnement requise sur Render : NEON_DATABASE_URL
const express = require("express");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const app = express();
app.use(express.json());

const sql = neon(process.env.NEON_DATABASE_URL);

// Récupère le statut d'un jour précis : /api/day?date=2026-07-09
app.get("/api/day", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date manquante" });
  try {
    const rows = await sql`SELECT data FROM day_status WHERE date = ${date}`;
    res.json({ data: rows[0]?.data || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enregistre/écrase le statut d'un jour : { date, data }
app.post("/api/day", async (req, res) => {
  const { date, data } = req.body || {};
  if (!date) return res.status(400).json({ error: "date manquante" });
  try {
    await sql`
      INSERT INTO day_status (date, data, updated_at)
      VALUES (${date}, ${JSON.stringify(data)}, now())
      ON CONFLICT (date)
      DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = now()
    `;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Les 7 derniers jours, pour la bande de stats : /api/week
app.get("/api/week", async (req, res) => {
  try {
    const rows = await sql`
      SELECT date, data FROM day_status
      WHERE date >= (CURRENT_DATE - INTERVAL '6 days')
      ORDER BY date ASC
    `;
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sert le frontend buildé (Vite -> dist/)
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
