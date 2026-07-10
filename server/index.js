// Serveur Express — à déployer sur Render (Web Service)
// Variables d'environnement requises :
//   NEON_DATABASE_URL, CLERK_SECRET_KEY, VITE_CLERK_PUBLISHABLE_KEY
const express = require("express");
const path = require("path");
const { neon } = require("@neondatabase/serverless");
const { clerkMiddleware, getAuth } = require("@clerk/express");

function pickClerkPublishableKey() {
  const candidates = [
    process.env.VITE_CLERK_PUBLISHABLE_KEY,
    process.env.CLERK_PUBLISHABLE_KEY,
  ];
  return candidates.find((k) => typeof k === "string" && k.startsWith("pk_")) || "";
}

// Clerk Express lit CLERK_PUBLISHABLE_KEY — on synchronise depuis VITE_ si besoin
const publishableKey = pickClerkPublishableKey();
if (publishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
}

if (!process.env.NEON_DATABASE_URL) {
  console.error("NEON_DATABASE_URL manquante");
}
if (!process.env.CLERK_SECRET_KEY) {
  console.error("CLERK_SECRET_KEY manquante");
}
if (!publishableKey) {
  console.error("Clé publishable Clerk introuvable (VITE_CLERK_PUBLISHABLE_KEY ou CLERK_PUBLISHABLE_KEY)");
} else {
  console.log("Clerk publishable key OK:", publishableKey.slice(0, 12) + "...");
}

const sql = neon(process.env.NEON_DATABASE_URL);

const app = express();
app.use(express.json());

// --- Routes publiques (pas de Clerk middleware) ---

app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__ENV__=${JSON.stringify({ VITE_CLERK_PUBLISHABLE_KEY: publishableKey })};`
  );
});

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// --- API protégée par Clerk ---

const api = express.Router();
// Sans arguments : lit CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY depuis process.env
api.use(clerkMiddleware());

function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  req.userId = userId;
  next();
}

api.get("/day", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date manquante" });
  try {
    const rows = await sql`SELECT data FROM day_status WHERE date = ${date} AND user_id = ${req.userId}`;
    res.json({ data: rows[0]?.data || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.post("/day", requireAuth, async (req, res) => {
  const { date, data } = req.body || {};
  if (!date) return res.status(400).json({ error: "date manquante" });
  try {
    await sql`
      INSERT INTO day_status (user_id, date, data, updated_at)
      VALUES (${req.userId}, ${date}, ${JSON.stringify(data)}, now())
      ON CONFLICT (user_id, date)
      DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = now()
    `;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.get("/week", requireAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT date, data FROM day_status
      WHERE user_id = ${req.userId}
      AND date >= (CURRENT_DATE - INTERVAL '6 days')
      ORDER BY date ASC
    `;
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api", api);

// SPA React
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
