import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// JS-ran marker (no DevTools): proves main.tsx executed inside the webview
try {
  const el = document.getElementById("paint-marker");
  if (el)
    el.textContent = "JS MARKER: main.tsx executed (about to mount React)";
} catch {}

type Fatal = {
  kind: "error" | "rejection";
  message: string;
  stack?: string;
  source?: string;
};

function FatalScreen({ fatal }: { fatal: Fatal }) {
  return (
    <div
      style={{
        padding: 16,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      }}
    >
      <h2 style={{ margin: "0 0 12px 0" }}>
        RadControl crashed during startup
      </h2>
      <div style={{ marginBottom: 12 }}>
        <strong>{fatal.kind.toUpperCase()}</strong>: {fatal.message}
      </div>
      {fatal.source ? (
        <div style={{ marginBottom: 12 }}>Source: {fatal.source}</div>
      ) : null}
      {fatal.stack ? (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#111",
            color: "#eee",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {fatal.stack}
        </pre>
      ) : (
        <div>No stack available.</div>
      )}
      <div style={{ marginTop: 12, opacity: 0.8 }}>
        Copy this screen text back into chat.
      </div>
    </div>
  );
}

function Boot() {
  const [fatal, setFatal] = React.useState<Fatal | null>(null);

  React.useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const err = e.error as Error | undefined;
      setFatal({
        kind: "error",
        message: err?.message || e.message || "Unknown error",
        stack: err?.stack,
        source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as any;
      setFatal({
        kind: "rejection",
        message:
          (r && (r.message || String(r))) || "Unhandled promise rejection",
        stack: r && r.stack ? String(r.stack) : undefined,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (fatal) return <FatalScreen fatal={fatal} />;

  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Boot />);
