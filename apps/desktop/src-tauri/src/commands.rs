//! What the panel can ask the app to do. Plans, files and brains live in
//! `frank-core`; these commands only move data across and keep state.

use crate::shell;
use crate::speech::{self, Speech, SystemVoice};
use crate::state::{AppState, lock};
use crate::voice::Voice;
use frank_core::brain::{BrainError, BrainRequest, Detection};
use frank_core::config::Config;
use frank_core::detect::{BrainOption, detect_all};
use frank_core::files::{Skip, read_touched};
use frank_core::repo::{repo_root, summarize};
use frank_core::secrets::{Provider, save_api_key as save_key};
use frank_core::types::{FileContext, Plan, PlanSource, RepoSummary, rfc3339, title_of};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::sync::mpsc;

/// A brain error, shaped for the panel.
#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum BrainFailure {
    NotReady { message: String },
    Failed { message: String },
    Cancelled,
}

impl From<BrainError> for BrainFailure {
    fn from(e: BrainError) -> Self {
        match e {
            BrainError::NotReady(message) => Self::NotReady { message },
            BrainError::Failed(message) => Self::Failed { message },
            BrainError::Cancelled => Self::Cancelled,
        }
    }
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config()
}

/// Saves settings from the panel. The hotkey and sticky mode have their own
/// commands, because they change the running app.
#[tauri::command]
pub fn save_config(state: State<'_, AppState>, config: Config) -> Result<Config, String> {
    state.update_config(|c| {
        c.brain = config.brain;
        c.plans = config.plans;
        c.context = config.context;
        c.voice = config.voice;
    })
}

#[tauri::command]
pub async fn detect_brains(state: State<'_, AppState>) -> Result<Vec<BrainOption>, ()> {
    Ok(detect_all(state.keys.clone()).await)
}

/// Whether the configured brain is ready. Starting Copilot here also warms it
/// up for the first real request.
#[tauri::command]
pub async fn brain_status(state: State<'_, AppState>) -> Result<Detection, ()> {
    Ok(match state.brain().await {
        Ok(brain) => brain.detect().await,
        Err(e) => Detection::Missing { fix: e.to_string() },
    })
}

#[tauri::command]
pub async fn save_api_key(
    state: State<'_, AppState>,
    kind: String,
    key: String,
) -> Result<(), String> {
    let provider =
        Provider::from_kind(&kind).ok_or_else(|| format!("{kind} doesn't take an API key."))?;
    let keys = state.keys.clone();
    tokio::task::spawn_blocking(move || save_key(keys.as_ref(), provider, &key))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    state.forget_brain().await;
    Ok(())
}

/// Streams a brain's reply over `on_chunk`. Cancel with `brain_cancel(id)`.
#[tauri::command]
pub async fn brain_stream(
    state: State<'_, AppState>,
    id: u32,
    request: BrainRequest,
    on_chunk: Channel<String>,
) -> Result<(), BrainFailure> {
    let brain = state.brain().await?;
    let (tx, mut rx) = mpsc::channel::<String>(64);
    let task = tokio::spawn(async move {
        let forward = async {
            while let Some(text) = rx.recv().await {
                if on_chunk.send(text).is_err() {
                    break;
                }
            }
        };
        let (result, ()) = tokio::join!(brain.stream(request, tx), forward);
        result
    });
    lock(&state.streams).insert(id, task.abort_handle());
    let result = task.await;
    lock(&state.streams).remove(&id);
    match result {
        Ok(r) => r.map_err(Into::into),
        Err(_) => Err(BrainFailure::Cancelled),
    }
}

#[tauri::command]
pub fn brain_cancel(state: State<'_, AppState>, id: u32) {
    if let Some(task) = lock(&state.streams).remove(&id) {
        task.abort();
    }
}

#[tauri::command]
pub async fn recent_plans(state: State<'_, AppState>) -> Result<Vec<Plan>, ()> {
    let minutes = u64::from(state.config().plans.window_minutes.max(1));
    Ok(tokio::task::spawn_blocking(move || {
        let mut plans = frank_core::plans::recent_claude_plans(
            &frank_core::plans::claude_dir(),
            Duration::from_secs(minutes * 60),
        );
        // The agent may have been run from a subfolder; the repo is the project.
        for plan in &mut plans {
            if let Some(root) = plan
                .project
                .as_deref()
                .and_then(|p| repo_root(Path::new(p)))
            {
                plan.project = Some(root.to_string_lossy().into_owned());
            }
        }
        plans
    })
    .await
    .unwrap_or_default())
}

const MAX_PLAN_BYTES: u64 = 1024 * 1024;

