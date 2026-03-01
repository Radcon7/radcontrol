use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir failed: {e}"))?;
  Ok(base.join("radcontrol_notes"))
}

fn safe_kind(kind: &str) -> String {
  kind
    .chars()
    .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
    .collect::<String>()
}

fn filename(kind: &str) -> String {
  // Exact compatibility base:
  // notes_YYYYMMDD_HHMMSS.md
  //
  // If kind is provided, we append _<kind> before .md:
  // notes_YYYYMMDD_HHMMSS_edit.md
  let ts = Local::now().format("%Y%m%d_%H%M%S").to_string();
  let k = safe_kind(kind.trim());

  if k.is_empty() {
    format!("notes_{ts}.md")
  } else {
    format!("notes_{ts}_{k}.md")
  }
}

#[tauri::command]
pub fn notes_archive(app: AppHandle, text: String, kind: String) -> Result<String, String> {
  let t = text.trim();
  if t.is_empty() {
    return Ok("skipped (empty)".to_string());
  }

  let dir = notes_dir(&app)?;
  fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all failed: {e}"))?;

  let path = dir.join(filename(&kind));

  // Atomic-ish write: temp then rename
  let tmp = dir.join(format!(
    ".tmp_{}",
    Local::now().format("%Y%m%d_%H%M%S_%3f")
  ));

  fs::write(&tmp, t.as_bytes()).map_err(|e| format!("write tmp failed: {e}"))?;
  fs::rename(&tmp, &path).map_err(|e| format!("rename failed: {e}"))?;

  Ok(path.display().to_string())
}