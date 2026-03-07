import type { CSSProperties } from "react";
import { formatMaybeUnixTime, type FilesListItem } from "./useArtifactStore";

type Props = {
  title?: string;
  items: FilesListItem[];
  currentPath: string | null;
  emptyText: string;
  onSelect: (path: string) => void;
};

export function ArtifactListPanel({
  title = "Artifacts",
  items,
  currentPath,
  emptyText,
  onSelect,
}: Props) {
  return (
    <div
      style={{
        minHeight: 0,
        overflow: "auto",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.03)",
        padding: 10,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "grid", gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ opacity: 0.72 }}>{emptyText}</div>
        ) : (
          items.map((item) => {
            const path = item.path || "";
            const active = currentPath === path;
            const name = path.split("/").pop() || path;

            const buttonStyle: CSSProperties = {
              justifyContent: "flex-start",
              textAlign: "left",
              borderColor: active ? "rgba(255,255,255,0.32)" : undefined,
            };

            return (
              <button
                key={path}
                className="btn btnGhost"
                style={buttonStyle}
                onClick={() => onSelect(path)}
                title={path}
              >
                <span style={{ display: "grid", gap: 2 }}>
                  <span>{name}</span>
                  <span style={{ fontSize: 12, opacity: 0.68 }}>
                    {item.mtime ? formatMaybeUnixTime(item.mtime) : "—"}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
