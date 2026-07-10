import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { useAuth } from "@clerk/react";
import { startAudioRecording } from "./audioRecord.js";

function formatFrDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PlanningAssistantBadge({ expanded, onOpen, busy }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label="Ouvrir planning IA"
      onClick={onOpen}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        border: expanded ? "1px solid #C084FC" : "1px solid #A855F7",
        background: expanded ? "#221230" : "#0B0D10",
        color: "#D8B4FE",
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 0.5,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <Sparkles size={13} color="#A855F7" />
      <span>Planning IA</span>
    </button>
  );
}

export default function PlanningAssistant({ todayStr, referenceDateStr, onApplied }) {
  const { getToken, isLoaded } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [proposals, setProposals] = useState(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop?.();
    };
  }, []);

  const parseJsonResponse = async (res) => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "Réponse serveur invalide (HTML) — redémarre npm run start:local sur le port 3000."
      );
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Erreur serveur");
    return json;
  };

  const analyzeText = async (rawText) => {
    const token = await getToken();
    if (!token) throw new Error("Session non prête — reconnecte-toi.");
    const res = await fetch("/api/plan/parse", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: rawText,
        referenceDate: referenceDateStr || todayStr,
      }),
    });
    return parseJsonResponse(res);
  };

  const handleAnalyze = async () => {
    const raw = text.trim();
    if (!raw) {
      setError("Écris ou dicte quelque chose avant d'analyser.");
      return;
    }
    setBusy(true);
    setError("");
    setProposals(null);
    try {
      const json = await analyzeText(raw);
      setSummary(json.summary || "");
      setTranscript(json.transcript || raw);
      setProposals(json.actions || []);
      if (!json.actions?.length) {
        setError("L'IA n'a proposé aucune action — reformule ou précise une date et un créneau.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const session = await startAudioRecording();
      recorderRef.current = session;
      setRecording(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const stopRecording = async () => {
    const session = recorderRef.current;
    if (!session) return;
    setRecording(false);
    setBusy(true);
    setError("");
    setProposals(null);
    try {
      session.stop();
      const { blob, mimeType } = await session.result;
      recorderRef.current = null;

      const token = await getToken();
      if (!token) throw new Error("Session non prête — reconnecte-toi.");

      const form = new FormData();
      form.append("audio", blob, `voice.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
      form.append("referenceDate", referenceDateStr || todayStr);

      const res = await fetch("/api/plan/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await parseJsonResponse(res);
      setText(json.transcript || "");
      setSummary(json.summary || "");
      setTranscript(json.transcript || "");
      setProposals(json.actions || []);
      if (!json.actions?.length) {
        setError("L'IA n'a proposé aucune action — réessaie en étant plus explicite sur la date.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!proposals?.length) return;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Session non prête — reconnecte-toi.");
      const res = await fetch("/api/plan/apply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actions: proposals }),
      });
      await parseJsonResponse(res);
      setExpanded(false);
      setProposals(null);
      setSummary("");
      onApplied?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        flexBasis: expanded ? "100%" : "auto",
        width: expanded ? "100%" : "auto",
      }}
    >
      <PlanningAssistantBadge
        expanded={expanded}
        busy={busy || recording}
        onOpen={() => setExpanded(true)}
      />

      {expanded && (
        <div
          style={{
            marginTop: 12,
            background: "linear-gradient(135deg, #221230 0%, #14171B 100%)",
            border: "1px solid #A855F7",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={18} color="#A855F7" />
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748B", textTransform: "uppercase" }}>
                Planning IA
              </div>
            </div>
            <button
              type="button"
              aria-label="Fermer planning IA"
              onClick={() => setExpanded(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid #22262D",
                background: "#0B0D10",
                color: "#64748B",
                cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
            Parle ou écris librement — n&apos;importe quelle date, même dans un an. L&apos;IA propose, tu valides
            avant d&apos;écrire dans l&apos;agenda.
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dis ou écris ce que tu veux planifier…"
            rows={4}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #22262D",
              background: "#0B0D10",
              color: "#E7E9EC",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              resize: "vertical",
              marginBottom: 10,
            }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              disabled={!isLoaded || busy}
              onClick={handleAnalyze}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #A855F7",
                background: "#221230",
                color: "#D8B4FE",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Sparkles size={14} />
              {busy && !recording ? "Analyse…" : "Analyser le texte"}
            </button>

            {!recording ? (
              <button
                type="button"
                disabled={!isLoaded || busy}
                onClick={startRecording}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #EF4444",
                  background: "#2A1414",
                  color: "#FCA5A5",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Mic size={14} />
                Parler
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #EF4444",
                  background: "#EF4444",
                  color: "#0B0D10",
                  cursor: "pointer",
                }}
              >
                <MicOff size={14} />
                Stop & analyser
              </button>
            )}
          </div>

          {recording && (
            <div style={{ fontSize: 11, color: "#FCA5A5", marginBottom: 10 }}>Enregistrement en cours…</div>
          )}

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "#F87171",
                marginBottom: 12,
                padding: "8px 10px",
                background: "#2A1414",
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}

          {summary && <div style={{ fontSize: 12, color: "#D8B4FE", marginBottom: 10 }}>{summary}</div>}

          {transcript && transcript !== text && (
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>Transcription : {transcript}</div>
          )}

          {proposals?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>Aperçu — valide avant application</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {proposals.map((p, idx) => (
                  <div
                    key={`${p.date}-${p.blockId}-${idx}`}
                    style={{
                      fontSize: 11,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #22262D",
                      background: "#0B0D10",
                      color: "#E7E9EC",
                    }}
                  >
                    <span style={{ color: "#A855F7" }}>{formatFrDate(p.date)}</span>
                    {" · "}
                    {p.start}–{p.end} — {p.blockLabel}
                    {" · "}
                    <span style={{ color: p.checked ? "#4ADE80" : "#F87171" }}>
                      {p.checked ? "cocher" : "décocher"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {proposals?.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={handleApply}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #4ADE80",
                background: "#0F2417",
                color: "#4ADE80",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Appliquer à l&apos;agenda
            </button>
          )}
        </div>
      )}
    </div>
  );
}
