//! The menu bar icon, the hotkey, and where Frank's windows go.

use crate::state::{AppState, lock};
use serde::Deserialize;
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

const TRAY_ID: &str = "frank";
const PANEL: &str = "panel";
const STICKY: &str = "sticky";
/// Sticky Frank's window, in points (tauri.conf.json).
const STICKY_SIZE: f64 = 76.0;
/// A click on the menu bar icon hides the panel (it loses focus) before the
/// click itself arrives. Within this window, that click doesn't reopen it.
const BLUR_CLICK_GRACE: Duration = Duration::from_millis(300);

/// Frank's moods (docs/ux.md §6.5). Listening arrives with voice, in M3.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mood {
    Idle,
    Thinking,
    Judging,
    Done,
}

impl Mood {
    fn tray_icon(self) -> &'static [u8] {
        match self {
            Mood::Idle => include_bytes!("../icons/tray/idle.png"),
            Mood::Thinking => include_bytes!("../icons/tray/thinking.png"),
            Mood::Judging => include_bytes!("../icons/tray/judging.png"),
            Mood::Done => include_bytes!("../icons/tray/done.png"),
        }
    }
}

/// Where the panel should open.
pub enum Anchor {
    /// Under the menu bar icon, at the rect the OS just reported.
    Tray(Rect),
    /// Beside sticky Frank.
    Sticky,
    /// Wherever makes sense now: beside sticky Frank if he's out, else under
    /// the menu bar icon.
    Auto,
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let handle = app.handle().clone();
    let state = app.state::<AppState>();
    let config = state.config();
    build_tray(&handle, config.sticky.enabled)?;
    if let Err(e) = register_hotkey(&handle, &config.hotkey, None) {
        *lock(&state.hotkey_error) = Some(e);
    }
    show_sticky(&handle, config.sticky.enabled, config.sticky.position);
    // First run: open the panel so setup can start.
    if config.brain.kind.is_empty() {
        *lock(&state.pinned) = true;
        show_panel(&handle, Anchor::Auto);
    }
    Ok(())
}

fn build_tray(app: &AppHandle, sticky: bool) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", "Open Frank", true, None::<&str>)?,
            &CheckMenuItem::with_id(app, "sticky", "Sticky Frank", true, sticky, None::<&str>)?,
            &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit Frank", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(Mood::Idle.tray_icon())?)
        .icon_as_template(true)
        .tooltip("Frank")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_panel(app, Anchor::Auto),
            "settings" => {
                show_panel(app, Anchor::Auto);
                let _ = app.emit_to(PANEL, "open-settings", ());
            }
            "sticky" => {
                let state = app.state::<AppState>();
                let enabled = !state.config().sticky.enabled;
                if let Ok(config) = state.update_config(|c| c.sticky.enabled = enabled) {
                    show_sticky(app, enabled, config.sticky.position);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } => {
                    remember_tray(app, rect);
                    toggle_panel(app, Anchor::Tray(rect));
                }
                TrayIconEvent::Enter { rect, .. } | TrayIconEvent::Move { rect, .. } => {
                    remember_tray(app, rect);
                }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

fn remember_tray(app: &AppHandle, rect: Rect) {
    let scale = panel(app)
        .and_then(|p| p.scale_factor().ok())
        .unwrap_or(1.0);
    let position = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    *lock(&app.state::<AppState>().tray_rect) = Some((position, size));
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    match (window.label(), event) {
        (PANEL, WindowEvent::Focused(false)) => {
            let state = app.state::<AppState>();
            if !*lock(&state.pinned) && window.is_visible().unwrap_or(false) {
                *lock(&state.hidden_on_blur) = Some(Instant::now());
                let _ = window.hide();
            }
        }
        (STICKY, WindowEvent::Moved(position)) => save_sticky_position(app, *position),
        _ => {}
    }
}

/// Saves where sticky Frank was dragged to, once he stops moving.
fn save_sticky_position(app: &AppHandle, position: PhysicalPosition<i32>) {
    let state = app.state::<AppState>();
    if !*lock(&state.sticky_dragging) {
        return;
    }
    let generation = {
        let mut moves = lock(&state.sticky_moves);
        *moves += 1;
        *moves
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let state = app.state::<AppState>();
        if *lock(&state.sticky_moves) != generation {
            return;
        }
        let scale = app
            .get_webview_window(STICKY)
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);
        let logical = position.to_logical::<f64>(scale);
        *lock(&state.sticky_dragging) = false;
        let _ = state.update_config(|c| c.sticky.position = Some((logical.x, logical.y)));
    });
}

// ---------------------------------------------------------------- hotkey

pub fn on_shortcut(app: &AppHandle, _shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() == ShortcutState::Pressed {
        toggle_panel(app, Anchor::Auto);
    }
}

/// Registers `hotkey`, replacing `previous`. On failure the previous one stays
/// registered, and the error says what to do.
pub fn register_hotkey(
    app: &AppHandle,
    hotkey: &str,
    previous: Option<&str>,
) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let shortcut: Shortcut = hotkey.parse().map_err(|_| {
        format!("{hotkey} isn't a key combination Frank understands. Pick another.")
    })?;
    if let Some(prev) = previous.and_then(|p| p.parse::<Shortcut>().ok()) {
        if prev == shortcut && shortcuts.is_registered(shortcut) {
            return Ok(());
        }
        let _ = shortcuts.unregister(prev);
    }
    shortcuts.register(shortcut).map_err(|_| {
        if let Some(prev) = previous.and_then(|p| p.parse::<Shortcut>().ok()) {
            let _ = shortcuts.register(prev);
        }
        format!("{hotkey} is taken by another app. Pick another.")
    })
}

