import { useEffect, useState } from "react";
import type { NewMilestoneInput } from "./timelineLoader";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onCreate: (input: NewMilestoneInput) => Promise<void>;
};

export function MilestoneModal({ open, busy, onCancel, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    setDate(`${yyyy}-${mm}-${dd}`);
    setTitle("");
    setCategory("");
    setNotes("");
    setError("");
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    setError("");

    const trimmedTitle = title.trim();
    const trimmedDate = date.trim();

    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    if (!trimmedDate) {
      setError("Date is required.");
      return;
    }

    try {
      await onCreate({
        title: trimmedTitle,
        date: trimmedDate,
        category: category.trim(),
        notes: notes.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: "90%",
          background: "#1e1e1e",
          borderRadius: 10,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          Add Timeline Milestone
        </div>

        <label>
          <div style={{ marginBottom: 4 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="TBIS LLC Created"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#eee",
            }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 4 }}>Date</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#eee",
            }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 4 }}>Category</div>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Business / Product / Architecture"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#eee",
            }}
          />
        </label>

        <label>
          <div style={{ marginBottom: 4 }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Details about this milestone..."
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#eee",
              resize: "vertical",
            }}
          />
        </label>

        {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 8,
          }}
        >
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#222",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "none",
              background: "#3a7afe",
              color: "white",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
