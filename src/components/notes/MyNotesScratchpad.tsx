import { useCallback, useEffect, useRef, useState } from "react";
import { readMyNotes, saveMyNotes } from "./myNotesApi";

type Props = { registerBeforeTabChangeSaver?: (fn: (() => Promise<boolean>) | null) => void };

export function MyNotesScratchpad({ registerBeforeTabChangeSaver }: Props) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const contentRef = useRef(""); const dirtyRef = useRef(false); const timerRef = useRef<number | null>(null);
  useEffect(() => { void readMyNotes().then((result) => { if (!result.ok) throw new Error(result.error || "My Notes unavailable"); setContent(result.content || ""); contentRef.current = result.content || ""; setStatus("Saved"); }).catch((reason) => { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Unavailable"); }); }, []);
  const save = useCallback(async () => { if (!dirtyRef.current) return true; setStatus("Saving…"); setError(""); try { const result = await saveMyNotes(contentRef.current); if (!result.ok) throw new Error(result.error || "My Notes save failed"); dirtyRef.current = false; setStatus("Saved"); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus("Not saved"); return false; } }, []);
  useEffect(() => { registerBeforeTabChangeSaver?.(save); return () => registerBeforeTabChangeSaver?.(null); }, [registerBeforeTabChangeSaver, save]);
  function change(value: string) { setContent(value); contentRef.current = value; dirtyRef.current = true; setStatus("Saving soon…"); if (timerRef.current) window.clearTimeout(timerRef.current); timerRef.current = window.setTimeout(() => void save(), 650); }
  return <section className="scratchpadShell" data-testid="my-notes-scratchpad"><div className="scratchpadHeading"><div><strong>MY NOTES</strong><span>Private operator scratchpad · persists with the O2 runtime, not source control</span></div><small>{status}</small></div>{error ? <div className="panelError">{error}</div> : null}<textarea className="scratchpadArea" data-testid="my-notes-input" value={content} onChange={(event) => change(event.target.value)} onBlur={() => void save()} placeholder="Start typing…" aria-label="My Notes scratchpad" /></section>;
}
