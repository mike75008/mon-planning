import React, { useState, useEffect, useCallback } from "react";
import { Check, Flame, TrendingUp, RotateCcw, Circle } from "lucide-react";

const CATS = {
  sport:   { label: "Sport",              color: "#EF4444", bg: "#2A1414" },
  boot:    { label: "Lancement",          color: "#64748B", bg: "#1A1D22" },
  dev:     { label: "Dev",                color: "#3B82F6", bg: "#111E33" },
  pause:   { label: "Pause",              color: "#475569", bg: "#161A20" },
  market:  { label: "Marketing / IA",     color: "#F97316", bg: "#2B1A0C" },
  admin:   { label: "Admin identitaire",  color: "#EAB308", bg: "#2A2408" },
  music:   { label: "Musique",            color: "#A855F7", bg: "#221230" },
  permis:  { label: "Permis",             color: "#22C55E", bg: "#0F2417" },
  appart:  { label: "Appartement",        color: "#14B8A6", bg: "#0C2622" },
  close:   { label: "Clôture",            color: "#94A3B8", bg: "#1A1D22" },
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

function buildBlocks(dow) {
  return [
    { id: "sport",  start: "07:00", end: "08:00", cat: "sport",  label: "Sport", optional: true },
    { id: "boot",   start: "08:00", end: "08:15", cat: "boot",   label: "Lancement — check statut du jour" },
    { id: "dev1",   start: "08:15", end: "10:15", cat: "dev",    label: "Dev — appli prioritaire" },
    { id: "p1",     start: "10:15", end: "10:30", cat: "pause",  label: "Pause" },
    { id: "market", start: "10:30", end: "12:00", cat: "market", label: "Ambassadeurs IA / Marketing" },
    { id: "lunch",  start: "12:00", end: "13:00", cat: "pause",  label: "Déjeuner" },
    { id: "admin",  start: "13:00", end: "14:00", cat: "admin",  label: `Admin identitaire — ${ADMIN_ROTATION[dow]}` },
    { id: "dev2",   start: "14:00", end: "15:30", cat: "dev",    label: "Dev — suite / appli en retard" },
    { id: "p2",     start: "15:30", end: "15:45", cat: "pause",  label: "Pause" },
    { id: "music",  start: "15:45", end: "16:45", cat: "music",  label: "Musique — Suno / MusicGPT" },
    { id: "permis", start: "16:45", end: "17:45", cat: "permis", label: "Permis — code en ligne" },
    { id: "appart", start: "17:45", end: "18:15", cat: "appart", label: "Recherche appartement" },
    { id: "close",  start: "18:15", end: "18:30", cat: "close",  label: "Clôture — bilan 3 lignes" },
  ];
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

async function apiGetDay(dateStr) {
  const res = await fetch(`/api/day?date=${dateStr}`);
  if (!res.ok) throw new Error("erreur API day");
  const json = await res.json();
  return json.data || {};
}

async function apiSetDay(dateStr, data) {
  await fetch("/api/day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr, data }),
  });
}

async function apiGetWeek() {
  const res = await fetch(`/api/week`);
  if (!res.ok) throw new Error("erreur API week");
  const json = await res.json();
  return json.rows || [];
}

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const dow = now.getDay();
  const blocks = buildBlocks(dow);
  const dateStr = todayKey(now);

  const [checked, setChecked] = useState({});
  const [weekStats, setWeekStats] = useState([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const data = await apiGetDay(dateStr);
      setChecked(data);
    } catch {
      setChecked({});
    }
  }, [dateStr]);

  const loadWeek = useCallback(async () => {
    let rows = [];
    try {
      rows = await apiGetWeek();
    } catch {
      rows = [];
    }
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r.data]));

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    const results = days.map((d) => {
      const k = todayKey(d);
      const val = byDate[k] || {};
      const b = buildBlocks(d.getDay()).filter((bl) => !bl.optional && CATS[bl.cat].label !== "Pause");
      const done = b.filter((bl) => val[bl.id]).length;
      const pct = b.length ? Math.round((done / b.length) * 100) : 0;
      return { date: d, pct };
    });

    setWeekStats(results);

    let s = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].pct >= 70) s++;
      else break;
    }
    setStreak(s);
  }, []);

  useEffect(() => {
    loadToday();
    loadWeek();
  }, [loadToday, loadWeek]);

  const toggle = async (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try {
      await apiSetDay(dateStr, next);
    } catch {}
    loadWeek();
  };

  const resetToday = async () => {
    setChecked({});
    try {
      await apiSetDay(dateStr, {});
    } catch {}
    loadWeek();
  };

  const requiredBlocks = blocks.filter((b) => !b.optional && CATS[b.cat].label !== "Pause");
  const doneCount = requiredBlocks.filter((b) => checked[b.id]).length;
  const totalCount = requiredBlocks.length;
  const pctToday = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const nowStr = now.toTimeString().slice(0, 5);
  const isCurrent = (b) => nowStr >= b.start && nowStr < b.end;
  const isPast = (b) => nowStr >= b.end;

  return (
    <div style={{ minHeight: "100vh", background: "#0B0D10", color: "#E7E9EC", fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .sg { font-family: 'Space Grotesk', sans-serif; }
        ::selection { background: #3B82F6; color: white; }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748B", textTransform: "uppercase" }}>Emploi du temps</div>
            <div className="sg" style={{ fontSize: 26, fontWeight: 700, textTransform: "capitalize" }}>{dayLabel(now)}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#3B82F6" }}>{nowStr}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "20px 0" }}>
          <div style={{ background: "#14171B", border: "1px solid #22262D", borderRadius: 12, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>AUJOURD'HUI</div>
            <div className="sg" style={{ fontSize: 22, fontWeight: 700 }}>{pctToday}%</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{doneCount}/{totalCount} blocs</div>
          </div>
          <div style={{ background: "#14171B", border: "1px solid #22262D", borderRadius: 12, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Flame size={12} color="#F97316" /> SÉRIE
            </div>
            <div className="sg" style={{ fontSize: 22, fontWeight: 700 }}>{streak}j</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>≥70% validé</div>
          </div>
          <div style={{ background: "#14171B", border: "1px solid #22262D", borderRadius: 12, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <TrendingUp size={12} color="#22C55E" /> 7 JOURS
            </div>
            <div className="sg" style={{ fontSize: 22, fontWeight: 700 }}>
              {weekStats.length ? Math.round(weekStats.reduce((a, b) => a + b.pct, 0) / weekStats.length) : 0}%
            </div>
            <div style={{ fontSize: 11, color: "#64748B" }}>moyenne</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {weekStats.map((d, i) => {
            const isToday = todayKey(d.date) === dateStr;
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#64748B", marginBottom: 3, textTransform: "uppercase" }}>
                  {d.date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2)}
                </div>
                <div
                  style={{
                    height: 34,
                    borderRadius: 6,
                    background: d.pct >= 70 ? "#16341F" : d.pct > 0 ? "#2A2408" : "#181B20",
                    border: isToday ? "1px solid #3B82F6" : "1px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: d.pct >= 70 ? "#4ADE80" : d.pct > 0 ? "#EAB308" : "#3A3F47",
                  }}
                >
                  {d.pct}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {blocks.map((b) => {
            const cat = CATS[b.cat];
            const done = !!checked[b.id];
            const active = isCurrent(b);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: active ? `1px solid ${cat.color}` : "1px solid #1E2127",
                  background: done ? cat.bg : "#111318",
                  opacity: !done && isPast(b) && !active ? 0.55 : 1,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", width: 84, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {b.start}–{b.end}
                </div>
                <div style={{ width: 3, height: 26, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: done ? 500 : 400, color: done ? "#fff" : "#D1D5DB" }}>
                    {b.label}
                    {b.optional && <span style={{ color: "#64748B", fontSize: 11 }}> · optionnel</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: cat.color, marginTop: 1 }}>{cat.label}</div>
                </div>
                {done ? (
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={13} color="#0B0D10" strokeWidth={3} />
                  </div>
                ) : (
                  <Circle size={20} color="#2A2E36" style={{ flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={resetToday}
          style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748B", background: "none", border: "none", cursor: "pointer", padding: 4 }}
        >
          <RotateCcw size={12} /> Réinitialiser aujourd'hui
        </button>

        <div style={{ marginTop: 4, fontSize: 10.5, color: "#3A3F47" }}>
          Rotation admin : Lun=CV · Mar=LinkedIn · Mer=Réseaux musique · Jeu=Comptes appli · Ven=Nettoyage
        </div>
      </div>
    </div>
  );
}
