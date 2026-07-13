import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, MessageCircle, Phone, Send, Users, Video, X } from "lucide-react";
import { useAuth, useUser } from "@clerk/react";
import { useCallManager } from "./useCall.js";
import { playMediaElement } from "./webrtcCall.js";

const TABS = {
  messages: "messages",
  vision: "vision",
  profil: "profil",
};

const EPHEMERAL_OPTIONS = [
  { value: "after_view", label: "Après visionnage" },
  { value: "30s", label: "30 sec" },
  { value: "1m", label: "1 min" },
  { value: "30m", label: "30 min" },
  { value: "1d", label: "1 journée" },
];

const PRESENCE_OPTIONS = [
  { value: "online", label: "En ligne", color: "#4ADE80" },
  { value: "busy", label: "Occupé", color: "#F87171" },
  { value: "away", label: "Absent", color: "#EAB308" },
  { value: "offline", label: "Déconnecté", color: "#64748B" },
];

function presenceColor(status) {
  return PRESENCE_OPTIONS.find((o) => o.value === status)?.color || "#64748B";
}

function StatusDot({ status, size = 8 }) {
  return (
    <span
      title={PRESENCE_OPTIONS.find((o) => o.value === status)?.label || status}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: presenceColor(status),
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

async function chatFetch(path, { token, method = "GET", body, formData } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload = body;
  if (body && !formData) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: formData || payload });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Réponse serveur invalide — redémarre npm run start:local.");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Erreur serveur");
  return json;
}

function tabStyle(active) {
  return {
    fontSize: 11,
    padding: "6px 12px",
    borderRadius: 8,
    border: active ? "1px solid #14B8A6" : "1px solid #22262D",
    background: active ? "#0C2622" : "#0B0D10",
    color: active ? "#5EEAD4" : "#64748B",
    cursor: "pointer",
  };
}

function avatarStyle(color, size) {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: size * 0.4,
    color: "#0B0D10",
    flexShrink: 0,
  };
}

function MiniMap({ people, onSelect, selectedId }) {
  return (
    <div
      style={{
        position: "relative",
        height: 200,
        borderRadius: 12,
        border: "1px solid #22262D",
        background: "linear-gradient(160deg, #0B0D10 0%, #14171B 50%, #0C2622 100%)",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.15,
          backgroundImage:
            "linear-gradient(#22262D 1px, transparent 1px), linear-gradient(90deg, #22262D 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          transform: "translate(-50%, -50%)",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#E7E9EC",
          boxShadow: "0 0 0 4px rgba(231,233,236,0.2)",
        }}
        title="Toi"
      />
      {people.map((p, i) => {
        const positions = [
          { left: "62%", top: "28%" },
          { left: "24%", top: "58%" },
          { left: "72%", top: "66%" },
          { left: "38%", top: "22%" },
          { left: "55%", top: "72%" },
        ];
        const pos = positions[i % positions.length];
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            title={p.name}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              transform: "translate(-50%, -50%)",
              width: selectedId === p.id ? 16 : 12,
              height: selectedId === p.id ? 16 : 12,
              borderRadius: "50%",
              background: p.color,
              border: selectedId === p.id ? "2px solid #E7E9EC" : "2px solid #0B0D10",
              cursor: "pointer",
              padding: 0,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 9, color: "#64748B" }}>
        Vision d&apos;ensemble
      </div>
    </div>
  );
}

function callBtnStyle(kind) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: kind === "video" ? "1px solid #3B82F6" : "1px solid #4ADE80",
    background: kind === "video" ? "#111E33" : "#0F2417",
    color: kind === "video" ? "#93C5FD" : "#4ADE80",
    cursor: "pointer",
    flexShrink: 0,
  };
}

