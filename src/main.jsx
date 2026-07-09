import { ClerkProvider, Show, SignIn } from "@clerk/react";
import React from "react";
import ReactDOM from "react-dom/client";
import Dashboard from "./Dashboard.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
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