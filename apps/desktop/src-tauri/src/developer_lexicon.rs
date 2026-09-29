//! Pronunciations and expansions for words developers use.
//!
//! Keep policy here rather than inferring it from casing. That lets `REST`
//! sound like "rest", `API` sound like letters, and `JSON` keep its familiar
//! pronunciation even when the source uses a different case.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pronunciation {
    /// Already in Kokoro's phoneme alphabet.
    Phonemes(&'static str),
    /// Text to feed back through the ordinary verbalizer and dictionary.
    Alias(&'static str),
    /// Say every character as a letter.
    Initialism,
}

struct Entry {
    forms: &'static [&'static str],
    pronunciation: Pronunciation,
}

const ENTRIES: &[Entry] = &[
    Entry {
        forms: &["API", "api"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["HTTP", "http", "HTTPS", "https"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["CSS", "css", "HTML", "html"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["SDK", "sdk", "CLI", "cli"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["JWT", "jwt", "URL", "url", "URI", "uri", "UUID", "uuid"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["UI", "ui", "UX", "ux", "CPU", "cpu", "GPU", "gpu"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["DNS", "dns", "TCP", "tcp", "TLS", "tls", "SSH", "ssh"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["CI", "ci", "CD", "cd", "DB", "db"],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &[
            "JS", "js", "TS", "ts", "JSX", "jsx", "TSX", "tsx", "RPC", "rpc",
        ],
        pronunciation: Pronunciation::Initialism,
    },
    Entry {
        forms: &["REST"],
        pronunciation: Pronunciation::Phonemes("ɹˈɛst"),
    },
    Entry {
        forms: &["k8s", "K8s", "K8S"],
        pronunciation: Pronunciation::Alias("Kubernetes"),
    },
    Entry {
        forms: &["i18n", "I18N"],
        pronunciation: Pronunciation::Alias("internationalization"),
    },
    Entry {
        forms: &["a11y", "A11Y"],
        pronunciation: Pronunciation::Alias("accessibility"),
    },
    Entry {
        forms: &["IPv4", "ipv4"],
        pronunciation: Pronunciation::Alias("I P V four"),
    },
    Entry {
        forms: &["IPv6", "ipv6"],
        pronunciation: Pronunciation::Alias("I P V six"),
    },
    Entry {
        forms: &["gRPC", "grpc"],
        pronunciation: Pronunciation::Alias("G R P C"),
    },
    Entry {
        forms: &["PostgreSQL", "postgresql"],
        pronunciation: Pronunciation::Alias("Postgres Q L"),
    },
    Entry {
        forms: &["redis", "Redis"],
        pronunciation: Pronunciation::Phonemes("ɹˈɛdɪs"),
    },
    Entry {
        forms: &["postgres", "Postgres"],
        pronunciation: Pronunciation::Phonemes("pˈOstɡɹɛs"),
    },
    Entry {
        forms: &["kubernetes", "Kubernetes"],
        pronunciation: Pronunciation::Phonemes("kˌubəɹnˈɛtiz"),
    },
    Entry {
        forms: &["json", "JSON"],
        pronunciation: Pronunciation::Phonemes("ʤˈAsᵊn"),
    },
    Entry {
        forms: &["yaml", "YAML"],
        pronunciation: Pronunciation::Phonemes("jˈæmᵊl"),
    },
    Entry {
        forms: &["toml", "TOML"],
        pronunciation: Pronunciation::Phonemes("tˈɑmᵊl"),
    },
    Entry {
        forms: &["sql", "SQL"],
        pronunciation: Pronunciation::Phonemes("sˈikwᵊl"),
    },
    Entry {
        forms: &["npm", "NPM"],
        pronunciation: Pronunciation::Phonemes("ˌɛnpˌiˈɛm"),
    },
    Entry {
        forms: &["pnpm", "PNPM"],
        pronunciation: Pronunciation::Phonemes("pˌiˌɛnpˌiˈɛm"),
    },
    Entry {
        forms: &["repo", "Repo"],
        pronunciation: Pronunciation::Phonemes("ɹˈipO"),
    },
    Entry {
        forms: &["repos", "Repos"],
        pronunciation: Pronunciation::Phonemes("ɹˈipOz"),
    },
    Entry {
        forms: &["config", "Config"],
        pronunciation: Pronunciation::Phonemes("kˈɑnfɪɡ"),
    },
    Entry {
        forms: &["async", "Async"],
        pronunciation: Pronunciation::Phonemes("ˈAsɪŋk"),
    },
    Entry {
        forms: &["oauth", "OAuth"],
        pronunciation: Pronunciation::Phonemes("ˈOˌɔθ"),
    },
    Entry {
        forms: &["github", "GitHub"],
        pronunciation: Pronunciation::Phonemes("ɡˈɪthʌb"),
    },
    Entry {
        forms: &["nginx", "Nginx", "NGINX"],
        pronunciation: Pronunciation::Phonemes("ˈɛnʤɪnˈɛks"),
    },
    Entry {
        forms: &["graphql", "GraphQL"],
        pronunciation: Pronunciation::Phonemes("ɡɹˈæfkjuˈɛl"),
    },
    Entry {
        forms: &["webhook", "Webhook"],
        pronunciation: Pronunciation::Phonemes("wˈɛbhʊk"),
    },
    Entry {
        forms: &["webhooks", "Webhooks"],
        pronunciation: Pronunciation::Phonemes("wˈɛbhʊks"),
    },
    Entry {
        forms: &["middleware", "Middleware"],
        pronunciation: Pronunciation::Phonemes("mˈɪdᵊlwɛɹ"),
    },
    Entry {
        forms: &["localhost", "Localhost"],
        pronunciation: Pronunciation::Phonemes("lˈOkᵊlhˌOst"),
    },
    Entry {
        forms: &["frontend", "Frontend"],
        pronunciation: Pronunciation::Phonemes("fɹˈʌntˌɛnd"),
    },
    Entry {
        forms: &["backend", "Backend"],
        pronunciation: Pronunciation::Phonemes("bˈækˌɛnd"),
    },
    Entry {
        forms: &["namespace", "Namespace"],
        pronunciation: Pronunciation::Phonemes("nˈAmspˌAs"),
    },
    Entry {
        forms: &["dev", "Dev"],
        pronunciation: Pronunciation::Phonemes("dˈɛv"),
    },
    Entry {
        forms: &["devs", "Devs"],
        pronunciation: Pronunciation::Phonemes("dˈɛvz"),
    },
    Entry {
        forms: &["env", "Env"],
        pronunciation: Pronunciation::Phonemes("ˈɛnv"),
    },
    Entry {
        forms: &["todo", "TODO", "Todo"],
        pronunciation: Pronunciation::Phonemes("tˈudu"),
    },
    Entry {
        forms: &["rust", "Rust"],
        pronunciation: Pronunciation::Phonemes("ɹˈʌst"),
    },
    Entry {
        forms: &["tauri", "Tauri"],
        pronunciation: Pronunciation::Phonemes("tˈWɹi"),
    },
    Entry {
        forms: &["kafka", "Kafka"],
        pronunciation: Pronunciation::Phonemes("kˈɑfkə"),
    },
    Entry {
        forms: &["vite", "Vite"],
        pronunciation: Pronunciation::Phonemes("vˈit"),
    },
    Entry {
        forms: &["vitest", "Vitest"],
        pronunciation: Pronunciation::Phonemes("vˈitɛst"),
    },
    Entry {
        forms: &["typescript", "TypeScript"],
        pronunciation: Pronunciation::Phonemes("tˈIpskɹɪpt"),
    },
    Entry {
        forms: &["javascript", "JavaScript"],
        pronunciation: Pronunciation::Phonemes("ʤˈɑvəskɹɪpt"),
    },
];

pub fn find(word: &str) -> Option<Pronunciation> {
    ENTRIES
        .iter()
        .find(|entry| entry.forms.contains(&word))
        .map(|entry| entry.pronunciation)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policies_are_explicit_and_case_aware() {
        assert_eq!(find("API"), Some(Pronunciation::Initialism));
        assert_eq!(find("JSON"), Some(Pronunciation::Phonemes("ʤˈAsᵊn")));
        assert_eq!(find("REST"), Some(Pronunciation::Phonemes("ɹˈɛst")));
        assert_eq!(find("rest"), None);
        assert_eq!(find("IT"), None);
        assert_eq!(find("it"), None);
    }
}
