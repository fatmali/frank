//! API keys, kept in the OS keychain (macOS Keychain, Windows Credential
//! Manager, the Secret Service on Linux). Never in `config.toml`, never logged.
//!
//! A key in the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) works too,
//! so developers who already export one don't have to paste it again. A key
//! saved in Frank's settings wins over the environment.
//!
//! Keychain calls block (and may show an OS prompt): call them from
//! `spawn_blocking`, not from an async task.

const SERVICE: &str = "frank";

/// Brains that take an API key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Anthropic,
    OpenAi,
    OpenAiCompatible,
}

impl Provider {
    pub fn from_kind(kind: &str) -> Option<Self> {
        match kind {
            "anthropic" => Some(Self::Anthropic),
            "openai" => Some(Self::OpenAi),
            "openai-compatible" => Some(Self::OpenAiCompatible),
            _ => None,
        }
    }

    /// The keychain account name, same as the config's `brain.kind`.
    pub fn account(self) -> &'static str {
        match self {
            Self::Anthropic => "anthropic",
            Self::OpenAi => "openai",
            Self::OpenAiCompatible => "openai-compatible",
        }
    }

    /// The conventional environment variable, if there is one.
    pub fn env_var(self) -> Option<&'static str> {
        match self {
            Self::Anthropic => Some("ANTHROPIC_API_KEY"),
            Self::OpenAi => Some("OPENAI_API_KEY"),
            Self::OpenAiCompatible => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Couldn't use the keychain: {0}")]
pub struct SecretError(String);

/// Where keys are stored. The keychain in the app; memory in tests.
pub trait KeyStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>, SecretError>;
    fn set(&self, account: &str, key: &str) -> Result<(), SecretError>;
    fn delete(&self, account: &str) -> Result<(), SecretError>;
}

/// The OS keychain.
pub struct Keychain;

impl KeyStore for Keychain {
    fn get(&self, account: &str) -> Result<Option<String>, SecretError> {
        match entry(account)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(SecretError(e.to_string())),
        }
    }

    fn set(&self, account: &str, key: &str) -> Result<(), SecretError> {
        entry(account)?
            .set_password(key)
            .map_err(|e| SecretError(e.to_string()))
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError(e.to_string())),
        }
    }
}

fn entry(account: &str) -> Result<keyring::Entry, SecretError> {
    keyring::Entry::new(SERVICE, account).map_err(|e| SecretError(e.to_string()))
}

/// An API key. Its `Debug` output never shows the key.
#[derive(Clone, PartialEq, Eq)]
pub struct ApiKey(String);

impl ApiKey {
    pub fn new(key: impl Into<String>) -> Self {
        Self(key.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ApiKey([hidden])")
    }
}

/// Where a key came from, for the settings screen ("from your keychain",
/// "from ANTHROPIC_API_KEY").
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeySource {
    Keychain,
    Env(&'static str),
}

/// The key for a provider: the saved one, else the environment's.
pub fn api_key(store: &dyn KeyStore, provider: Provider) -> Option<(ApiKey, KeySource)> {
    let saved = store
        .get(provider.account())
        .ok()
        .flatten()
        .map(|k| k.trim().to_owned())
        .filter(|k| !k.is_empty());
    if let Some(key) = saved {
        return Some((ApiKey(key), KeySource::Keychain));
    }
    let var = provider.env_var()?;
    std::env::var(var)
        .ok()
        .map(|k| k.trim().to_owned())
        .filter(|k| !k.is_empty())
        .map(|k| (ApiKey(k), KeySource::Env(var)))
}

/// Saves a pasted key, trimmed. An empty key removes the saved one.
pub fn save_api_key(
    store: &dyn KeyStore,
    provider: Provider,
    key: &str,
) -> Result<(), SecretError> {
    let key = key.trim();
    if key.is_empty() {
        store.delete(provider.account())
    } else {
        store.set(provider.account(), key)
    }
}

/// An in-memory store for tests.
#[derive(Default)]
pub struct MemoryStore(std::sync::Mutex<std::collections::HashMap<String, String>>);

impl KeyStore for MemoryStore {
    fn get(&self, account: &str) -> Result<Option<String>, SecretError> {
        Ok(self.0.lock().expect("not poisoned").get(account).cloned())
    }

    fn set(&self, account: &str, key: &str) -> Result<(), SecretError> {
        self.0
            .lock()
            .expect("not poisoned")
            .insert(account.to_owned(), key.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), SecretError> {
        self.0.lock().expect("not poisoned").remove(account);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_keys_are_trimmed_and_empty_means_remove() {
        let store = MemoryStore::default();
        save_api_key(&store, Provider::OpenAiCompatible, "  sk-local \n").unwrap();
        assert_eq!(
            api_key(&store, Provider::OpenAiCompatible),
            Some((ApiKey::new("sk-local"), KeySource::Keychain))
        );
        let (key, _) = api_key(&store, Provider::OpenAiCompatible).unwrap();
        assert_eq!(format!("{key:?}"), "ApiKey([hidden])");
        save_api_key(&store, Provider::OpenAiCompatible, "   ").unwrap();
        assert_eq!(api_key(&store, Provider::OpenAiCompatible), None);
    }

    #[test]
    fn kinds_map_to_providers() {
        assert_eq!(Provider::from_kind("anthropic"), Some(Provider::Anthropic));
        assert_eq!(Provider::from_kind("ollama"), None);
        assert_eq!(Provider::Anthropic.env_var(), Some("ANTHROPIC_API_KEY"));
        assert_eq!(Provider::OpenAiCompatible.env_var(), None);
    }
}
