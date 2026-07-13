// Serveur Express — à déployer sur Render (Web Service)
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { parsePlanningText, transcribeAudio, applyPlanningActions, localDateKey } = require("./planAssistant");
const { initChatSchema, registerChatRoutes, ensureProfileForUser } = require("./chat");
const { neon } = require("@neondatabase/serverless");
const { clerkMiddleware, getAuth } = require("@clerk/express");

function pickClerkPublishableKey() {
  const candidates = [
    process.env.VITE_CLERK_PUBLISHABLE_KEY,
    process.env.CLERK_PUBLISHABLE_KEY,
  ];
  return candidates.find((k) => typeof k === "string" && k.startsWith("pk_")) || "";
}

const publishableKey = pickClerkPublishableKey();
if (publishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
}

if (!process.env.NEON_DATABASE_URL) console.error("NEON_DATABASE_URL manquante");
if (!process.env.CLERK_SECRET_KEY) console.error("CLERK_SECRET_KEY manquante");
if (!publishableKey) {
  console.error("Clé publishable Clerk introuvable");
} else {
  console.log("Clerk publishable key OK:", publishableKey.slice(0, 12) + "...");
}

const sql = neon(process.env.NEON_DATABASE_URL);

async function clerkApi(path, options = {}) {
  const res = await fetch(`https://api.clerk.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = body?.errors?.[0]?.message || body?.message || res.statusText;
    throw new Error(msg);
  }
  return body;
}

async function logActivity(userId, action, details = {}) {
  try {
    await sql`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (${userId}, ${action}, ${JSON.stringify(details)})
    `;
  } catch (err) {
    console.error("logActivity:", err.message);
  }
}

function requiredBlocksForDow(dow) {
  const CATS = {
    sport: "Sport",
    boot: "Lancement",
    dev: "Dev",
    pause: "Pause",
    market: "Marketing / IA",
    admin: "Admin identitaire",
    music: "Musique",
    permis: "Permis",
    appart: "Appartement",
    close: "Clôture",
  };
  const ADMIN_ROTATION = {
    1: "CV propre",
    2: "LinkedIn propre",
    3: "Réseaux perso musique",
    4: "Nouveaux comptes appli",
    5: "Nettoyage global / révision",
    6: "Libre — rattrapage",
    0: "Libre — rattrapage",
  };
  const blocks = [
    { id: "sport", optional: true, cat: "sport" },
    { id: "boot", optional: false, cat: "boot" },
    { id: "dev1", optional: false, cat: "dev" },
    { id: "p1", optional: false, cat: "pause" },
    { id: "market", optional: false, cat: "market" },
    { id: "lunch", optional: false, cat: "pause" },
    { id: "admin", optional: false, cat: "admin" },
    { id: "dev2", optional: false, cat: "dev" },
    { id: "p2", optional: false, cat: "pause" },
    { id: "music", optional: false, cat: "music" },
    { id: "permis", optional: false, cat: "permis" },
    { id: "appart", optional: false, cat: "appart" },
    { id: "close", optional: false, cat: "close" },
  ];
  return blocks.filter((b) => !b.optional && CATS[b.cat] !== "Pause");
}

function pctFromData(data, dow) {
  const blocks = requiredBlocksForDow(dow);
  if (!blocks.length) return 0;
  const done = blocks.filter((b) => data?.[b.id]).length;
  return Math.round((done / blocks.length) * 100);
}

function parseDowFromDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

const BLOCK_META = {
  sport: { label: "Sport", color: "#EF4444" },
  boot: { label: "Lancement", color: "#64748B" },
  dev1: { label: "Dev", color: "#3B82F6" },
  dev2: { label: "Dev", color: "#3B82F6" },
  p1: { label: "Pause", color: "#475569" },
  p2: { label: "Pause", color: "#475569" },
  lunch: { label: "Déjeuner", color: "#475569" },
  market: { label: "Marketing / IA", color: "#F97316" },
  admin: { label: "Admin identitaire", color: "#EAB308" },
  music: { label: "Musique", color: "#A855F7" },
  permis: { label: "Permis", color: "#22C55E" },
  appart: { label: "Appartement", color: "#14B8A6" },
  close: { label: "Clôture", color: "#94A3B8" },
};

function formatDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateKey(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatFrDate(dateStr) {
  return parseDateKey(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function weekDatesFromFriday(fridayStr) {
  const fri = parseDateKey(fridayStr);
  const mon = new Date(fri);
  mon.setDate(fri.getDate() - 4);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    dates.push(formatDateKey(d));
  }
  return dates;
}

function weekendDatesFromSunday(sundayStr) {
  const sun = parseDateKey(sundayStr);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() - 1);
  return [formatDateKey(sat), formatDateKey(sun)];
}

function parseDayData(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function collectAttachmentsFromRows(rows) {
  const items = [];
  for (const row of rows) {
    const att = parseDayData(row.data)._attachments || {};
    for (const [blockId, list] of Object.entries(att)) {
      const meta = BLOCK_META[blockId] || { label: blockId, color: "#64748B" };
      for (const item of list) {
        items.push({
          ...item,
          date: row.date,
          blockId,
          blockLabel: meta.label,
          color: meta.color,
        });
      }
    }
  }
  return items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

function episodeTitle(period, dates, itemCount) {
  const start = formatFrDate(dates[0]);
  const end = formatFrDate(dates[dates.length - 1]);
  if (period === "week") {
    return `Épisode — Semaine du ${start} au ${end} (${itemCount} pièce${itemCount > 1 ? "s" : ""})`;
  }
  return `Épisode — Week-end du ${start} au ${end} (${itemCount} pièce${itemCount > 1 ? "s" : ""})`;
}

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Seules les photos et vidéos sont autorisées"));
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const app = express();
app.use(express.json());

app.get("/env-config.js", (_req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__ENV__=${JSON.stringify({ VITE_CLERK_PUBLISHABLE_KEY: publishableKey })};`
  );
});

