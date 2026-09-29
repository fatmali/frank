//! Frank's desktop app. The UI (and the session engine) run in the webview;
//! this shell owns the menu bar icon, the hotkey, the windows, and everything
//! that touches the OS, through `frank-core`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod shell;
mod state;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shell::on_shortcut)
                .build(),
        )
        .manage(state::AppState::load())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::detect_brains,
            commands::brain_status,
            commands::save_api_key,
            commands::brain_stream,
            commands::brain_cancel,
            commands::recent_plans,
            commands::read_plan_file,
            commands::gather_context,
            commands::trust_project,
            commands::hide_panel,
            commands::toggle_panel_from_sticky,
            commands::sticky_drag_started,
            commands::set_panel_pinned,
            commands::hotkey_status,
            commands::set_hotkey,
            commands::set_sticky,
            commands::set_mood,
        ])
        .setup(shell::setup)
        .on_window_event(shell::on_window_event)
        .run(tauri::generate_context!())
        .expect("Frank couldn't start");
}
