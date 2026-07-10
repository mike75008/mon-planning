import React, { useState } from "react";
import { MapPin, MessageCircle, Phone, Send, Users, Video, X } from "lucide-react";
import { useUser } from "@clerk/react";

const TABS = {
  messages: "messages",
  vision: "vision",
  profil: "profil",
};

const MOCK_PEOPLE = [
  {
    id: "1",
    name: "Lina",
    color: "#F472B6",
    distance: "120 m",
    hint: "Sport ce matin",
    compatibility: 68,
    online: true,
    lastMsg: "Tu cours aussi vers 10h ?",
    unread: 2,
  },
  {
    id: "2",
    name: "Karim",
    color: "#3B82F6",
    distance: "850 m",
    hint: "Dev l'après-midi",
    compatibility: 54,
    online: false,
    lastMsg: "Salut, je t'ai vu sur la carte",
    unread: 0,
  },
  {
    id: "3",
    name: "Jade",
    color: "#22C55E",
    distance: "2,1 km",
    hint: "Musique · Permis",
    compatibility: 71,
    online: true,
    lastMsg: "",
    unread: 0,
  },
];

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
        ];
        const pos = positions[i] || { left: "40%", top: "40%" };
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
        Vision d&apos;ensemble — aperçu
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
      <button
        type="button"
        aria-label="Appel vocal"
        onClick={(e) => {
          e.stopPropagation();
          onPhone?.();
        }}
        style={{ ...callBtnStyle("phone"), ...s }}
      >
        <Phone size={size <= 32 ? 14 : 16} />
      </button>
      <button
        type="button"
        aria-label="Appel vidéo"
        onClick={(e) => {
          e.stopPropagation();
          onVideo?.();
        }}
        style={{ ...callBtnStyle("video"), ...s }}
      >
        <Video size={size <= 32 ? 14 : 16} />
      </button>
    </div>
  );
}

function CallPreviewOverlay({ person, mode, onClose }) {
  if (!person || !mode) return null;
  const isVideo = mode === "video";
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #22262D",
        background: isVideo ? "#0B0D10" : "#0F2417",
      }}
    >
      <div
        style={{
          height: isVideo ? 160 : 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: isVideo
            ? `radial-gradient(circle at center, ${person.color}33 0%, #0B0D10 70%)`
            : "#0F2417",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: person.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#0B0D10",
          }}
        >
          {person.name[0]}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#E7E9EC" }}>{person.name}</div>
        <div style={{ fontSize: 11, color: isVideo ? "#93C5FD" : "#4ADE80" }}>
          {isVideo ? "Appel vidéo — aperçu" : "Appel vocal — aperçu"}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, padding: "12px 16px", background: "#14171B" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "#EF4444",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Raccrocher"
        >
          <Phone size={18} style={{ transform: "rotate(135deg)" }} />
        </button>
      </div>
    </div>
  );
}

function PersonProfile({ person, onBack, onMessage, onPhone, onVideo }) {
  if (!person) return null;
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontSize: 11,
          color: "#64748B",
          background: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 12,
          padding: 0,
        }}
      >
        ← Retour
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: person.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            color: "#0B0D10",
            flexShrink: 0,
          }}
        >
          {person.name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E7E9EC" }}>{person.name}</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>{person.distance} · {person.hint}</div>
        </div>
        <CallActionButtons onPhone={onPhone} onVideo={onVideo} size={34} />
      </div>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #22262D",
          background: "#0B0D10",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Compatibilité
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: person.color }}>{person.compatibility}%</div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 6, lineHeight: 1.5 }}>
          Visible uniquement quand tu consultes ce profil — l&apos;app ne te pousse personne.
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={() => onMessage(person.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #14B8A6",
            background: "#0C2622",
            color: "#5EEAD4",
            cursor: "pointer",
          }}
        >
          <Send size={14} />
          Message
        </button>
      </div>
    </div>
  );
}

