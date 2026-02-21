import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import App from "./App";

function DesktopOnly() {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#111",
        color: "#fff",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px",
      }}
    >
      <h1 style={{ marginBottom: "16px" }}>RadControl</h1>
      <p style={{ opacity: 0.8, maxWidth: "600px" }}>
        RadControl is a desktop application.
      </p>
      <p style={{ marginTop: "12px", opacity: 0.7 }}>Launch it using:</p>
      <code
        style={{
          marginTop: "8px",
          padding: "10px 16px",
          background: "#222",
          borderRadius: "6px",
          fontSize: "14px",
        }}
      >
        npm run tauri:dev
      </code>
      <p style={{ marginTop: "16px", fontSize: "12px", opacity: 0.5 }}>
        This localhost page is not intended for direct browser use.
      </p>
    </div>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <React.StrictMode>{isTauri() ? <App /> : <DesktopOnly />}</React.StrictMode>,
);
