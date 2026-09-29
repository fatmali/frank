//! What the app remembers while it runs.

use frank_core::brain::{self, Brain, BrainError};
use frank_core::config::{BrainConfig, Config, config_path};
use frank_core::secrets::{KeyStore, Keychain};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use tauri::PhysicalPosition;
use tauri::PhysicalSize;

pub struct AppState {
    config: Mutex<Config>,
    brain: tokio::sync::Mutex<Option<(BrainConfig, Arc<dyn Brain>)>>,
    /// Streaming brain requests, so the panel can cancel them.
    pub streams: Mutex<HashMap<u32, tokio::task::AbortHandle>>,
    /// Why the hotkey couldn't be registered, if it couldn't.
    pub hotkey_error: Mutex<Option<String>>,
    /// Where the menu bar icon is, once the OS has told us.
    pub tray_rect: Mutex<Option<(PhysicalPosition<f64>, PhysicalSize<f64>)>>,
    /// When the panel last hid because it lost focus. A click on the menu bar
    /// icon hides it that way first; that click shouldn't reopen it.
    pub hidden_on_blur: Mutex<Option<Instant>>,
    /// While pinned, the panel stays open when it loses focus: during setup,
    /// and while waiting for a plan to be dropped on it.
    pub pinned: Mutex<bool>,
    /// Bumped on each sticky Frank move; only the last move gets saved.
    pub sticky_moves: Mutex<u64>,
    /// Set when the developer starts dragging sticky Frank. Moves Frank makes
    /// himself (placing him on screen) aren't saved.
    pub sticky_dragging: Mutex<bool>,
    /// The global hotkey: tap or hold.
    pub hotkey: Mutex<Hotkey>,
    pub keys: Arc<dyn KeyStore>,
}

impl AppState {
    pub fn load() -> Self {
        let config = Config::load(&config_path()).unwrap_or_else(|e| {
            eprintln!("frank: {e}; using defaults");
            Config::default()
        });
        Self {
            config: Mutex::new(config),
            brain: tokio::sync::Mutex::new(None),
            streams: Mutex::default(),
            hotkey_error: Mutex::default(),
            tray_rect: Mutex::default(),
            hidden_on_blur: Mutex::default(),
            pinned: Mutex::new(false),
            sticky_moves: Mutex::new(0),
            sticky_dragging: Mutex::new(false),
            hotkey: Mutex::default(),
            keys: Arc::new(Keychain),
        }
    }

    pub fn config(&self) -> Config {
        lock(&self.config).clone()
    }

    /// Applies a change to the config and saves it.
    pub fn update_config(&self, change: impl FnOnce(&mut Config)) -> Result<Config, String> {
        let mut config = lock(&self.config);
        let mut next = config.clone();
        change(&mut next);
        next.save(&config_path()).map_err(|e| e.to_string())?;
        *config = next.clone();
        Ok(next)
    }

    /// The configured brain, built on first use and rebuilt when the brain
    /// settings change. Kept alive between requests, so Copilot stays warm.
    pub async fn brain(&self) -> Result<Arc<dyn Brain>, BrainError> {
        let wanted = self.config().brain;
        let mut slot = self.brain.lock().await;
        if let Some((config, brain)) = slot.as_ref()
            && *config == wanted
        {
            return Ok(brain.clone());
        }
        let keys = self.keys.clone();
        let config = wanted.clone();
        // Reading keys may block on the keychain.
        let built = tokio::task::spawn_blocking(move || brain::from_config(&config, keys.as_ref()))
            .await
            .ok()
            .flatten()
            .ok_or_else(|| BrainError::NotReady("Pick a brain in Settings first.".into()))?;
        let brain: Arc<dyn Brain> = Arc::from(built);
        *slot = Some((wanted, brain.clone()));
        Ok(brain)
    }

    /// Drops the built brain, e.g. after a new API key is saved.
    pub async fn forget_brain(&self) {
        *self.brain.lock().await = None;
    }
}

#[derive(Debug, Default)]
pub struct Hotkey {
    pub down: bool,
    /// Held long enough to be talking, not tapping.
    pub holding: bool,
    /// Counts presses, so a timer from an earlier press can tell it's stale.
    pub presses: u64,
}

/// Locks a mutex, ignoring poisoning: every value here stays valid if a
/// holder panicked.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|p| p.into_inner())
}