export default function Chat() {
  const { user } = useUser();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState(TABS.messages);
  const [shareAgenda, setShareAgenda] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [draft, setDraft] = useState("");
  const [callPreview, setCallPreview] = useState(null);

  const unreadTotal = MOCK_PEOPLE.reduce((n, p) => n + p.unread, 0);
  const selectedPerson = MOCK_PEOPLE.find((p) => p.id === selectedPersonId);
  const threadPerson = MOCK_PEOPLE.find((p) => p.id === activeThreadId);

  const callPerson = selectedPerson || threadPerson;

  const startCall = (person, mode) => {
    setCallPreview({ person, mode });
  };

  const openThread = (id) => {
    setActiveThreadId(id);
    setSelectedPersonId(null);
    setTab(TABS.messages);
  };

  return (
    <div
      style={{
        flexBasis: expanded ? "100%" : "auto",
        width: expanded ? "100%" : "auto",
      }}
    >
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
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 999,
              background: "#14B8A6",
              color: "#0B0D10",
              lineHeight: 1.4,
            }}
          >
            {unreadTotal}
          </span>
        )}
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 12,
            background: "linear-gradient(135deg, #0C2622 0%, #14171B 100%)",
            border: "1px solid #14B8A6",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
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
                setCallPreview(null);
              }}
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
            Aperçu du réseau social — messages, vision d&apos;ensemble, profils. Ton agenda reste privé sauf si tu
            choisis de le partager.
          </div>

          {!selectedPersonId && !activeThreadId && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button type="button" style={tabStyle(tab === TABS.messages)} onClick={() => setTab(TABS.messages)}>
                Messages
              </button>
              <button type="button" style={tabStyle(tab === TABS.vision)} onClick={() => setTab(TABS.vision)}>
                Vision
              </button>
              <button type="button" style={tabStyle(tab === TABS.profil)} onClick={() => setTab(TABS.profil)}>
                Mon profil
              </button>
            </div>
          )}

          {selectedPersonId && (
            <PersonProfile
              person={selectedPerson}
              onBack={() => {
                setSelectedPersonId(null);
                setCallPreview(null);
              }}
              onMessage={openThread}
              onPhone={() => startCall(selectedPerson, "phone")}
              onVideo={() => startCall(selectedPerson, "video")}
            />
          )}

          {callPreview && callPerson && selectedPersonId && (
            <CallPreviewOverlay
              person={callPreview.person}
              mode={callPreview.mode}
              onClose={() => setCallPreview(null)}
            />
          )}

          {activeThreadId && threadPerson && !selectedPersonId && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setActiveThreadId(null);
                  setCallPreview(null);
                }}
                style={{
                  fontSize: 11,
                  color: "#64748B",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginBottom: 12,
                  padding: 0,
                }}
              >
                ← Conversations
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: threadPerson.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#0B0D10",
                    flexShrink: 0,
                  }}
                >
                  {threadPerson.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EC" }}>{threadPerson.name}</div>
                  {threadPerson.online && (
                    <div style={{ fontSize: 10, color: "#4ADE80" }}>En ligne</div>
                  )}
                </div>
                <CallActionButtons
                  onPhone={() => startCall(threadPerson, "phone")}
                  onVideo={() => startCall(threadPerson, "video")}
                />
              </div>

              {callPreview && callPreview.person?.id === threadPerson.id && (
                <CallPreviewOverlay
                  person={callPreview.person}
                  mode={callPreview.mode}
                  onClose={() => setCallPreview(null)}
                />
              )}
              <div
                style={{
                  minHeight: 120,
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #22262D",
                  background: "#0B0D10",
                  marginBottom: 10,
                }}
              >
                {threadPerson.lastMsg ? (
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>{threadPerson.lastMsg}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#64748B" }}>Aucun message — tu peux écrire en premier.</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "1px solid #22262D",
                    background: "#14171B",
                    color: "#64748B",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  title="Note vidéo (aperçu)"
                >
                  <Video size={15} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Écrire un message…"
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #22262D",
                    background: "#14171B",
                    color: "#E7E9EC",
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
                <button
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: "1px solid #14B8A6",
                    background: "#0C2622",
                    color: "#5EEAD4",
                    cursor: "pointer",
                  }}
                  title="Envoyer (aperçu)"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.messages && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MOCK_PEOPLE.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveThreadId(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #22262D",
                    background: "#0B0D10",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: p.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "#0B0D10",
                      flexShrink: 0,
                    }}
                  >
                    {p.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#E7E9EC" }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.lastMsg || "Nouvelle conversation"}
                    </div>
                  </div>
                  {p.unread > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: "#14B8A6",
                        color: "#0B0D10",
                      }}
                    >
                      {p.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.vision && (
            <>
              <MiniMap people={MOCK_PEOPLE} selectedId={selectedPersonId} onSelect={setSelectedPersonId} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MOCK_PEOPLE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPersonId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #22262D",
                      background: "#0B0D10",
                      cursor: "pointer",
                    }}
                  >
                    <MapPin size={14} color={p.color} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: "#E7E9EC" }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: "#64748B" }}> · {p.distance} · {p.hint}</span>
                    </div>
                    {p.online && (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {!selectedPersonId && !activeThreadId && tab === TABS.profil && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "#14B8A6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#0B0D10",
                  }}
                >
                  {(user?.firstName?.[0] || user?.username?.[0] || "?").toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E7E9EC" }}>
                    {user?.fullName || user?.username || "Mon profil"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>Couleur · statut · visibilité</div>
                </div>
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #22262D",
                  background: "#0B0D10",
                  marginBottom: 10,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#E7E9EC" }}>Partager mon emploi du temps</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
                    Off par défaut — personne ne voit ton agenda sans ton accord
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={shareAgenda}
                  onChange={(e) => setShareAgenda(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "#14B8A6" }}
                />
              </label>

              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #22262D",
                  background: "#0B0D10",
                  fontSize: 11,
                  color: "#64748B",
                  lineHeight: 1.5,
                }}
              >
                <Users size={14} color="#14B8A6" style={{ verticalAlign: "middle", marginRight: 6 }} />
                Géoloc et cartographie : opt-in séparé (à brancher). Message direct autorisé — carton jaune si abus.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