function CallActionButtons({ onPhone, onVideo, size = 36 }) {
  const s = { width: size, height: size };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button type="button" aria-label="Appel vocal" onClick={(e) => { e.stopPropagation(); onPhone?.(); }} style={{ ...callBtnStyle("phone"), ...s }}>
        <Phone size={size <= 32 ? 14 : 16} />
      </button>
      <button type="button" aria-label="Appel vidéo" onClick={(e) => { e.stopPropagation(); onVideo?.(); }} style={{ ...callBtnStyle("video"), ...s }}>
        <Video size={size <= 32 ? 14 : 16} />
      </button>
    </div>
  );
}

function ActiveCallOverlay({ callState, person, onEnd }) {
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const isVideo = callState.mode === "video";

  useEffect(() => {
    if (localRef.current && callState.localStream) {
      playMediaElement(localRef.current, callState.localStream);
    }
  }, [callState.localStream]);

  useEffect(() => {
    const stream = callState.remoteStream;
    if (!stream) return;
    const play = () => {
      playMediaElement(remoteRef.current, stream);
      playMediaElement(remoteAudioRef.current, stream);
    };
    play();
    stream.addEventListener("addtrack", play);
    return () => stream.removeEventListener("addtrack", play);
  }, [callState.remoteStream, callState.mediaTick]);

  return (
    <div style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #3B82F6", background: "#0B0D10" }}>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      {isVideo ? (
        <div style={{ position: "relative", height: 220, background: "#000" }}>
          <video ref={remoteRef} autoPlay playsInline muted={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <video ref={localRef} autoPlay playsInline muted style={{ position: "absolute", right: 8, bottom: 8, width: 88, height: 120, objectFit: "cover", borderRadius: 8, border: "2px solid #22262D" }} />
        </div>
      ) : (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={avatarStyle(person?.color || "#14B8A6", 56)}>{person?.name?.[0] || "?"}</div>
          <div style={{ fontSize: 13, color: callState.remoteReady ? "#4ADE80" : "#93C5FD", marginTop: 8 }}>
            {callState.ringing ? "Sonnerie…" : callState.remoteReady ? "En ligne" : "Connexion…"}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#14171B" }}>
        <div style={{ fontSize: 12, color: "#E7E9EC" }}>
          {person?.name || "Appel"} · {callState.ringing ? "Sonnerie…" : "En cours"}
        </div>
        <button type="button" onClick={onEnd} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "#EF4444", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Raccrocher">
          <Phone size={16} style={{ transform: "rotate(135deg)" }} />
        </button>
      </div>
    </div>
  );
}

function IncomingCallBanner({ call, onAccept, onDecline }) {
  return (
    <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: "1px solid #3B82F6", background: "#111E33" }}>
      <div style={{ fontSize: 12, color: "#93C5FD", marginBottom: 8 }}>
        {call.mode === "video" ? "Appel vidéo" : "Appel audio"} entrant — {call.callerName}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onAccept} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", background: "#22C55E", color: "#0B0D10", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Décrocher</button>
        <button type="button" onClick={onDecline} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #7F1D1D", background: "transparent", color: "#F87171", cursor: "pointer", fontSize: 12 }}>Refuser</button>
      </div>
    </div>
  );
}

