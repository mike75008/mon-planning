const EPHEMERAL_MODES = new Set(["after_view", "30s", "1m", "30m", "1d"]);

const MODE_SECONDS = {
  "30s": 30,
  "1m": 60,
  "30m": 30 * 60,
  "1d": 24 * 60 * 60,
};

function pairKey(userId, otherId) {
  return userId < otherId ? [userId, otherId] : [otherId, userId];
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function compatibilityScore(myProfile, otherProfile) {
  let score = 42 + (hashSeed(`${myProfile.user_id}:${otherProfile.user_id}`) % 35);
  const a = (myProfile.hint || "").toLowerCase();
  const b = (otherProfile.hint || "").toLowerCase();
  if (a && b) {
    const wordsA = new Set(a.split(/[\s·,;|/]+/).filter(Boolean));
    for (const w of b.split(/[\s·,;|/]+/)) {
      if (w.length > 2 && wordsA.has(w)) score += 8;
    }
  }
  return Math.min(96, Math.max(18, score));
}

const PRESENCE_STATUSES = new Set(["online", "busy", "away", "offline"]);

const STATUS_LABELS = {
  online: "En ligne",
  busy: "Occupé",
  away: "Absent",
  offline: "Déconnecté",
};

function normalizeStatus(raw) {
  return PRESENCE_STATUSES.has(raw) ? raw : "online";
}

function isVisibleInNetwork(status) {
  return normalizeStatus(status) !== "offline";
}

function messageVisibleTo(msg, viewerId) {
  if (msg.sender_id === viewerId) return true;
  if (!msg.ephemeral) return true;
  if (msg.expires_at && new Date(msg.expires_at).getTime() <= Date.now()) return false;
  if (msg.ephemeral_mode === "after_view" && msg.viewed_at) return false;
  return true;
}

function serializeMessage(msg, viewerId) {
  const visible = messageVisibleTo(msg, viewerId);
  const mine = msg.sender_id === viewerId;
  return {
    id: String(msg.id),
    senderId: msg.sender_id,
    mine,
    type: msg.msg_type,
    body: visible || mine ? msg.body || "" : null,
    mediaUrl: visible || mine ? msg.media_url || null : null,
    ephemeral: !!msg.ephemeral,
    ephemeralMode: msg.ephemeral_mode,
    expired: !visible && !mine,
    expiresAt: msg.expires_at,
    viewedAt: msg.viewed_at,
    createdAt: msg.created_at,
  };
}

async function initChatSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#14B8A6',
      hint TEXT NOT NULL DEFAULT '',
      share_agenda BOOLEAN NOT NULL DEFAULT false,
      share_location BOOLEAN NOT NULL DEFAULT false,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id BIGSERIAL PRIMARY KEY,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_a, user_b),
      CHECK (user_a < user_b)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      msg_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      media_url TEXT,
      ephemeral BOOLEAN NOT NULL DEFAULT false,
      ephemeral_mode TEXT,
      expires_at TIMESTAMPTZ,
      viewed_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles (last_seen_at DESC)`;
  await sql`
    ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS presence_status TEXT NOT NULL DEFAULT 'online'
  `;
}

async function syncProfilesFromClerk(sql, clerkApi) {
  const usersData = await clerkApi("/v1/users?limit=100&order_by=-last_sign_in_at");
  const users = usersData.data || usersData || [];
  if (!Array.isArray(users)) return;
  for (const u of users) {
    if (u.banned) continue;
    await ensureProfile(sql, u.id, u);
  }
}

function profileToJson(p) {
  const status = normalizeStatus(p.presence_status);
  return {
    userId: p.user_id,
    displayName: p.display_name,
    color: p.color,
    hint: p.hint,
    shareAgenda: p.share_agenda,
    shareLocation: p.share_location,
    presenceStatus: status,
    presenceLabel: STATUS_LABELS[status],
  };
}

function personToJson(p, myProfile, extras = {}) {
  const status = normalizeStatus(p.presence_status);
  return {
    id: p.user_id,
    name: p.display_name,
    color: p.color,
    hint: p.hint || "",
    compatibility: compatibilityScore(myProfile, p),
    presenceStatus: status,
    presenceLabel: STATUS_LABELS[status],
    online: status === "online",
    ...extras,
  };
}

async function ensureProfile(sql, userId, clerkUser) {
  const rows = await sql`SELECT * FROM user_profiles WHERE user_id = ${userId}`;
  if (rows[0]) return rows[0];
  const displayName =
    [clerkUser?.first_name, clerkUser?.last_name].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    "Utilisateur";
  const colors = ["#F472B6", "#3B82F6", "#22C55E", "#A855F7", "#F97316", "#14B8A6", "#EAB308"];
  const color = colors[hashSeed(userId) % colors.length];
  await sql`
    INSERT INTO user_profiles (user_id, display_name, color, presence_status, last_seen_at)
    VALUES (${userId}, ${displayName}, ${color}, 'online', now())
    ON CONFLICT (user_id) DO NOTHING
  `;
  const created = await sql`SELECT * FROM user_profiles WHERE user_id = ${userId}`;
  return created[0];
}

async function getOrCreateConversation(sql, userId, otherUserId) {
  if (userId === otherUserId) throw new Error("Conversation avec soi-même impossible");
  const [userA, userB] = pairKey(userId, otherUserId);
  let rows = await sql`
    SELECT id FROM chat_conversations WHERE user_a = ${userA} AND user_b = ${userB}
  `;
  if (rows[0]) return rows[0].id;
  rows = await sql`
    INSERT INTO chat_conversations (user_a, user_b)
    VALUES (${userA}, ${userB})
    ON CONFLICT (user_a, user_b) DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return rows[0].id;
  rows = await sql`
    SELECT id FROM chat_conversations WHERE user_a = ${userA} AND user_b = ${userB}
  `;
  return rows[0].id;
}

