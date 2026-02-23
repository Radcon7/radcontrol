use serde_json::Value;
use std::fs;

fn read_json_array(path: &str) -> Result<Vec<Value>, String> {
    let s = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let v: Value = serde_json::from_str(&s).map_err(|e| format!("Invalid JSON in {path}: {e}"))?;

    match v {
        Value::Array(arr) => Ok(arr),
        _ => Err(format!("Registry at {path} is not a JSON array")),
    }
}

fn o2_root() -> Result<String, String> {
    // Match src-tauri/src/commands/o2.rs behavior:
    // Prefer explicit env if set; otherwise default to $HOME/dev/o2.
    if let Ok(p) = std::env::var("O2_ROOT") {
        return Ok(p);
    }

    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    Ok(format!("{home}/dev/o2"))
}

#[tauri::command]
pub fn o2_list_projects() -> Result<String, String> {
    let root = o2_root()?;
    let registry_path = format!("{root}/registry/projects.json");

    if !std::path::Path::new(&registry_path).is_file() {
        return Err(format!("O2 registry missing: {registry_path}"));
    }

    let arr = read_json_array(&registry_path)?;
    serde_json::to_string(&arr).map_err(|e| format!("Failed to serialize registry array: {e}"))
}
