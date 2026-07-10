import React, { useState, useEffect, useCallback } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { Check, Flame, TrendingUp, RotateCcw, Circle, ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import AttachmentModal from "./AttachmentModal.jsx";
import SerieRecap from "./SerieRecap.jsx";
import { splitDayData, mergeDayData, attachmentCount } from "./dayData.js";

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function apiGetDay(dateStr, token) {
  const res = await fetch(`/api/day?date=${dateStr}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("erreur API day");
  const json = await res.json();
  return json.data || {};
}

async function apiSetDay(dateStr, data, token) {
  await fetch("/api/day", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ date: dateStr, data }),
  });
}

async function apiGetWeek(token) {
  const res = await fetch(`/api/week`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("erreur API week");
  const json = await res.json();
  return json.rows || [];
}

export default function Dashboard({ isAdmin, onOpenAdmin }) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [now, setNow] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [searchDate, setSearchDate] = useState("");
  const [editingRows, setEditingRows] = useState(new Set());

  const todayStr = todayKey(now);
  const dateStr = todayKey(viewDate);
  const dow = viewDate.getDay();
  const blocks = buildBlocks(dow);
  const isPastDay = dateStr < todayStr;
  const isToday = dateStr === todayStr;

  const [checked, setChecked] = useState({});
  const [attachments, setAttachments] = useState({});
  const [attachModal, setAttachModal] = useState(null);
  const [todayChecked, setTodayChecked] = useState({});
  const [weekStats, setWeekStats] = useState([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const loadDay = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiGetDay(dateStr, token);
      const { checked: c, attachments: att } = splitDayData(data);
      setChecked(c);
      setAttachments(att);
    } catch {
      setChecked({});
      setAttachments({});
    }
  }, [dateStr, getToken]);

  const loadTodayCard = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiGetDay(todayStr, token);
      const { checked: c } = splitDayData(data);
      setTodayChecked(c);
    } catch {
      setTodayChecked({});
    }
  }, [todayStr, getToken]);

  const loadWeek = useCallback(async () => {
    let rows = [];
    try {
      const token = await getToken();
      rows = await apiGetWeek(token);
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
  }, [getToken]);

  useEffect(() => {
    setEditingRows(new Set());
    loadDay();
  }, [loadDay, dateStr]);

  useEffect(() => {
    loadTodayCard();
  }, [loadTodayCard]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const goPrevDay = () => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 1);
    setViewDate(d);
  };

  const goNextDay = () => {
    if (isToday) return;
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 1);
    if (todayKey(d) > todayStr) return;
    setViewDate(d);
  };

  const goToDateKey = (key) => {
    if (!key) return;
    if (key > todayStr) return;
    setViewDate(parseDateKey(key));
  };

  const saveDayData = async (nextChecked, nextAttachments) => {
    try {
      const token = await getToken();
      await apiSetDay(dateStr, mergeDayData(nextChecked, nextAttachments), token);
    } catch {}
  };

  const toggle = async (id) => {
    const canEdit = !isPastDay || editingRows.has(id);
    if (!canEdit) return;
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    await saveDayData(next, attachments);
    if (dateStr === todayStr) setTodayChecked(next);
    loadWeek();
  };

  const openAttach = (e, block) => {
    e.stopPropagation();
    setAttachModal({ blockId: block.id, blockLabel: block.label });
  };

  const addAttachment = async (item) => {
    if (!attachModal) return;
    const entry = {
      id: crypto.randomUUID(),
      ...item,
      createdAt: new Date().toISOString(),
    };
    const list = [...(attachments[attachModal.blockId] || []), entry];
    const nextAtt = { ...attachments, [attachModal.blockId]: list };
    setAttachments(nextAtt);
    await saveDayData(checked, nextAtt);
  };

  const removeAttachment = async (itemId) => {
    if (!attachModal) return;
    const list = (attachments[attachModal.blockId] || []).filter((a) => a.id !== itemId);
    const nextAtt = { ...attachments, [attachModal.blockId]: list };
    setAttachments(nextAtt);
    await saveDayData(checked, nextAtt);
  };

  const enableEditRow = (e, id) => {
    e.stopPropagation();
    setEditingRows((prev) => new Set([...prev, id]));
  };

  const resetToday = async () => {
    if (!isToday) return;
    setChecked({});
    setTodayChecked({});
    setEditingRows(new Set());
    try {
      const token = await getToken();
      await apiSetDay(dateStr, {}, token);
    } catch {}
    loadWeek();
  };

  const todayBlocks = buildBlocks(now.getDay());
  const requiredBlocks = blocks.filter((b) => !b.optional && CATS[b.cat].label !== "Pause");
  const todayRequiredBlocks = todayBlocks.filter((b) => !b.optional && CATS[b.cat].label !== "Pause");
  const doneCount = requiredBlocks.filter((b) => checked[b.id]).length;
  const totalCount = requiredBlocks.length;
  const pctToday = todayRequiredBlocks.length
    ? Math.round((todayRequiredBlocks.filter((b) => todayChecked[b.id]).length / todayRequiredBlocks.length) * 100)
    : 0;
  const todayDoneCount = todayRequiredBlocks.filter((b) => todayChecked[b.id]).length;

  const nowStr = now.toTimeString().slice(0, 5);
  const isCurrent = (b) => isToday && nowStr >= b.start && nowStr < b.end;
  const isPast = (b) => isToday && nowStr >= b.end;

  const navBtn = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 8,
    border: "1px solid #22262D",
    background: "#14171B",
    color: "#94A3B8",
    cursor: "pointer",
  };

  const dateInput = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #22262D",
    background: "#14171B",
    color: "#E7E9EC",
    fontFamily: "'JetBrains Mono', monospace",
  };

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
            <div className="sg" style={{ fontSize: 26, fontWeight: 700, textTransform: "capitalize" }}>{dayLabel(viewDate)}</div>
            {!isToday && (
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
                {isPastDay ? "Jour passé — lecture seule (bouton Modifier sur chaque ligne)" : "Consultation"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#3B82F6" }}>{nowStr}</div>
            {isAdmin && (
              <button onClick={onOpenAdmin} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "1px solid #3B82F6", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                Administration
              </button>
            )}
            <button onClick={() => signOut()} style={{ fontSize: 11, color: "#64748B", background: "none", border: "1px solid #22262D", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "14px 0 18px" }}>
          <button onClick={goPrevDay} style={navBtn} title="Jour précédent">
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={dateStr}
            max={todayStr}
            onChange={(e) => goToDateKey(e.target.value)}
            style={dateInput}
            title="Calendrier"
          />
          <button onClick={goNextDay} disabled={isToday} style={{ ...navBtn, opacity: isToday ? 0.35 : 1, cursor: isToday ? "default" : "pointer" }} title="Jour suivant">
            <ChevronRight size={18} />
          </button>
          <input
            type="date"
            value={searchDate}
            max={todayStr}
            onChange={(e) => setSearchDate(e.target.value)}
            style={{ ...dateInput, marginLeft: 4 }}
            title="Rechercher une date"
          />
          <button
            onClick={() => goToDateKey(searchDate)}
            style={{ fontSize: 11, color: "#94A3B8", background: "#14171B", border: "1px solid #22262D", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
          >
            Rechercher
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "20px 0" }}>
          <div style={{ background: "#14171B", border: "1px solid #22262D", borderRadius: 12, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>AUJOURD'HUI</div>
            <div className="sg" style={{ fontSize: 22, fontWeight: 700 }}>{pctToday}%</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>{todayDoneCount}/{todayRequiredBlocks.length} blocs</div>
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
            const isTodayBar = todayKey(d.date) === todayStr;
            const isSelected = todayKey(d.date) === dateStr;
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#64748B", marginBottom: 3, textTransform: "uppercase" }}>
                  {d.date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2)}
                </div>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date(d.date))}
                  style={{
                    width: "100%",
                    height: 34,
                    borderRadius: 6,
                    background: d.pct >= 70 ? "#16341F" : d.pct > 0 ? "#2A2408" : "#181B20",
                    border: isSelected ? "1px solid #3B82F6" : isTodayBar ? "1px solid #64748B" : "1px solid transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: d.pct >= 70 ? "#4ADE80" : d.pct > 0 ? "#EAB308" : "#3A3F47",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {d.pct}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {blocks.map((b) => {
            const cat = CATS[b.cat];
            const done = !!checked[b.id];
            const active = isCurrent(b);
            const canEdit = !isPastDay || editingRows.has(b.id);
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
                  opacity: !done && isPast(b) && !active ? 0.55 : !canEdit && !done ? 0.75 : 1,
                  cursor: canEdit ? "pointer" : "default",
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
                <button
                  type="button"
                  onClick={(e) => openAttach(e, b)}
                  title="Trombone — photos, vidéos, liens"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    color: attachmentCount(attachments, b.id) ? "#93C5FD" : "#64748B",
                    background: "none",
                    border: attachmentCount(attachments, b.id) ? "1px solid #3B82F6" : "1px solid #22262D",
                    borderRadius: 6,
                    padding: "4px 8px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Paperclip size={14} />
                  {attachmentCount(attachments, b.id) > 0 ? attachmentCount(attachments, b.id) : null}
                </button>
                {isPastDay && !editingRows.has(b.id) && (
                  <button
                    type="button"
                    onClick={(e) => enableEditRow(e, b.id)}
                    style={{
                      fontSize: 10,
                      color: "#93C5FD",
                      background: "none",
                      border: "1px solid #3B82F6",
                      borderRadius: 6,
                      padding: "4px 8px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Modifier
                  </button>
                )}
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

        <SerieRecap todayStr={todayStr} dayOfWeek={now.getDay()} />

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

      {attachModal && (
        <AttachmentModal
          blockLabel={attachModal.blockLabel}
          items={attachments[attachModal.blockId] || []}
          onClose={() => setAttachModal(null)}
          onAdd={addAttachment}
          onRemove={removeAttachment}
          getToken={getToken}
        />
      )}
    </div>
  );
}
