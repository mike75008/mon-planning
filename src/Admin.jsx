import React, { useEffect, useState, useCallback } from "react";
import { useAuth, useClerk } from "@clerk/react";

const MENU = [
  { id: "dashboard", label: "Tableau de bord" },
  { id: "utilisateurs", label: "Utilisateurs inscrits" },
  { id: "connexions", label: "Connexions" },
  { id: "statistiques", label: "Statistiques" },
  { id: "journaux", label: "Journaux" },
  { id: "securite", label: "Sécurité" },
];

async function adminFetch(path, token, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Erreur serveur");
  return json;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR");
}

export default function Admin({ onBack }) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [section, setSection] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [connexions, setConnexions] = useState([]);
  const [statistiques, setStatistiques] = useState([]);
  const [journaux, setJournaux] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      if (section === "dashboard") {
        setDashboard(await adminFetch("/dashboard", token));
      } else if (section === "utilisateurs") {
        const d = await adminFetch("/utilisateurs", token);
        setUtilisateurs(d.utilisateurs || []);
      } else if (section === "connexions") {
        const d = await adminFetch("/connexions", token);
        setConnexions(d.connexions || []);
      } else if (section === "statistiques") {
        const d = await adminFetch("/statistiques", token);
        setStatistiques(d.statistiques || []);
      } else if (section === "journaux") {
        const d = await adminFetch("/journaux", token);
        setJournaux(d.journaux || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [section, getToken]);

  useEffect(() => {
    if (section !== "securite") load();
  }, [section, load]);

  const desactiver = async (id) => {
    if (!confirm("Désactiver ce compte ?")) return;
    try {
      const token = await getToken();
      await adminFetch(`/utilisateurs/${id}/desactiver`, token, { method: "POST" });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const reactiver = async (id) => {
    try {
      const token = await getToken();
      await adminFetch(`/utilisateurs/${id}/reactiver`, token, { method: "POST" });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const card = { background: "#14171B", border: "1px solid #22262D", borderRadius: 12, padding: "14px 12px" };
  const th = { textAlign: "left", fontSize: 11, color: "#64748B", padding: "8px 6px", borderBottom: "1px solid #22262D" };
  const td = { fontSize: 12, padding: "10px 6px", borderBottom: "1px solid #1E2127", color: "#D1D5DB" };

  return (
    <div style={{ minHeight: "100vh", background: "#0B0D10", color: "#E7E9EC", fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .sg { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, color: "#64748B", textTransform: "uppercase" }}>Administration</div>
            <div className="sg" style={{ fontSize: 26, fontWeight: 700 }}>Panneau administrateur</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "1px solid #3B82F6", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              Retour au planning
            </button>
            <button onClick={() => signOut()} style={{ fontSize: 11, color: "#64748B", background: "none", border: "1px solid #22262D", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
          {MENU.map((m) => (
            <button
              key={m.id}
              onClick={() => setSection(m.id)}
              style={{
                fontSize: 11,
                padding: "8px 12px",
                borderRadius: 8,
                border: section === m.id ? "1px solid #3B82F6" : "1px solid #22262D",
                background: section === m.id ? "#111E33" : "#14171B",
                color: section === m.id ? "#93C5FD" : "#94A3B8",
                cursor: "pointer",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ ...card, marginBottom: 16, color: "#F87171", borderColor: "#7F1D1D" }}>{error}</div>
        )}
        {loading && <div style={{ color: "#64748B", marginBottom: 16 }}>Chargement…</div>}

        {section === "dashboard" && dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748B" }}>Utilisateurs inscrits</div>
              <div className="sg" style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.utilisateursInscrits}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748B" }}>Connectés aujourd'hui</div>
              <div className="sg" style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.utilisateursActifsAujourdhui}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: "#64748B" }}>Pourcentage moyen global (7 jours)</div>
              <div className="sg" style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.pourcentageMoyenGlobal}%</div>
            </div>
            <div style={{ ...card, gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10 }}>Derniers journaux</div>
              {(dashboard.journauxRecents || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748B" }}>Aucun journal pour l'instant.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>Utilisateur</th>
                      <th style={th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.journauxRecents.map((j) => (
                      <tr key={j.id}>
                        <td style={td}>{formatDate(j.created_at)}</td>
                        <td style={td}>{j.user_id}</td>
                        <td style={td}>{j.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {section === "utilisateurs" && (
          <div style={card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Prénom</th>
                  <th style={th}>Nom</th>
                  <th style={th}>Courriel</th>
                  <th style={th}>Inscrit le</th>
                  <th style={th}>Dernière connexion</th>
                  <th style={th}>Compte</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {utilisateurs.map((u) => (
                  <tr key={u.id}>
                    <td style={td}>{u.prenom || "—"}</td>
                    <td style={td}>{u.nom || "—"}</td>
                    <td style={td}>{u.email || "—"}</td>
                    <td style={td}>{formatDate(u.inscritLe)}</td>
                    <td style={td}>{formatDate(u.derniereConnexion)}</td>
                    <td style={td}>{u.compteDesactive ? "Désactivé" : "Actif"}</td>
                    <td style={td}>
                      {u.compteDesactive ? (
                        <button onClick={() => reactiver(u.id)} style={{ fontSize: 10, cursor: "pointer", color: "#4ADE80", background: "none", border: "1px solid #166534", borderRadius: 4, padding: "3px 8px" }}>
                          Réactiver
                        </button>
                      ) : (
                        <button onClick={() => desactiver(u.id)} style={{ fontSize: 10, cursor: "pointer", color: "#F87171", background: "none", border: "1px solid #7F1D1D", borderRadius: 4, padding: "3px 8px" }}>
                          Désactiver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "connexions" && (
          <div style={card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Prénom</th>
                  <th style={th}>Nom</th>
                  <th style={th}>Courriel</th>
                  <th style={th}>Dernière connexion</th>
                </tr>
              </thead>
              <tbody>
                {connexions.map((c) => (
                  <tr key={c.id}>
                    <td style={td}>{c.prenom || "—"}</td>
                    <td style={td}>{c.nom || "—"}</td>
                    <td style={td}>{c.email || "—"}</td>
                    <td style={td}>{formatDate(c.derniereConnexion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "statistiques" && (
          <div style={card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Prénom</th>
                  <th style={th}>Nom</th>
                  <th style={th}>Courriel</th>
                  <th style={th}>Pourcentage moyen sur 7 jours</th>
                  <th style={th}>Jours enregistrés</th>
                </tr>
              </thead>
              <tbody>
                {statistiques.map((s) => (
                  <tr key={s.utilisateurId}>
                    <td style={td}>{s.prenom || "—"}</td>
                    <td style={td}>{s.nom || "—"}</td>
                    <td style={td}>{s.email || "—"}</td>
                    <td style={td}>{s.pourcentageMoyenSeptJours}%</td>
                    <td style={td}>{s.joursEnregistres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "journaux" && (
          <div style={card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Utilisateur</th>
                  <th style={th}>Action</th>
                  <th style={th}>Détails</th>
                </tr>
              </thead>
              <tbody>
                {journaux.map((j) => (
                  <tr key={j.id}>
                    <td style={td}>{formatDate(j.created_at)}</td>
                    <td style={td}>{j.user_id}</td>
                    <td style={td}>{j.action}</td>
                    <td style={td}>{JSON.stringify(j.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "securite" && (
          <div style={card}>
            <div className="sg" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sécurité</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
              Ce menu sera disponible prochainement. Le mode opératoire n'est pas encore activé.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