const distPath = path.join(__dirname, "..", "dist");

const api = express.Router();
api.use(clerkMiddleware());

function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  req.userId = userId;
  next();
}

async function getClerkUser(userId) {
  return clerkApi(`/v1/users/${userId}`);
}

async function isUserAdmin(userId) {
  const user = await getClerkUser(userId);
  return user?.public_metadata?.role === "admin";
}

async function requireAdmin(req, res, next) {
  try {
    const admin = await isUserAdmin(req.userId);
    if (!admin) return res.status(403).json({ error: "Accès administrateur requis" });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

api.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getClerkUser(req.userId);
    await ensureProfileForUser(sql, req.userId, user);
    const isAdmin = user?.public_metadata?.role === "admin";
    res.json({
      userId: req.userId,
      isAdmin,
      email: user?.email_addresses?.[0]?.email_address || "",
      firstName: user?.first_name || "",
      lastName: user?.last_name || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    await logActivity(req.userId, "planning_modifie", { date });
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

api.post("/upload", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });
    const type = req.file.mimetype.startsWith("video/") ? "video" : "photo";
    res.json({ url: `/uploads/${req.file.filename}`, type });
  });
});

api.get("/recap", requireAuth, async (req, res) => {
  const { period, date } = req.query;
  if (!period || !["week", "weekend"].includes(period)) {
    return res.status(400).json({ error: "period doit être week ou weekend" });
  }
  const refDate = date || new Date().toISOString().slice(0, 10);
  try {
    const dates =
      period === "week" ? weekDatesFromFriday(refDate) : weekendDatesFromSunday(refDate);

    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const rows = await sql`
      SELECT date, data FROM day_status
      WHERE user_id = ${req.userId}
      AND date >= ${minDate}
      AND date <= ${maxDate}
      ORDER BY date ASC
    `;
    const dateSet = new Set(dates);
    const filtered = rows.filter((r) => dateSet.has(r.date));

    const items = collectAttachmentsFromRows(filtered);
    res.json({
      period,
      dates,
      titreEpisode: episodeTitle(period, dates, items.length),
      items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.post("/plan/parse", requireAuth, async (req, res) => {
  const { text, referenceDate } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: "texte manquant" });
  }
  try {
    const result = await parsePlanningText(
      String(text).trim(),
      referenceDate || localDateKey()
    );
    res.json(result);
  } catch (err) {
    if (err.code === "AI_NOT_CONFIGURED") return res.status(503).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

api.post("/plan/transcribe", requireAuth, (req, res) => {
  audioUpload.single("audio")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "audio manquant" });
    try {
      const referenceDate = req.body?.referenceDate || localDateKey();
      const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
      const result = await parsePlanningText(transcript, referenceDate);
      res.json({ ...result, transcript });
    } catch (e) {
      if (e.code === "AI_NOT_CONFIGURED") return res.status(503).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });
});

registerChatRoutes(api, { sql, requireAuth, getClerkUser, clerkApi, logActivity });

api.post("/plan/apply", requireAuth, async (req, res) => {
  const { actions } = req.body || {};
  if (!Array.isArray(actions) || !actions.length) {
    return res.status(400).json({ error: "actions manquantes" });
  }
  try {
    const applied = await applyPlanningActions(sql, req.userId, actions);
    await logActivity(req.userId, "planning_ia_applique", { dates: applied.map((a) => a.date) });
    res.json({ ok: true, applied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const admin = express.Router();
admin.use(requireAuth, requireAdmin);

admin.get("/dashboard", async (_req, res) => {
  try {
    const usersData = await clerkApi("/v1/users?limit=100&order_by=-created_at");
    const users = usersData.data || usersData || [];
    const list = Array.isArray(users) ? users : [];

    const rows = await sql`
      SELECT user_id, date, data FROM day_status
      WHERE date >= (CURRENT_DATE - INTERVAL '6 days')
    `;

    const today = new Date().toISOString().slice(0, 10);
    let sumPct = 0;
    let countPct = 0;
    const perUser = {};

    for (const row of rows) {
      const dow = parseDowFromDate(row.date);
      const pct = pctFromData(row.data, dow);
      if (!perUser[row.user_id]) perUser[row.user_id] = [];
      perUser[row.user_id].push(pct);
      sumPct += pct;
      countPct++;
    }

    const recentLogs = await sql`
      SELECT user_id, action, details, created_at
      FROM activity_logs
      ORDER BY created_at DESC
      LIMIT 10
    `;

    res.json({
      utilisateursInscrits: list.length,
      utilisateursActifsAujourdhui: list.filter(
        (u) => u.last_sign_in_at && u.last_sign_in_at.slice(0, 10) === today
      ).length,
      pourcentageMoyenGlobal: countPct ? Math.round(sumPct / countPct) : 0,
      journauxRecents: recentLogs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.get("/utilisateurs", async (_req, res) => {
  try {
    const usersData = await clerkApi("/v1/users?limit=100&order_by=-created_at");
    const users = usersData.data || usersData || [];
    const list = (Array.isArray(users) ? users : []).map((u) => ({
      id: u.id,
      prenom: u.first_name || "",
      nom: u.last_name || "",
      email: u.email_addresses?.[0]?.email_address || "",
      inscritLe: u.created_at,
      derniereConnexion: u.last_sign_in_at || null,
      compteDesactive: !!u.banned,
    }));
    res.json({ utilisateurs: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.get("/connexions", async (_req, res) => {
  try {
    const usersData = await clerkApi("/v1/users?limit=100&order_by=-last_sign_in_at");
    const users = usersData.data || usersData || [];
    const list = (Array.isArray(users) ? users : [])
      .filter((u) => u.last_sign_in_at)
      .map((u) => ({
        id: u.id,
        prenom: u.first_name || "",
        nom: u.last_name || "",
        email: u.email_addresses?.[0]?.email_address || "",
        derniereConnexion: u.last_sign_in_at,
      }));
    res.json({ connexions: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.post("/utilisateurs/:id/desactiver", async (req, res) => {
  try {
    await clerkApi(`/v1/users/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ banned: true }),
    });
    await logActivity(req.userId, "compte_desactive", { cible: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.post("/utilisateurs/:id/reactiver", async (req, res) => {
  try {
    await clerkApi(`/v1/users/${req.params.id}`, {
      method: "PATCH",
      body: JSON.stringify({ banned: false }),
    });
    await logActivity(req.userId, "compte_reactive", { cible: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.get("/statistiques", async (_req, res) => {
  try {
    const usersData = await clerkApi("/v1/users?limit=100");
    const users = usersData.data || usersData || [];
    const userMap = Object.fromEntries(
      (Array.isArray(users) ? users : []).map((u) => [
        u.id,
        {
          prenom: u.first_name || "",
          nom: u.last_name || "",
          email: u.email_addresses?.[0]?.email_address || "",
        },
      ])
    );

    const rows = await sql`
      SELECT user_id, date, data FROM day_status
      WHERE date >= (CURRENT_DATE - INTERVAL '6 days')
    `;

    const perUser = {};
    for (const row of rows) {
      const dow = parseDowFromDate(row.date);
      const pct = pctFromData(row.data, dow);
      if (!perUser[row.user_id]) perUser[row.user_id] = [];
      perUser[row.user_id].push(pct);
    }

    const statistiques = Object.entries(perUser).map(([userId, pcts]) => {
      const info = userMap[userId] || {};
      const moyenne = pcts.length
        ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
        : 0;
      return {
        utilisateurId: userId,
        prenom: info.prenom || "",
        nom: info.nom || "",
        email: info.email || "",
        pourcentageMoyenSeptJours: moyenne,
        joursEnregistres: pcts.length,
      };
    });

    res.json({ statistiques });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

admin.get("/journaux", async (_req, res) => {
  try {
    const rows = await sql`
      SELECT id, user_id, action, details, created_at
      FROM activity_logs
      ORDER BY created_at DESC
      LIMIT 200
    `;
    res.json({ journaux: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.use("/admin", admin);

app.use("/api", api);

app.use("/uploads", express.static(uploadsDir));
app.use(express.static(distPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;

async function boot() {
  try {
    await initChatSchema(sql);
    console.log("Chat schema OK");
  } catch (err) {
    console.error("Chat schema:", err.message);
  }
}

boot();

const server = app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
  console.log("API: /api/day, /api/week, /api/recap, /api/upload, /api/plan/*, /api/chat/*");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} déjà utilisé — un ancien serveur Node tourne encore.\n` +
        `Windows : netstat -ano | findstr :${PORT}  puis  taskkill /PID <pid> /F\n` +
        `Ensuite relance : npm run start:local\n`
    );
    process.exit(1);
  }
  throw err;
});
