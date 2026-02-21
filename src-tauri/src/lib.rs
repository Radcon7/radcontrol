mod commands;
mod shell;

use tauri::Manager;
use tauri_plugin_single_instance::init as single_instance;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(single_instance(|app, _args, _cwd| {
            if let Some((_label, w)) = app.webview_windows().into_iter().next() {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::o2::run_o2,
            commands::registry::o2_list_projects,
            commands::ports::port_status,
            commands::ports::kill_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
