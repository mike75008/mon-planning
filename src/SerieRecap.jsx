import React, { useEffect, useState } from "react";
import { Clapperboard, Download } from "lucide-react";
import { useAuth } from "@clerk/react";
import { exportRecapAsPng } from "./exportShort.js";

const TAB_WEEK = "week";
const TAB_WEEKEND = "weekend";

function defaultPeriodForDay(dayOfWeek) {
  if (dayOfWeek === 0) return TAB_WEEKEND;
  if (dayOfWeek === 5) return TAB_WEEK;
  return TAB_WEEK;
}

function periodLabel(period) {
  return period === TAB_WEEK ? "Récapitulatif de la semaine" : "Récapitulatif du week-end";
}

function exportHint(dayOfWeek, period) {
  if (dayOfWeek === 5 && period === TAB_WEEK) {
    return "Vendredi — proposition d'épisode de la semaine et export short disponibles.";
  }
  if (dayOfWeek === 0 && period === TAB_WEEKEND) {
    return "Dimanche — proposition d'épisode du week-end et export short disponibles.";
  }
  return "Consulte et exporte ton épisode à tout moment. Les propositions automatiques sortent le vendredi (semaine) et le dimanche (week-end).";
}

export default function SerieRecap({ todayStr, dayOfWeek }) {
  const { getToken, isLoaded } = useAuth();
  const [period, setPeriod] = useState(() => defaultPeriodForDay(dayOfWeek));
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPeriod(defaultPeriodForDay(dayOfWeek));
  }, [dayOfWeek, todayStr]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken();
        if (!token) throw new Error("Session non prête — reconnecte-toi.");
        const res = await fetch(`/api/recap?period=${period}&date=${todayStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            "L'API récap n'a pas répondu (page HTML reçue). Lance npm run start:local ou déploie la dernière version du serveur."
          );
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erreur récap");
        if (!cancelled) setRecap(json);
      } catch (e) {
        if (!cancelled) {
          setRecap(null);
          setError(e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period, todayStr, getToken, isLoaded]);

  const tabStyle = (active) => ({
    fontSize: 11,
    padding: "6px 12px",
    borderRadius: 8,
    border: active ? "1px solid #3B82F6" : "1px solid #22262D",
    background: active ? "#111E33" : "#0B0D10",
    color: active ? "#93C5FD" : "#64748B",
    cursor: "pointer",
  });

  const isExportDay =
    (dayOfWeek === 5 && period === TAB_WEEK) || (dayOfWeek === 0 && period === TAB_WEEKEND);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #111E33 0%, #14171B 100%)",
        border: "1px solid #3B82F6",
        borderRadius: 14,
        padding: "16px 18px",
        marginTop: 24,
        marginBottom: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Clapperboard size={18} color="#3B82F6" />
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748B", textTransform: "uppercase" }}>Série vivante</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" style={tabStyle(period === TAB_WEEK)} onClick={() => setPeriod(TAB_WEEK)}>
          Semaine
        </button>
        <button type="button" style={tabStyle(period === TAB_WEEKEND)} onClick={() => setPeriod(TAB_WEEKEND)}>
          Week-end
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{periodLabel(period)}</div>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
        {exportHint(dayOfWeek, period)}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Chargement de l&apos;épisode…</div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#F87171", marginBottom: 12, padding: "8px 10px", background: "#2A1414", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!loading && recap && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#E7E9EC", marginBottom: 12, fontFamily: "'Space Grotesk', sans-serif" }}>
            {recap.titreEpisode}
          </div>

          {recap.items.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>
              Attache des photos, vidéos ou liens via les trombones — l&apos;épisode se construit au fil des jours.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {recap.items.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: `2px solid ${item.color || "#22262D"}`,
                    background: "#0B0D10",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    color: "#64748B",
                    textAlign: "center",
                    padding: 4,
                  }}
                >
                  {item.type === "photo" ? (
                    <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    item.type === "video" ? "Vidéo" : "Lien"
                  )}
                </div>
              ))}
              {recap.items.length > 6 && (
                <div style={{ fontSize: 11, color: "#64748B", alignSelf: "center" }}>+{recap.items.length - 6}</div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={exporting || recap.items.length === 0}
            onClick={async () => {
              setExporting(true);
              try {
                await exportRecapAsPng({
                  title: recap.titreEpisode,
                  items: recap.items,
                  periodLabel: periodLabel(period),
                });
              } finally {
                setExporting(false);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              padding: "8px 14px",
              borderRadius: 8,
              border: isExportDay ? "1px solid #4ADE80" : "1px solid #3B82F6",
              background: isExportDay ? "#0F2417" : "#111E33",
              color: isExportDay ? "#4ADE80" : "#93C5FD",
              cursor: recap.items.length === 0 ? "default" : "pointer",
              opacity: recap.items.length === 0 ? 0.5 : 1,
            }}
          >
            <Download size={14} />
            {isExportDay ? "Exporter le short — jour de publication" : "Exporter le short (PNG 9:16)"}
          </button>
        </>
      )}
    </div>
  );
}
