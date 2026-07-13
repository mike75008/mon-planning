import React, { useState, useEffect } from "react";
import { useAuth } from "@clerk/react";
import Dashboard from "./Dashboard.jsx";
import Admin from "./Admin.jsx";

export default function App() {
  const { getToken } = useAuth();
  const [screen, setScreen] = useState("planning");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(!!data.isAdmin);
        }
        if (token) {
          fetch("/api/chat/presence", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        await fetch("/api/chat/presence", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* ignore */
      }
    };
    const t = setInterval(ping, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [getToken]);

  if (screen === "admin") {
    return <Admin onBack={() => setScreen("planning")} />;
  }

  return (
    <Dashboard
      isAdmin={isAdmin}
      onOpenAdmin={() => setScreen("admin")}
    />
  );
}
