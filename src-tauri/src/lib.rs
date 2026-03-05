mod commands;

use std::time::Duration;
use tauri::{LogicalSize, Manager, Size};
use tauri_plugin_single_instance::init as single_instance;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(single_instance(|app, _args, _cwd| {
            if let Some((_label, w)) = app.webview_windows().into_iter().next() {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.unmaximize();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_fullscreen(false);
                let _ = w.unmaximize();

                // Control knob: smaller = wider window.
                let pad_logical: f64 = 28.0;
                let target_h: f64 = 1000.0;

                let scale = w.scale_factor().unwrap_or(1.0);

                let (monitor_logical_w, computed_w) = match w.current_monitor() {
                    Ok(Some(m)) => {
                        let phys_w = m.size().width as f64;
                        let logical_w = phys_w / scale;
                        let computed = logical_w - (pad_logical * 2.0);
                        (logical_w, computed)
                    }
                    _ => (0.0, 1700.0),
                };

                // If you didn't see any width change before, you were almost certainly
                // clamped at the upper bound. Raise it slightly.
                let target_w: f64 = computed_w.clamp(1500.0, 1820.0);

                println!(
                    "[radcontrol][win] scale={:.3} monitor_logical_w={:.1} pad_logical={:.1} computed_w={:.1} target_w={:.1}",
                    scale, monitor_logical_w, pad_logical, computed_w, target_w
                );

                let _ = w.set_size(Size::Logical(LogicalSize {
                    width: target_w,
                    height: target_h,
                }));
                let _ = w.center();

                // Pass 2: after compositor settles (keeps symmetry + avoids edge snap).
                let w2 = w.clone();
                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(Duration::from_millis(180));
                    let _ = w2.set_fullscreen(false);
                    let _ = w2.unmaximize();
                    let _ = w2.set_size(Size::Logical(LogicalSize {
                        width: target_w,
                        height: target_h,
                    }));
                    let _ = w2.center();
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::o2::run_o2,
            commands::o2::run_o2_with_input,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}