//! Frank's core: everything that touches the operating system.
//!
//! - `config`: `~/.frank/config.toml`
//! - `plans`: finding the plan an agent just wrote
//! - `files`: reading the files a plan mentions, safely
//! - `repo`: a short summary of the repo the plan is about
//! - `brain`: the AIs Frank can think with (answer-only, always)
//! - `detect`: what's installed, for first-run setup
//!
//! The session logic lives in the TypeScript engine (`packages/engine`). The
//! types here serialize to the same camelCase shapes.

pub mod brain;
pub mod config;
pub mod detect;
pub mod env;
pub mod files;
pub mod plans;
pub mod repo;
pub mod types;

pub use types::{FileContext, Plan, PlanSource, RepoSummary, RulesFile};
