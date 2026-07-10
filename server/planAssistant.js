const PLANNING_BLOCKS = [
  { id: "sport", label: "Sport", cat: "sport", start: "07:00", end: "08:00", optional: true },
  { id: "boot", label: "Lancement — check statut du jour", cat: "boot", start: "08:00", end: "08:15" },
  { id: "dev1", label: "Dev — appli prioritaire", cat: "dev", start: "08:15", end: "10:15" },
  { id: "p1", label: "Pause", cat: "pause", start: "10:15", end: "10:30" },
  { id: "market", label: "Ambassadeurs IA / Marketing", cat: "market", start: "10:30", end: "12:00" },
  { id: "lunch", label: "Déjeuner", cat: "pause", start: "12:00", end: "13:00" },
  { id: "admin", label: "Admin identitaire", cat: "admin", start: "13:00", end: "14:00" },
  { id: "dev2", label: "Dev — suite / appli en retard", cat: "dev", start: "14:00", end: "15:30" },
  { id: "p2", label: "Pause", cat: "pause", start: "15:30", end: "15:45" },
  { id: "music", label: "Musique — Suno / MusicGPT", cat: "music", start: "15:45", end: "16:45" },
  { id: "permis", label: "Permis — code en ligne", cat: "permis", start: "16:45", end: "17:45" },
  { id: "appart", label: "Recherche appartement", cat: "appart", start: "17:45", end: "18:15" },
  { id: "close", label: "Clôture — bilan 3 lignes", cat: "close", start: "18:15", end: "18:30" },
];

const VALID_BLOCK_IDS = new Set(PLANNING_BLOCKS.map((b) => b.id));

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildSystemPrompt(referenceDate) {
  const blocks = PLANNING_BLOCKS.map(
    (b) => `- ${b.id}: ${b.label} (${b.start}-${b.end})${b.optional ? " [optionnel]" : ""}`
  ).join("\n");

  return `Tu es l'assistant planning de mon-planning. Tu comprends le français parlé ou écrit, sans limite de formulation, de date ou de délai (demain, dans 3 mois, le 15 mars 2028, etc.).

Date de référence (aujourd'hui pour l'utilisateur): ${referenceDate}

Créneaux disponibles (blockId obligatoire):
${blocks}

Règles:
- Interprète librement l'intention: cocher/décocher des créneaux, notes, rappels sur n'importe quelle date passée ou future.
- Chaque action doit cibler une date ISO YYYY-MM-DD et un blockId de la liste.
- checked true = créneau validé/coaché, false = retirer la validation.
- customLabel optionnel si l'utilisateur précise une variante (max 120 caractères).
- Si plusieurs dates ou créneaux, renvoie plusieurs actions.
- Si tu ne peux pas mapper, renvoie actions vide et explique dans summary.

Réponds UNIQUEMENT en JSON valide (sans markdown):
{
  "summary": "phrase courte en français",
  "transcript": "texte normalisé si entrée vocale/brute",
  "actions": [
    { "date": "YYYY-MM-DD", "blockId": "dev1", "checked": true, "customLabel": null }
  ]
}`;
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Réponse IA illisible");
    return JSON.parse(match[0]);
  }
}

function normalizeActions(rawActions) {
  if (!Array.isArray(rawActions)) return [];
  const out = [];
  for (const item of rawActions) {
    if (!item || typeof item !== "object") continue;
    const date = String(item.date || "").slice(0, 10);
    const blockId = String(item.blockId || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!VALID_BLOCK_IDS.has(blockId)) continue;
    out.push({
      date,
      blockId,
      checked: item.checked !== false,
      customLabel:
        typeof item.customLabel === "string" && item.customLabel.trim()
          ? item.customLabel.trim().slice(0, 120)
          : null,
    });
  }
  return out;
}

function enrichActions(actions) {
  return actions.map((action) => {
    const block = PLANNING_BLOCKS.find((b) => b.id === action.blockId);
    return {
      ...action,
      blockLabel: action.customLabel || block?.label || action.blockId,
      start: block?.start || "",
      end: block?.end || "",
      cat: block?.cat || "",
    };
  });
}

async function callClaude(userText, referenceDate) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "ANTHROPIC_API_KEY manquante — ajoute-la dans .env ou sur Render pour activer l'IA."
    );
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: buildSystemPrompt(referenceDate),
      messages: [{ role: "user", content: userText }],
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    throw new Error(`Claude API: ${msg}`);
  }

  const text = body.content?.find((c) => c.type === "text")?.text || "";
  const parsed = extractJson(text);
  const actions = normalizeActions(parsed.actions);
  return {
    summary: String(parsed.summary || "Proposition de planning"),
    transcript: String(parsed.transcript || userText),
    actions: enrichActions(actions),
  };
}

async function transcribeAudio(buffer, mimeType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "OPENAI_API_KEY manquante — requise pour la transcription vocale (Whisper). Ajoute-la dans .env ou sur Render."
    );
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const form = new FormData();
  const ext = mimeType?.includes("webm") ? "webm" : mimeType?.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
  form.append("file", blob, `voice.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "fr");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Transcription échouée");
  const text = String(json.text || "").trim();
  if (!text) throw new Error("Aucune parole détectée dans l'enregistrement");
  return text;
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

async function applyPlanningActions(sql, userId, actions) {
  const byDate = new Map();
  for (const action of actions) {
    if (!byDate.has(action.date)) byDate.set(action.date, []);
    byDate.get(action.date).push(action);
  }

  const applied = [];

  for (const [date, dateActions] of byDate.entries()) {
    const rows = await sql`SELECT data FROM day_status WHERE date = ${date} AND user_id = ${userId}`;
    const data = parseDayData(rows[0]?.data);

    for (const action of dateActions) {
      if (action.checked) data[action.blockId] = true;
      else delete data[action.blockId];
      if (action.customLabel) {
        data._labels = data._labels || {};
        data._labels[action.blockId] = action.customLabel;
      }
    }

    await sql`
      INSERT INTO day_status (user_id, date, data, updated_at)
      VALUES (${userId}, ${date}, ${JSON.stringify(data)}, now())
      ON CONFLICT (user_id, date)
      DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = now()
    `;

    applied.push({ date, count: dateActions.length });
  }

  return applied;
}

module.exports = {
  PLANNING_BLOCKS,
  localDateKey,
  parsePlanningText: callClaude,
  transcribeAudio,
  applyPlanningActions,
};