// ---------------------------------------------------------------- panel

fn panel(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PANEL)
}

pub fn toggle_panel(app: &AppHandle, anchor: Anchor) {
    let Some(panel) = panel(app) else { return };
    let state = app.state::<AppState>();
    if panel.is_visible().unwrap_or(false) {
        hide_panel(app);
        return;
    }
    // The click that hid the panel shouldn't bring it straight back.
    if matches!(anchor, Anchor::Tray(_) | Anchor::Sticky)
        && lock(&state.hidden_on_blur).is_some_and(|t| t.elapsed() < BLUR_CLICK_GRACE)
    {
        return;
    }
    show_panel(app, anchor);
}

pub fn show_panel(app: &AppHandle, anchor: Anchor) {
    let Some(panel) = panel(app) else { return };
    place_panel(app, &panel, anchor);
    let _ = panel.show();
    let _ = panel.set_focus();
    let _ = app.emit_to(PANEL, "panel-shown", ());
}

/// Hides the panel. With no sticky Frank on screen, the whole app hides too,
/// which hands focus back to the app the developer was in.
pub fn hide_panel(app: &AppHandle) {
    if let Some(panel) = panel(app) {
        let _ = panel.hide();
    }
    #[cfg(target_os = "macos")]
    if !app.state::<AppState>().config().sticky.enabled {
        let _ = app.hide();
    }
}

fn place_panel(app: &AppHandle, panel: &WebviewWindow, anchor: Anchor) {
    let state = app.state::<AppState>();
    let sticky = state.config().sticky.enabled;
    let anchor = match anchor {
        Anchor::Auto if sticky => Anchor::Sticky,
        other => other,
    };
    let Ok(Some(monitor)) = panel
        .current_monitor()
        .map(|m| m.or_else(|| panel.primary_monitor().ok().flatten()))
    else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (left, top) = (f64::from(area.position.x), f64::from(area.position.y));
    let (right, bottom) = (
        left + f64::from(area.size.width),
        top + f64::from(area.size.height),
    );
    let width = 480.0 * scale;
    let gap = 6.0 * scale;

    let (x, y) = match anchor {
        Anchor::Sticky => match app
            .get_webview_window(STICKY)
            .and_then(|s| Some((s.outer_position().ok()?, s.outer_size().ok()?)))
        {
            Some((pos, size)) => {
                let (sx, sy) = (f64::from(pos.x), f64::from(pos.y));
                let sw = f64::from(size.width);
                // Open on whichever side has room.
                let x = if sx + sw + gap + width <= right {
                    sx + sw + gap
                } else {
                    sx - gap - width
                };
                (x, sy)
            }
            None => under_menu_bar(state.inner(), right, top, width, gap),
        },
        Anchor::Tray(rect) => {
            let position = rect.position.to_physical::<f64>(scale);
            let size = rect.size.to_physical::<f64>(scale);
            (
                position.x + size.width / 2.0 - width / 2.0,
                position.y + size.height + gap,
            )
        }
        Anchor::Auto => under_menu_bar(state.inner(), right, top, width, gap),
    };
    let max_height = f64::from(area.size.height) * 0.7;
    let x = x.clamp(left + gap, right - width - gap);
    let y = y.clamp(top, (bottom - max_height).max(top));
    let _ = panel.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// Under the menu bar icon if we know where it is, else the top-right corner.
fn under_menu_bar(state: &AppState, right: f64, top: f64, width: f64, gap: f64) -> (f64, f64) {
    match *lock(&state.tray_rect) {
        Some((position, size)) => (
            position.x + size.width / 2.0 - width / 2.0,
            position.y + size.height + gap,
        ),
        None => (right - width - gap * 2.0, top + gap),
    }
}

// ---------------------------------------------------------------- sticky Frank

pub fn show_sticky(app: &AppHandle, enabled: bool, position: Option<(f64, f64)>) {
    let Some(sticky) = app.get_webview_window(STICKY) else {
        return;
    };
    if !enabled {
        let _ = sticky.hide();
        return;
    }
    match position {
        Some((x, y)) => {
            let _ = sticky.set_position(tauri::LogicalPosition::new(x, y));
        }
        None => {
            // Bottom-right corner of the screen, clear of the Dock.
            if let Ok(Some(monitor)) = sticky.primary_monitor() {
                let area = monitor.work_area();
                let scale = monitor.scale_factor();
                // The window's own size isn't known until it's shown.
                let side = (STICKY_SIZE * scale) as i32;
                let margin = (24.0 * scale) as i32;
                let x = area.position.x + area.size.width as i32 - side - margin;
                let y = area.position.y + area.size.height as i32 - side - margin;
                let _ = sticky.set_position(PhysicalPosition::new(x, y));
            }
        }
    }
    let _ = sticky.show();
}

pub fn set_mood(app: &AppHandle, mood: Mood) {
    if let Some(tray) = app.tray_by_id(TRAY_ID)
        && let Ok(icon) = Image::from_bytes(mood.tray_icon())
    {
        let _ = tray.set_icon(Some(icon));
        let _ = tray.set_icon_as_template(true);
    }
    let _ = app.emit_to(STICKY, "mood", format!("{mood:?}").to_lowercase());
}