async function touchPresence(sql, userId) {
  await sql`
    UPDATE user_profiles SET last_seen_at = now(), updated_at = now()
    WHERE user_id = ${userId}
      AND COALESCE(presence_status, 'online') != 'offline'
  `;
}

function registerChatRoutes(api, { sql, requireAuth, getClerkUser, clerkApi, logActivity }) {
  api.post("/chat/presence", requireAuth, async (req, res) => {
    try {
      const clerkUser = await getClerkUser(req.userId);
      await ensureProfile(sql, req.userId, clerkUser);
      await touchPresence(sql, req.userId);
      const rows = await sql`SELECT presence_status FROM user_profiles WHERE user_id = ${req.userId}`;
      const status = normalizeStatus(rows[0]?.presence_status);
      res.json({ ok: true, presenceStatus: status, presenceLabel: STATUS_LABELS[status] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/profile/me", requireAuth, async (req, res) => {
    try {
      const clerkUser = await getClerkUser(req.userId);
      const profile = await ensureProfile(sql, req.userId, clerkUser);
      await touchPresence(sql, req.userId);
      res.json(profileToJson(profile));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.put("/chat/profile/me", requireAuth, async (req, res) => {
    const { displayName, color, hint, shareAgenda, shareLocation, presenceStatus } = req.body || {};
    try {
      const clerkUser = await getClerkUser(req.userId);
      await ensureProfile(sql, req.userId, clerkUser);
      if (presenceStatus != null && !PRESENCE_STATUSES.has(presenceStatus)) {
        return res.status(400).json({ error: "Statut invalide" });
      }
      await sql`
        UPDATE user_profiles SET
          display_name = COALESCE(${displayName ?? null}, display_name),
          color = COALESCE(${color ?? null}, color),
          hint = COALESCE(${hint ?? null}, hint),
          share_agenda = COALESCE(${shareAgenda ?? null}, share_agenda),
          share_location = COALESCE(${shareLocation ?? null}, share_location),
          presence_status = COALESCE(${presenceStatus ?? null}, presence_status),
          last_seen_at = CASE
            WHEN ${presenceStatus ?? null} IS NOT NULL AND ${presenceStatus ?? null} != 'offline' THEN now()
            ELSE last_seen_at
          END,
          updated_at = now()
        WHERE user_id = ${req.userId}
      `;
      const rows = await sql`SELECT * FROM user_profiles WHERE user_id = ${req.userId}`;
      res.json(profileToJson(rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/people", requireAuth, async (req, res) => {
    try {
      const clerkUser = await getClerkUser(req.userId);
      const myProfile = await ensureProfile(sql, req.userId, clerkUser);
      await touchPresence(sql, req.userId);
      await syncProfilesFromClerk(sql, clerkApi);

      const profiles = await sql`
        SELECT * FROM user_profiles
        WHERE user_id != ${req.userId}
          AND COALESCE(presence_status, 'online') != 'offline'
        ORDER BY last_seen_at DESC NULLS LAST, display_name ASC
      `;

      const people = [];
      for (const p of profiles) {
        const [userA, userB] = pairKey(req.userId, p.user_id);
        const convRows = await sql`
          SELECT id FROM chat_conversations WHERE user_a = ${userA} AND user_b = ${userB}
        `;
        let lastMsg = "";
        let unread = 0;
        if (convRows[0]) {
          const convId = convRows[0].id;
          const msgs = await sql`
            SELECT * FROM chat_messages
            WHERE conversation_id = ${convId}
            ORDER BY created_at DESC
            LIMIT 1
          `;
          if (msgs[0]) {
            const m = msgs[0];
            if (messageVisibleTo(m, req.userId) || m.sender_id === req.userId) {
              lastMsg =
                m.msg_type === "video"
                  ? m.sender_id === req.userId
                    ? "Vidéo envoyée"
                    : "Vidéo"
                  : m.body || "";
            } else if (m.ephemeral) {
              lastMsg = "Note expirée";
            }
          }
          const unreadRows = await sql`
            SELECT COUNT(*)::int AS c FROM chat_messages
            WHERE conversation_id = ${convId}
              AND sender_id != ${req.userId}
              AND read_at IS NULL
          `;
          unread = unreadRows[0]?.c || 0;
        }

        people.push(personToJson(p, myProfile, { lastMsg, unread }));
      }

      res.json({ people });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/conversations/:otherUserId/messages", requireAuth, async (req, res) => {
    const { otherUserId } = req.params;
    try {
      const clerkUser = await getClerkUser(req.userId);
      await ensureProfile(sql, req.userId, clerkUser);
      await touchPresence(sql, req.userId);

      const otherRows = await sql`SELECT * FROM user_profiles WHERE user_id = ${otherUserId}`;
      if (!otherRows[0]) return res.status(404).json({ error: "Utilisateur introuvable" });

      const convId = await getOrCreateConversation(sql, req.userId, otherUserId);
      const rows = await sql`
        SELECT * FROM chat_messages
        WHERE conversation_id = ${convId}
        ORDER BY created_at ASC
      `;

      await sql`
        UPDATE chat_messages SET read_at = now()
        WHERE conversation_id = ${convId}
          AND sender_id = ${otherUserId}
          AND read_at IS NULL
      `;

      const other = otherRows[0];
      if (!isVisibleInNetwork(other.presence_status)) {
        return res.status(404).json({ error: "Utilisateur indisponible" });
      }
      const status = normalizeStatus(other.presence_status);
      res.json({
        other: {
          id: other.user_id,
          name: other.display_name,
          color: other.color,
          hint: other.hint || "",
          presenceStatus: status,
          presenceLabel: STATUS_LABELS[status],
          online: status === "online",
        },
        messages: rows.map((m) => serializeMessage(m, req.userId)),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/conversations/:otherUserId/messages", requireAuth, async (req, res) => {
    const { otherUserId } = req.params;
    const { type, body, mediaUrl, ephemeral, ephemeralMode } = req.body || {};
    try {
      if (otherUserId === req.userId) {
        return res.status(400).json({ error: "Envoi impossible" });
      }
      const otherRows = await sql`SELECT user_id FROM user_profiles WHERE user_id = ${otherUserId}`;
      if (!otherRows[0]) return res.status(404).json({ error: "Utilisateur introuvable" });

      const msgType = type === "video" ? "video" : "text";
      if (msgType === "text" && !String(body || "").trim()) {
        return res.status(400).json({ error: "Message vide" });
      }
      if (msgType === "video" && !mediaUrl) {
        return res.status(400).json({ error: "Vidéo manquante" });
      }

      const isEphemeral = !!ephemeral;
      let mode = null;
      if (isEphemeral) {
        mode = ephemeralMode || "after_view";
        if (!EPHEMERAL_MODES.has(mode)) {
          return res.status(400).json({ error: "Mode éphémère invalide" });
        }
      }

      const convId = await getOrCreateConversation(sql, req.userId, otherUserId);
      const rows = await sql`
        INSERT INTO chat_messages (
          conversation_id, sender_id, msg_type, body, media_url,
          ephemeral, ephemeral_mode
        ) VALUES (
          ${convId}, ${req.userId}, ${msgType},
          ${msgType === "text" ? String(body).trim() : null},
          ${msgType === "video" ? mediaUrl : null},
          ${isEphemeral}, ${mode}
        )
        RETURNING *
      `;

      await logActivity(req.userId, "chat_message", {
        to: otherUserId,
        type: msgType,
        ephemeral: isEphemeral,
      });

      res.json({ message: serializeMessage(rows[0], req.userId) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/messages/:messageId/view", requireAuth, async (req, res) => {
    const { messageId } = req.params;
    const { finished } = req.body || {};
    try {
      const rows = await sql`SELECT * FROM chat_messages WHERE id = ${messageId}`;
      const msg = rows[0];
      if (!msg) return res.status(404).json({ error: "Message introuvable" });
      if (msg.sender_id === req.userId) {
        return res.json({ message: serializeMessage(msg, req.userId) });
      }

      const convRows = await sql`SELECT * FROM chat_conversations WHERE id = ${msg.conversation_id}`;
      const conv = convRows[0];
      if (!conv || (conv.user_a !== req.userId && conv.user_b !== req.userId)) {
        return res.status(403).json({ error: "Accès refusé" });
      }

      let expiresAt = msg.expires_at;
      const now = new Date();

      if (msg.ephemeral && !msg.viewed_at) {
        if (msg.ephemeral_mode === "after_view") {
          if (finished) {
            expiresAt = now.toISOString();
            await sql`
              UPDATE chat_messages SET viewed_at = now(), expires_at = now()
              WHERE id = ${messageId}
            `;
          } else {
            await sql`UPDATE chat_messages SET viewed_at = now() WHERE id = ${messageId}`;
          }
        } else if (MODE_SECONDS[msg.ephemeral_mode]) {
          const exp = new Date(now.getTime() + MODE_SECONDS[msg.ephemeral_mode] * 1000);
          expiresAt = exp.toISOString();
          await sql`
            UPDATE chat_messages SET viewed_at = now(), expires_at = ${expiresAt}
            WHERE id = ${messageId}
          `;
        }
      }

      const updated = await sql`SELECT * FROM chat_messages WHERE id = ${messageId}`;
      res.json({ message: serializeMessage(updated[0], req.userId) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = {
  initChatSchema,
  registerChatRoutes,
  ensureProfileForUser: ensureProfile,
  EPHEMERAL_MODES,
};
