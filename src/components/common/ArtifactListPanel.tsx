import type { FilesListItem } from "./o2Files";

function formatMaybeUnixTime(value?: number): string {
  if (!value || !Number.isFinite(value)) return "—";
  const ms = value < 1000000000000 ? value * 1000 : value;
  return new Date(ms).toLocaleString();
}

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
    <div className="artifactListPanel">
      <div className="artifactListTitle">{title}</div>

      <div className="artifactListItems">
        {items.length === 0 ? (
          <div className="artifactListEmpty">{emptyText}</div>
        ) : (
          items.map((item) => {
            const path = item.path || "";
            const active = currentPath === path;
            const name = path.split("/").pop() || path;

            return (
              <button
                key={path}
                className={`btn btnGhost artifactListItem ${active ? "artifactListItemActive" : ""}`}
                onClick={() => onSelect(path)}
                title={path}
              >
                <span className="artifactListItemBody">
                  <span>{name}</span>
                  <span className="artifactListItemMeta">
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