function EphemeralVideoMessage({ msg, getToken, onExpired }) {
  const videoRef = useRef(null);
  const [gone, setGone] = useState(msg.expired);
  const viewedRef = useRef(false);

  useEffect(() => {
    setGone(msg.expired);
  }, [msg.expired]);

  useEffect(() => {
    if (!msg.expiresAt || msg.mine) return;
    const ms = new Date(msg.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setGone(true);
      onExpired?.();
      return;
    }
    const t = setTimeout(() => {
      setGone(true);
      onExpired?.();
    }, ms);
    return () => clearTimeout(t);
  }, [msg.expiresAt, msg.mine, onExpired]);

  const registerView = async (finished) => {
    if (msg.mine || viewedRef.current && !finished) return;
    try {
      const token = await getToken();
      if (!token) return;
      const json = await chatFetch(`/api/chat/messages/${msg.id}/view`, {
        token,
        method: "POST",
        body: { finished: !!finished },
      });
      if (json.message?.expired) {
        setGone(true);
        onExpired?.();
      }
      if (!finished) viewedRef.current = true;
    } catch {
      /* ignore */
    }
  };

  if (gone || (!msg.mediaUrl && msg.ephemeral)) {
    return (
      <div style={{ fontSize: 11, color: "#64748B", fontStyle: "italic", padding: "6px 0" }}>
        Vidéo — disparue
      </div>
    );
  }

  return (
    <div>
      {msg.ephemeral && (
        <div style={{ fontSize: 9, color: "#A855F7", marginBottom: 4, letterSpacing: 0.5 }}>
          ÉPHÉMÈRE
        </div>
      )}
      <video
        ref={videoRef}
        src={msg.mediaUrl}
        controls
        playsInline
        style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, background: "#000" }}
        onPlay={() => registerView(false)}
        onEnded={() => registerView(true)}
      />
    </div>
  );
}

