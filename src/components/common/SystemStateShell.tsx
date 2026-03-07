import type { ReactNode } from "react";

type Props = {
  title: string;
  actions?: ReactNode;
  meta?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export function SystemStateShell({
  title,
  actions,
  meta,
  error,
  children,
}: Props) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>

        {actions ? (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>

      {meta ? (
        <div
          style={{
            display: "grid",
            gap: 6,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.18)",
            color: "rgba(255,255,255,0.82)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {meta}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,95,215,0.28)",
            background: "rgba(255,95,215,0.08)",
            color: "rgba(255,255,255,0.92)",
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}
