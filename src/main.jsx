import { ClerkProvider, Show, SignIn } from "@clerk/react";
import React from "react";
import ReactDOM from "react-dom/client";
import Dashboard from "./Dashboard.jsx";

const publishableKey =
  window.__ENV__?.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  document.body.innerHTML =
    '<p style="color:#fff;background:#0B0D10;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif">Clé Clerk manquante. Vérifiez VITE_CLERK_PUBLISHABLE_KEY sur Render.</p>';
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <Show when="signed-in">
        <Dashboard />
      </Show>
      <Show when="signed-out">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#0B0D10" }}>
          <SignIn />
        </div>
      </Show>
    </ClerkProvider>
  </React.StrictMode>
);