function MessageBubble({ msg, getToken, onExpired }) {
  const mine = msg.mine;
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div
        style={{
          maxWidth: "85%",
          padding: "8px 12px",
          borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: mine ? "#0C2622" : "#14171B",
          border: mine ? "1px solid #14B8A6" : "1px solid #22262D",
        }}
      >
        {msg.type === "video" ? (
          <EphemeralVideoMessage msg={msg} getToken={getToken} onExpired={onExpired} />
        ) : (
          <div style={{ fontSize: 12, color: "#E7E9EC", whiteSpace: "pre-wrap" }}>{msg.body}</div>
        )}
        {msg.ephemeral && mine && (
          <div style={{ fontSize: 9, color: "#64748B", marginTop: 4 }}>
            {msg.expired ? "Expiré pour le destinataire" : "Éphémère envoyée"}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonProfile({ person, onBack, onMessage, onPhone, onVideo }) {
  if (!person) return null;
  return (
    <div>
      <button type="button" onClick={onBack} style={{ fontSize: 11, color: "#64748B", background: "none", border: "none", cursor: "pointer", marginBottom: 12, padding: 0 }}>
        ← Retour
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={avatarStyle(person.color, 48)}>{person.name[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E7E9EC" }}>{person.name}</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>
            {person.hint || "—"}
            {person.presenceLabel ? ` · ${person.presenceLabel}` : person.online ? " · En ligne" : ""}
          </div>
        </div>
        <CallActionButtons onPhone={onPhone} onVideo={onVideo} size={34} />
      </div>
      <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #22262D", background: "#0B0D10", marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Compatibilité</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: person.color }}>{person.compatibility}%</div>
      </div>
      <button type="button" onClick={() => onMessage(person.id)} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid #14B8A6", background: "#0C2622", color: "#5EEAD4", cursor: "pointer" }}>
        <Send size={14} />
        Message
      </button>
    </div>
  );
}

function VideoPanel({ ephemeral, setEphemeral, ephemeralMode, setEphemeralMode, onPickFile, busy, onClose }) {
  return (
    <div style={{ marginBottom: 10, padding: 12, borderRadius: 10, border: "1px solid #22262D", background: "#0B0D10" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>Vidéo</div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, cursor: "pointer" }}>
        <span style={{ fontSize: 12, color: "#E7E9EC" }}>Éphémère</span>
        <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#A855F7" }} />
      </label>
      {ephemeral && (
        <select
          value={ephemeralMode}
          onChange={(e) => setEphemeralMode(e.target.value)}
          style={{ width: "100%", marginBottom: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #22262D", background: "#14171B", color: "#E7E9EC", fontSize: 12 }}
        >
          {EPHEMERAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
      <label style={{ display: "block", fontSize: 11, color: "#64748B", marginBottom: 6 }}>Galerie</label>
      <input type="file" accept="video/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} style={{ fontSize: 11, color: "#94A3B8", width: "100%", marginBottom: 8 }} />
      <label style={{ display: "block", fontSize: 11, color: "#64748B", marginBottom: 6 }}>Caméra</label>
      <input type="file" accept="video/*" capture="environment" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }} style={{ fontSize: 11, color: "#94A3B8", width: "100%" }} />
      {busy && <div style={{ fontSize: 10, color: "#64748B", marginTop: 6 }}>Envoi…</div>}
    </div>
  );
}

export default function Chat() {
  const { user } = useUser();
  const { getToken, isLoaded } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState(TABS.messages);
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadOther, setThreadOther] = useState(null);
  const [draft, setDraft] = useState("");
  const [busySend, setBusySend] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [showVideoPanel, setShowVideoPanel] = useState(false);
  const [videoEphemeral, setVideoEphemeral] = useState(true);
  const [videoEphemeralMode, setVideoEphemeralMode] = useState("after_view");
  const [videoBusy, setVideoBusy] = useState(false);

  const [myProfile, setMyProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState({ hint: "", color: "#14B8A6", shareAgenda: false, presenceStatus: "online" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");

  const unreadTotal = people.reduce((n, p) => n + (p.unread || 0), 0);
  const selectedPerson = people.find((p) => p.id === selectedPersonId);
  const threadPerson = threadOther || people.find((p) => p.id === activeThreadId);
  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const isLocalhost = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname);

  const {
    callState,
    incomingCall,
    callError,
    startOutgoingCall,
    acceptIncoming,
    declineIncoming,
    endCall,
  } = useCallManager({
    getToken,
    userId: user?.id,
    enabled: isLoaded && !!user?.id,
    peopleById,
    onIncoming: () => setExpanded(true),
  });

  const loadPeople = useCallback(async () => {
    if (!isLoaded) return;
    setLoadingPeople(true);
    setPeopleError("");
    try {
      const token = await getToken();
      await chatFetch("/api/chat/presence", { token, method: "POST" });
      const json = await chatFetch("/api/chat/people", { token });
      setPeople(json.people || []);
    } catch (e) {
      setPeopleError(e.message);
    } finally {
      setLoadingPeople(false);
    }
  }, [getToken, isLoaded]);

  const loadProfile = useCallback(async () => {
    if (!isLoaded) return;
    try {
      const token = await getToken();
      const json = await chatFetch("/api/chat/profile/me", { token });
      setMyProfile(json);
      setProfileDraft({
        hint: json.hint || "",
        color: json.color || "#14B8A6",
        shareAgenda: !!json.shareAgenda,
        presenceStatus: json.presenceStatus || "online",
      });
    } catch (e) {
      setProfileError(e.message);
    }
  }, [getToken, isLoaded]);

  const loadThread = useCallback(async () => {
    if (!activeThreadId || !isLoaded) return;
    setThreadError("");
    try {
      const token = await getToken();
      const json = await chatFetch(`/api/chat/conversations/${activeThreadId}/messages`, { token });
      setMessages(json.messages || []);
      setThreadOther(json.other);
    } catch (e) {
      setThreadError(e.message);
    }
  }, [activeThreadId, getToken, isLoaded]);

  useEffect(() => {
    if (expanded) {
      loadPeople();
      loadProfile();
    }
  }, [expanded, loadPeople, loadProfile]);

  useEffect(() => {
    if (!expanded || !activeThreadId) return;
    loadThread();
    const t = setInterval(loadThread, 4000);
    return () => clearInterval(t);
  }, [expanded, activeThreadId, loadThread]);

  useEffect(() => {
    if (!expanded) return;
    const ping = () => {
      getToken().then((token) => {
        if (token) chatFetch("/api/chat/presence", { token, method: "POST" }).catch(() => {});
      });
    };
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [expanded, getToken]);

  const saveProfile = async (patch) => {
    setProfileSaving(true);
    setProfileError("");
    try {
      const token = await getToken();
      const json = await chatFetch("/api/chat/profile/me", {
        token,
        method: "PUT",
        body: patch,
      });
      setMyProfile(json);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const sendText = async () => {
    const text = draft.trim();
    if (!text || !activeThreadId || busySend) return;
    setBusySend(true);
    try {
      const token = await getToken();
      await chatFetch(`/api/chat/conversations/${activeThreadId}/messages`, {
        token,
        method: "POST",
        body: { type: "text", body: text },
      });
      setDraft("");
      await loadThread();
      await loadPeople();
    } catch (e) {
      setThreadError(e.message);
    } finally {
      setBusySend(false);
    }
  };

  const sendVideo = async (file) => {
    if (!activeThreadId || videoBusy) return;
    setVideoBusy(true);
    setThreadError("");
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const up = await chatFetch("/api/upload", { token, method: "POST", formData: form });
      await chatFetch(`/api/chat/conversations/${activeThreadId}/messages`, {
        token,
        method: "POST",
        body: {
          type: "video",
          mediaUrl: up.url,
          ephemeral: videoEphemeral,
          ephemeralMode: videoEphemeral ? videoEphemeralMode : null,
        },
      });
      setShowVideoPanel(false);
      await loadThread();
      await loadPeople();
    } catch (e) {
      setThreadError(e.message);
    } finally {
      setVideoBusy(false);
    }
  };

  const startCall = (person, mode) => {
    if (!person?.id) return;
    setExpanded(true);
    startOutgoingCall(person.id, mode);
  };

  const openThread = (id) => {
    setActiveThreadId(id);
    setSelectedPersonId(null);
    setTab(TABS.messages);
    setMessages([]);
    setShowVideoPanel(false);
  };

  const inputStyle = {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #22262D",
    background: "#14171B",
    color: "#E7E9EC",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  };

  return (
    <div style={{ flexBasis: expanded ? "100%" : "auto", width: expanded ? "100%" : "auto" }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label="Ouvrir Chat"
        onClick={() => setExpanded(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          borderRadius: 999,
          border: expanded ? "1px solid #5EEAD4" : "1px solid #14B8A6",
          background: expanded ? "#0C2622" : "#0B0D10",
          color: "#5EEAD4",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 0.5,
        }}
      >
        <MessageCircle size={13} color="#14B8A6" />
        <span>Chat</span>
        {unreadTotal > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999, background: "#14B8A6", color: "#0B0D10", lineHeight: 1.4 }}>
            {unreadTotal}
          </span>
        )}
      </button>

      {incomingCall && !callState && (
        <div style={{ marginTop: 8, maxWidth: 420 }}>
          <IncomingCallBanner call={incomingCall} onAccept={acceptIncoming} onDecline={declineIncoming} />
        </div>
      )}

      {callState && (
        <div style={{ marginTop: 8, maxWidth: expanded ? "none" : 420 }}>
          <ActiveCallOverlay
            callState={callState}
            person={peopleById[callState.otherId] || threadPerson || selectedPerson}
            onEnd={endCall}
          />
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, background: "linear-gradient(135deg, #0C2622 0%, #14171B 100%)", border: "1px solid #14B8A6", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircle size={18} color="#14B8A6" />
              <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748B", textTransform: "uppercase" }}>Chat</div>
            </div>
            <button
              type="button"
              aria-label="Fermer Chat"
              onClick={() => {
                setExpanded(false);
                setSelectedPersonId(null);
                setActiveThreadId(null);
                setShowVideoPanel(false);
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid #22262D", background: "#0B0D10", color: "#64748B", cursor: "pointer" }}
            >
              <X size={14} />
            </button>
          </div>

          {!selectedPersonId && !activeThreadId && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button type="button" style={tabStyle(tab === TABS.messages)} onClick={() => setTab(TABS.messages)}>Messages</button>
              <button type="button" style={tabStyle(tab === TABS.vision)} onClick={() => setTab(TABS.vision)}>Vision</button>
              <button type="button" style={tabStyle(tab === TABS.profil)} onClick={() => setTab(TABS.profil)}>Mon profil</button>
            </div>
          )}

          {peopleError && <div style={{ fontSize: 11, color: "#F87171", marginBottom: 10 }}>{peopleError}</div>}

          {isLocalhost && (
            <div style={{ fontSize: 10, color: "#EAB308", marginBottom: 10, lineHeight: 1.5 }}>
              PC + smartphone : ouvre <strong>https://mon-planning-s4y6.onrender.com</strong> sur les deux appareils (localhost ne marche pas entre appareils).
            </div>
          )}

          {callError && <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>{callError}</div>}

          {selectedPersonId && (
            <PersonProfile
              person={selectedPerson}
              onBack={() => { setSelectedPersonId(null); }}
              onMessage={openThread}
              onPhone={() => startCall(selectedPerson, "phone")}
              onVideo={() => startCall(selectedPerson, "video")}
            />
          )}

          {activeThreadId && threadPerson && !selectedPersonId && (
            <div>
              <button type="button" onClick={() => { setActiveThreadId(null); setShowVideoPanel(false); }} style={{ fontSize: 11, color: "#64748B", background: "none", border: "none", cursor: "pointer", marginBottom: 12, padding: 0 }}>
                ← Conversations
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={avatarStyle(threadPerson.color, 40)}>{threadPerson.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EC" }}>{threadPerson.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: presenceColor(threadPerson.presenceStatus || "online") }}>
                    <StatusDot status={threadPerson.presenceStatus || "online"} size={7} />
                    {threadPerson.presenceLabel || "En ligne"}
                  </div>
                </div>
                <CallActionButtons onPhone={() => startCall(threadPerson, "phone")} onVideo={() => startCall(threadPerson, "video")} />
              </div>

              <div style={{ maxHeight: 280, overflowY: "auto", padding: "4px 2px", marginBottom: 10 }}>
                {messages.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#64748B", padding: 12, textAlign: "center" }}>Aucun message — écris en premier.</div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={m.id} msg={m} getToken={getToken} onExpired={loadThread} />
                  ))
                )}
              </div>

              {threadError && <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>{threadError}</div>}

              {showVideoPanel && (
                <VideoPanel
                  ephemeral={videoEphemeral}
                  setEphemeral={setVideoEphemeral}
                  ephemeralMode={videoEphemeralMode}
                  setEphemeralMode={setVideoEphemeralMode}
                  onPickFile={sendVideo}
                  busy={videoBusy}
                  onClose={() => setShowVideoPanel(false)}
                />
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setShowVideoPanel((v) => !v)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", border: showVideoPanel ? "1px solid #A855F7" : "1px solid #22262D", background: showVideoPanel ? "#221230" : "#14171B", color: showVideoPanel ? "#D8B4FE" : "#64748B", cursor: "pointer", flexShrink: 0 }}
                  title="Vidéo"
                >
                  <Video size={15} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                  placeholder="Écrire un message…"
                  style={inputStyle}
                />
                <button
                  type="button"
                  disabled={busySend || !draft.trim()}
                  onClick={sendText}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, border: "1px solid #14B8A6", background: "#0C2622", color: "#5EEAD4", cursor: busySend ? "wait" : "pointer", opacity: draft.trim() ? 1 : 0.45 }}
                  title="Envoyer"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.messages && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingPeople && <div style={{ fontSize: 11, color: "#64748B" }}>Chargement…</div>}
              {!loadingPeople && people.length === 0 && (
                <div style={{ fontSize: 12, color: "#64748B", padding: 16, textAlign: "center", lineHeight: 1.5 }}>
                  Aucun autre membre pour l&apos;instant. Dès qu&apos;un autre compte se connecte, il apparaît ici.
                </div>
              )}
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => openThread(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "1px solid #22262D", background: "#0B0D10", cursor: "pointer" }}>
                  <div style={avatarStyle(p.color, 36)}>{p.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#E7E9EC" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.lastMsg || "Nouvelle conversation"}</div>
                  </div>
                  {p.unread > 0 ? (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "#14B8A6", color: "#0B0D10" }}>{p.unread}</span>
                  ) : (
                    <StatusDot status={p.presenceStatus || "online"} />
                  )}
                </button>
              ))}
            </div>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.vision && (
            <>
              {people.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748B", padding: 12 }}>Personne d&apos;autre inscrit pour l&apos;instant.</div>
              ) : (
                <>
                  <MiniMap people={people} selectedId={selectedPersonId} onSelect={setSelectedPersonId} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {people.map((p) => (
                      <button key={p.id} type="button" onClick={() => setSelectedPersonId(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid #22262D", background: "#0B0D10", cursor: "pointer" }}>
                        <MapPin size={14} color={p.color} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 12, color: "#E7E9EC" }}>{p.name}</span>
                        {p.hint && <span style={{ fontSize: 11, color: "#64748B" }}> · {p.hint}</span>}
                        <span style={{ fontSize: 11, color: presenceColor(p.presenceStatus || "online") }}> · {p.presenceLabel || "En ligne"}</span>
                      </div>
                      <StatusDot status={p.presenceStatus || "online"} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.profil && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={avatarStyle(profileDraft.color, 48)}>
                  {(user?.firstName?.[0] || user?.username?.[0] || "?").toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EC" }}>{user?.fullName || user?.username || "Mon profil"}</div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>Couleur · statut · visibilité</div>
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>Statut</div>
                <select
                  value={profileDraft.presenceStatus}
                  onChange={(e) => {
                    const presenceStatus = e.target.value;
                    setProfileDraft((d) => ({ ...d, presenceStatus }));
                    saveProfile({ presenceStatus });
                    if (presenceStatus !== "offline") loadPeople();
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #22262D", background: "#14171B", color: "#E7E9EC", fontSize: 12 }}
                >
                  {PRESENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 4 }}>
                  Visible pour les autres sauf si « Déconnecté ». L&apos;agenda reste un partage séparé.
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>Couleur</div>
                <input
                  type="color"
                  value={profileDraft.color}
                  onChange={(e) => {
                    const color = e.target.value;
                    setProfileDraft((d) => ({ ...d, color }));
                    saveProfile({ color });
                  }}
                  style={{ width: 48, height: 32, border: "none", background: "none", cursor: "pointer" }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>Statut / indices</div>
                <input
                  value={profileDraft.hint}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, hint: e.target.value }))}
                  onBlur={() => saveProfile({ hint: profileDraft.hint })}
                  placeholder="Ex. Sport · Dev · Musique"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: "1px solid #22262D", background: "#0B0D10", marginBottom: 10, cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#E7E9EC" }}>Partager mon emploi du temps</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>Optionnel — rien à voir avec ta visibilité</div>
                </div>
                <input
                  type="checkbox"
                  checked={profileDraft.shareAgenda}
                  onChange={(e) => {
                    const shareAgenda = e.target.checked;
                    setProfileDraft((d) => ({ ...d, shareAgenda }));
                    saveProfile({ shareAgenda });
                  }}
                  style={{ width: 16, height: 16, accentColor: "#14B8A6" }}
                />
              </label>

              {profileSaving && <div style={{ fontSize: 10, color: "#64748B" }}>Enregistrement…</div>}
              {profileError && <div style={{ fontSize: 11, color: "#F87171" }}>{profileError}</div>}
              {myProfile && !profileError && !profileSaving && (
                <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #22262D", background: "#0B0D10", fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
                  <Users size={14} color="#14B8A6" style={{ verticalAlign: "middle", marginRight: 6 }} />
                  Géoloc : prochaine étape. Message direct autorisé.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
