async function initCallSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS chat_calls (
      id BIGSERIAL PRIMARY KEY,
      caller_id TEXT NOT NULL,
      callee_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'ringing',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS chat_call_events (
      id BIGSERIAL PRIMARY KEY,
      call_id BIGINT NOT NULL REFERENCES chat_calls(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_calls_callee ON chat_calls (callee_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_chat_call_events_call ON chat_call_events (call_id, id)`;
}

function serializeCall(row) {
  return {
    id: String(row.id),
    callerId: row.caller_id,
    calleeId: row.callee_id,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
  };
}

function registerCallRoutes(api, { sql, requireAuth }) {
  api.post("/chat/calls", requireAuth, async (req, res) => {
    const { otherUserId, mode } = req.body || {};
    if (!otherUserId || otherUserId === req.userId) {
      return res.status(400).json({ error: "Destinataire invalide" });
    }
    const callMode = mode === "phone" ? "phone" : "video";
    try {
      await sql`
        UPDATE chat_calls SET status = 'ended', updated_at = now()
        WHERE status IN ('ringing', 'active')
          AND (caller_id = ${req.userId} OR callee_id = ${req.userId})
      `;
      const rows = await sql`
        INSERT INTO chat_calls (caller_id, callee_id, mode, status)
        VALUES (${req.userId}, ${otherUserId}, ${callMode}, 'ringing')
        RETURNING *
      `;
      res.json({ call: serializeCall(rows[0]) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/calls/incoming", requireAuth, async (req, res) => {
    try {
      const rows = await sql`
        SELECT * FROM chat_calls
        WHERE callee_id = ${req.userId} AND status = 'ringing'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (!rows[0]) return res.json({ call: null });
      res.json({ call: serializeCall(rows[0]) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/calls/:callId", requireAuth, async (req, res) => {
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      res.json({ call: serializeCall(call) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/calls/:callId/accept", requireAuth, async (req, res) => {
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.callee_id !== req.userId) return res.status(403).json({ error: "Accès refusé" });
      if (call.status !== "ringing") return res.status(400).json({ error: "Appel déjà traité" });
      const updated = await sql`
        UPDATE chat_calls SET status = 'active', updated_at = now()
        WHERE id = ${call.id}
        RETURNING *
      `;
      res.json({ call: serializeCall(updated[0]) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/calls/:callId/decline", requireAuth, async (req, res) => {
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      await sql`
        UPDATE chat_calls SET status = 'ended', updated_at = now() WHERE id = ${call.id}
      `;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/calls/:callId/end", requireAuth, async (req, res) => {
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      await sql`
        UPDATE chat_calls SET status = 'ended', updated_at = now() WHERE id = ${call.id}
      `;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.post("/chat/calls/:callId/signal", requireAuth, async (req, res) => {
    const { type, payload } = req.body || {};
    if (!type) return res.status(400).json({ error: "type manquant" });
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      if (call.status === "ended") return res.status(400).json({ error: "Appel terminé" });
      const ev = await sql`
        INSERT INTO chat_call_events (call_id, user_id, event_type, payload)
        VALUES (${call.id}, ${req.userId}, ${type}, ${JSON.stringify(payload || {})})
        RETURNING id, user_id, event_type, payload, created_at
      `;
      res.json({ event: ev[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get("/chat/calls/:callId/signals", requireAuth, async (req, res) => {
    const after = Number(req.query.after || 0);
    try {
      const rows = await sql`SELECT * FROM chat_calls WHERE id = ${req.params.callId}`;
      const call = rows[0];
      if (!call) return res.status(404).json({ error: "Appel introuvable" });
      if (call.caller_id !== req.userId && call.callee_id !== req.userId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
      const events = await sql`
        SELECT id, user_id, event_type, payload, created_at
        FROM chat_call_events
        WHERE call_id = ${call.id} AND id > ${after}
        ORDER BY id ASC
      `;
      res.json({
        call: serializeCall(call),
        events: events.map((e) => ({
          id: e.id,
          userId: e.user_id,
          type: e.event_type,
          payload: e.payload,
          createdAt: e.created_at,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { initCallSchema, registerCallRoutes };
