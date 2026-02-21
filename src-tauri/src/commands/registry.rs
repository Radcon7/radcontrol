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

#[tauri::command]
pub fn o2_list_projects() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;

    let registry_path = format!("{home}/dev/o2/registry/projects.json");
    if !std::path::Path::new(&registry_path).is_file() {
        return Err(format!("O2 registry missing: {registry_path}"));
    }

    let arr = read_json_array(&registry_path)?;
    println!(
        "[registry] loaded O2: {} entries ({})",
        arr.len(),
        registry_path
    );

    serde_json::to_string_pretty(&Value::Array(arr))
        .map_err(|e| format!("Failed to serialize registry: {e}"))
}