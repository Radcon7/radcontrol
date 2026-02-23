import React from "react";
import ReactDOM from "react-dom/client";

function errToString(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`;
  try {
    return typeof e === "string" ? e : JSON.stringify(e, null, 2);
  } catch {
    return String(e);
  }
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showFatal(title: string, e: unknown) {
  const root = document.getElementById("root");
  const msg = errToString(e);

  const html = `
  <div style="
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    padding: 18px;
    line-height: 1.35;
    color: #111;
  ">
    <div style="font-size: 18px; font-weight: 700; margin-bottom: 10px;">
      RadControl Fatal Startup Error
    </div>
    <div style="font-size: 13px; opacity: 0.9; margin-bottom: 12px;">
      ${title}
    </div>
    <pre style="
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px;
      border: 1px solid rgba(0,0,0,0.15);
      border-radius: 10px;
      background: rgba(0,0,0,0.04);
      font-size: 12px;
      overflow: auto;
      max-height: 70vh;
    ">${escapeHtml(msg)}</pre>

    <div style="margin-top: 12px; font-size: 12px; opacity: 0.8;">
      Copy/paste the text above into the chat. No DevTools needed.
    </div>
  </div>
  `;

  if (root) root.innerHTML = html;
}

window.addEventListener("error", (ev) => {
  const ee = ev as ErrorEvent;
  showFatal("window.error", ee.error ?? ee.message ?? ev);
});

window.addEventListener("unhandledrejection", (ev) => {
  const re = ev as PromiseRejectionEvent;
  showFatal("unhandledrejection", re.reason);
});

(async () => {
  try {
    const mod: any = await import("./App");
    const App = mod?.default ?? mod?.App;

    if (!App) {
      throw new Error(
        'App module loaded but no default export (or named "App") was found.',
      );
    }

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (e) {
    showFatal("main.tsx bootstrap failed", e);
  }
})();