/// Reads a plan file dropped on the panel. If it sits inside a repo, that
/// repo is the plan's project.
#[tauri::command]
pub async fn read_plan_file(path: String) -> Result<Plan, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase());
        if !matches!(ext.as_deref(), Some("md" | "markdown" | "txt")) {
            return Err("Frank reads plans as Markdown or text files.".to_owned());
        }
        let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.len() > MAX_PLAN_BYTES {
            return Err("That file is too big to be a plan.".to_owned());
        }
        let body = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(Plan {
            source: PlanSource::File,
            title: title_of(&body),
            project: path
                .parent()
                .and_then(repo_root)
                .map(|r| r.to_string_lossy().into_owned()),
            modified_at: rfc3339(meta.modified().unwrap_or(std::time::SystemTime::now())),
            origin: path.to_string_lossy().into_owned(),
            body,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skipped {
    pub path: String,
    /// In words, for the context check: "secret file, never read".
    pub reason: &'static str,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gathered {
    pub files: Vec<FileContext>,
    pub skipped: Vec<Skipped>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo: Option<RepoSummary>,
    /// The repo root the files came from.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root: Option<String>,
    /// True when the developer said not to confirm this project again, or
    /// there's nothing to confirm.
    pub trusted: bool,
}

/// Reads what the plan mentions, locally. Nothing is sent anywhere until the
/// developer confirms (or trusts the project).
#[tauri::command]
pub async fn gather_context(state: State<'_, AppState>, plan: Plan) -> Result<Gathered, ()> {
    let config = state.config();
    Ok(tokio::task::spawn_blocking(move || gather(&config, &plan))
        .await
        .unwrap_or_default())
}

fn gather(config: &Config, plan: &Plan) -> Gathered {
    let Some(project) = plan.project.as_deref().map(Path::new) else {
        return Gathered {
            trusted: true,
            ..Gathered::default()
        };
    };
    let root = repo_root(project).unwrap_or_else(|| project.to_path_buf());
    if !root.is_dir() {
        return Gathered {
            trusted: true,
            ..Gathered::default()
        };
    }
    let budget = config.context.max_file_kb as usize * 1024;
    let (files, skipped) = read_touched(&root, &plan.body, budget);
    let repo = repo_root(&root).map(|r| summarize(&r));
    let root = root.to_string_lossy().into_owned();
    let nothing_to_send = files.is_empty() && repo.as_ref().is_none_or(|r| r.rules.is_empty());
    Gathered {
        trusted: nothing_to_send || config.trusts(&root),
        files,
        skipped: skipped
            .into_iter()
            .map(|(path, why)| Skipped {
                path,
                reason: match why {
                    Skip::Secret => "secret file, never read",
                    Skip::OutsideRepo => "outside the repo",
                    Skip::Binary => "not a text file",
                    Skip::TooMany => "too many files",
                    Skip::TotalLimit | Skip::NotFound => "over the size limit",
                },
            })
            .collect(),
        repo,
        root: Some(root),
    }
}

#[tauri::command]
pub fn trust_project(state: State<'_, AppState>, root: String) -> Result<(), String> {
    state
        .update_config(|c| {
            if !c.trusts(&root) {
                c.context.trusted_projects.push(root);
            }
        })
        .map(|_| ())
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) {
    shell::hide_panel(&app);
}

#[tauri::command]
pub fn toggle_panel_from_sticky(app: AppHandle) {
    shell::toggle_panel(&app, shell::Anchor::Sticky);
}

/// The developer started dragging sticky Frank; where he's dropped is saved.
#[tauri::command]
pub fn sticky_drag_started(state: State<'_, AppState>) {
    *lock(&state.sticky_dragging) = true;
}

#[tauri::command]
pub fn set_panel_pinned(state: State<'_, AppState>, pinned: bool) {
    *lock(&state.pinned) = pinned;
}

/// Why the hotkey isn't working, if it isn't.
#[tauri::command]
pub fn hotkey_status(state: State<'_, AppState>) -> Option<String> {
    lock(&state.hotkey_error).clone()
}

#[tauri::command]
pub fn set_hotkey(
    app: AppHandle,
    state: State<'_, AppState>,
    hotkey: String,
) -> Result<(), String> {
    let previous = state.config().hotkey;
    shell::register_hotkey(&app, &hotkey, Some(&previous))?;
    *lock(&state.hotkey_error) = None;
    state.update_config(|c| c.hotkey = hotkey).map(|_| ())
}

#[tauri::command]
pub fn set_sticky(app: AppHandle, state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    let config = state.update_config(|c| c.sticky.enabled = enabled)?;
    shell::show_sticky(&app, enabled, config.sticky.position);
    Ok(())
}

/// Holding Space in the panel. (The hotkey starts listening by itself.)
#[tauri::command]
pub fn voice_start(app: AppHandle, voice: State<'_, Voice>) {
    voice.start(&app);
}

#[tauri::command]
pub fn voice_stop(app: AppHandle, voice: State<'_, Voice>) {
    voice.stop(&app);
}

#[tauri::command]
pub async fn voice_download_model(app: AppHandle, voice: State<'_, Voice>) -> Result<(), ()> {
    voice.download(&app).await;
    Ok(())
}

/// Adds a sentence to what Frank is saying.
#[tauri::command]
pub fn speak(app: AppHandle, speech: State<'_, Speech>, text: String) {
    speech.say(&app, &text);
}

#[tauri::command]
pub fn stop_speaking(speech: State<'_, Speech>) {
    speech.stop();
}

/// English system voices, best first, for the picker in Settings.
#[tauri::command]
pub async fn list_voices() -> Result<Vec<SystemVoice>, ()> {
    Ok(tokio::task::spawn_blocking(|| speech::voices().to_vec())
        .await
        .unwrap_or_default())
}

#[tauri::command]
pub fn preview_voice(app: AppHandle, speech: State<'_, Speech>, name: String) {
    speech.preview(&app, &name);
}

/// Frank's mood, shown on the menu bar icon and sticky Frank.
#[tauri::command]
pub fn set_mood(app: AppHandle, mood: shell::Mood) {
    shell::set_mood(&app, mood);
}
