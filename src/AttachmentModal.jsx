import React, { useState } from "react";
import { X, Link as LinkIcon, Image, Film, Trash2 } from "lucide-react";

export default function AttachmentModal({
  blockLabel,
  items,
  onClose,
  onAdd,
  onRemove,
  getToken,
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const uploadFile = async (file, typeHint) => {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur upload");
      await onAdd({
        type: json.type || typeHint,
        url: json.url,
        label: file.name,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    if (!linkUrl.trim()) return;
    setBusy(true);
    setError("");
    try {
      let type = "link";
      if (/\.(mp4|webm|mov)(\?|$)/i.test(linkUrl) || linkUrl.includes("youtube.com") || linkUrl.includes("youtu.be")) {
        type = "video";
      } else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(linkUrl)) {
        type = "photo";
      }
      await onAdd({ type, url: linkUrl.trim(), label: linkLabel.trim() || linkUrl.trim() });
      setLinkUrl("");
      setLinkLabel("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #22262D",
    background: "#0B0D10",
    color: "#E7E9EC",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#14171B",
          border: "1px solid #22262D",
          borderRadius: 14,
          maxWidth: 480,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>Trombone</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#E7E9EC" }}>{blockLabel}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Aucune pièce jointe pour ce bloc.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "#0B0D10",
                  borderRadius: 8,
                  border: "1px solid #1E2127",
                }}
              >
                {item.type === "photo" ? <Image size={16} color="#3B82F6" /> : item.type === "video" ? <Film size={16} color="#A855F7" /> : <LinkIcon size={16} color="#F97316" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{item.type === "photo" ? "Photo" : item.type === "video" ? "Vidéo" : "Lien"}</div>
                  <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#93C5FD", wordBreak: "break-all" }}>
                    {item.label || item.url}
                  </a>
                </div>
                <button type="button" onClick={() => onRemove(item.id)} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer" }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Ajouter un lien</div>
        <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Titre (optionnel)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
        <button
          type="button"
          disabled={busy || !linkUrl.trim()}
          onClick={addLink}
          style={{ width: "100%", marginBottom: 16, padding: "8px 12px", borderRadius: 8, border: "1px solid #3B82F6", background: "#111E33", color: "#93C5FD", cursor: "pointer", fontSize: 12 }}
        >
          Attacher le lien
        </button>

        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>Ajouter une photo ou une vidéo (fichier)</div>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="file"
            accept="image/*,video/*"
            disabled={busy}
            style={{ fontSize: 11, color: "#94A3B8" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file, file.type.startsWith("video/") ? "video" : "photo");
              e.target.value = "";
            }}
          />
        </label>

        {error && <div style={{ fontSize: 11, color: "#F87171", marginTop: 8 }}>{error}</div>}
        {busy && <div style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>Envoi en cours…</div>}
      </div>
    </div>
  );
}
