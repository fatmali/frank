//! Text to phonemes for Kokoro, Frank's natural voice.
//!
//! Code notation is verbalized first, then words are looked up in misaki's
//! American English dictionaries (Apache 2.0; about 180,000 words, already in
//! Kokoro's phoneme alphabet). Unknown words are handled as acronyms,
//! compounds, suffixed words, or finally letter by letter. No GPL phonemizer
//! is involved.

use crate::developer_lexicon::{Pronunciation, find as developer_pronunciation};
use std::collections::HashMap;

pub struct Lexicon {
    words: HashMap<String, String>,
}

/// Letter names, for acronyms and spelling out.
fn letter(c: char) -> Option<&'static str> {
    Some(match c.to_ascii_uppercase() {
        'A' => "ˈA",
        'B' => "bˈi",
        'C' => "sˈi",
        'D' => "dˈi",
        'E' => "ˈi",
        'F' => "ˈɛf",
        'G' => "ʤˈi",
        'H' => "ˈAʧ",
        'I' => "ˈI",
        'J' => "ʤˈA",
        'K' => "kˈA",
        'L' => "ˈɛl",
        'M' => "ˈɛm",
        'N' => "ˈɛn",
        'O' => "ˈO",
        'P' => "pˈi",
        'Q' => "kjˈu",
        'R' => "ˈɑɹ",
        'S' => "ˈɛs",
        'T' => "tˈi",
        'U' => "jˈu",
        'V' => "vˈi",
        'W' => "dˈʌbᵊlju",
        'X' => "ˈɛks",
        'Y' => "wˈI",
        'Z' => "zˈi",
        _ => return None,
    })
}

impl Lexicon {
    /// Loads misaki's dictionaries (gold wins over silver).
    pub fn load(gold: &str, silver: &str) -> Result<Self, String> {
        let mut words = HashMap::with_capacity(190_000);
        for json in [silver, gold] {
            let map: HashMap<String, serde_json::Value> =
                serde_json::from_str(json).map_err(|e| format!("bad dictionary: {e}"))?;
            for (word, value) in map {
                let phonemes = match value {
                    serde_json::Value::String(s) => s,
                    serde_json::Value::Object(o) => match o.get("DEFAULT") {
                        Some(serde_json::Value::String(s)) => s.clone(),
                        _ => continue,
                    },
                    _ => continue,
                };
                words.insert(word, phonemes);
            }
        }
        Ok(Self::from_map(words))
    }

    pub fn from_map(words: HashMap<String, String>) -> Self {
        Self { words }
    }

    /// A sentence as Kokoro phonemes: words separated by spaces, with
    /// punctuation kept for its pauses.
    pub fn phonemes(&self, text: &str) -> String {
        let mut out = String::new();
        for token in tokenize(&crate::verbalize::text(text)) {
            match token {
                Token::Punct(p) => out.push(p),
                Token::Word(w) => {
                    let p = self.word(&w);
                    if p.is_empty() {
                        continue;
                    }
                    if !out.is_empty() {
                        out.push(' ');
                    }
                    out.push_str(&p);
                }
            }
        }
        out
    }

    fn lookup(&self, w: &str) -> Option<&str> {
        let lower = w.to_lowercase();
        let capital = capitalize(&lower);
        [w, lower.as_str(), capital.as_str()]
            .into_iter()
            .find_map(|k| self.words.get(k))
            .map(String::as_str)
    }

    fn word(&self, w: &str) -> String {
        if let Some(pronunciation) = developer_pronunciation(w) {
            return match pronunciation {
                Pronunciation::Phonemes(phonemes) => phonemes.to_owned(),
                Pronunciation::Alias(alias) => alias
                    .split_whitespace()
                    .map(|part| self.word(part))
                    .collect::<Vec<_>>()
                    .join(" "),
                Pronunciation::Initialism => spell(w),
            };
        }
        if w.len() == 1 && w.chars().all(|c| c.is_ascii_uppercase()) {
            return spell(w);
        }
        if let Some(p) = self.lookup(w) {
            return p.to_owned();
        }
        if is_acronym(w) {
            return spell(w);
        }
        // camelCase, snake_case, kebab-case and digits: say the parts.
        let parts = split_parts(w);
        if parts.len() > 1 {
            return parts
                .iter()
                .map(|p| self.word(p))
                .collect::<Vec<_>>()
                .join(" ");
        }
        let lower = w.to_lowercase();
        if let Some(p) = self.suffixed(&lower) {
            return p;
        }
        if let Some(p) = self.compound(&lower) {
            return p;
        }
        spell(w)
    }

    /// A known word plus a common suffix: "routed", "limits", "checking".
    fn suffixed(&self, w: &str) -> Option<String> {
        const SUFFIXES: &[&str] = &["ing", "ers", "ed", "es", "er", "ly", "s", "d"];
        SUFFIXES.iter().find_map(|suffix| {
            let stem = w.strip_suffix(suffix)?;
            if stem.len() < 3 {
                return None;
            }
            // "rout" + "ed" is "route" + "d".
            let base = self
                .lookup(stem)
                .map(str::to_owned)
                .or_else(|| self.lookup(&format!("{stem}e")).map(str::to_owned))?;
            let last = base
                .chars()
                .rev()
                .find(|c| c.is_alphabetic())
                .unwrap_or(' ');
            let sound = match *suffix {
                "ing" => "ɪŋ",
                "er" => "əɹ",
                "ers" => "əɹz",
                "ly" => "li",
                "ed" | "d" => ed_sound(last),
                _ => s_sound(last),
            };
            Some(format!("{base}{sound}"))
        })
    }

    /// Two known words run together: "ratelimit", "healthcheck".
    fn compound(&self, w: &str) -> Option<String> {
        let chars: Vec<(usize, char)> = w.char_indices().collect();
        (3..chars.len().saturating_sub(2)).rev().find_map(|i| {
            let at = chars[i].0;
            let (a, b) = w.split_at(at);
            Some(format!("{} {}", self.lookup(a)?, self.lookup(b)?))
        })
    }
}

const VOICELESS: &[char] = &['p', 't', 'k', 'f', 'θ', 's', 'ʃ', 'ʧ'];

/// "-ed" is "id" after t and d, "t" after voiceless sounds, else "d".
fn ed_sound(last: char) -> &'static str {
    if matches!(last, 't' | 'd') {
        "ɪd"
    } else if VOICELESS.contains(&last) {
        "t"
    } else {
        "d"
    }
}

/// "-s" is "iz" after hissing sounds, "s" after voiceless ones, else "z".
fn s_sound(last: char) -> &'static str {
    if matches!(last, 's' | 'z' | 'ʃ' | 'ʒ' | 'ʧ' | 'ʤ') {
        "ɪz"
    } else if VOICELESS.contains(&last) {
        "s"
    } else {
        "z"
    }
}

enum Token {
    Word(String),
    Punct(char),
}

/// Punctuation Kokoro knows; it shapes the pauses.
const PUNCT: &[char] = &['.', ',', '!', '?', ';', ':', '—', '…'];

fn tokenize(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut word = String::new();
    let flush = |word: &mut String, tokens: &mut Vec<Token>| {
        let w = word.trim_matches(|c| c == '\'' || c == '-' || c == '_');
        if !w.is_empty() {
            tokens.push(Token::Word(w.to_owned()));
        }
        word.clear();
    };
    for c in text.chars() {
        if c.is_alphanumeric() || matches!(c, '\'' | '’' | '-' | '_') {
            word.push(if c == '’' { '\'' } else { c });
        } else {
            flush(&mut word, &mut tokens);
            if PUNCT.contains(&c) {
                tokens.push(Token::Punct(c));
            }
        }
    }
    flush(&mut word, &mut tokens);
    tokens
}

fn is_acronym(w: &str) -> bool {
    w.len() >= 2 && w.len() <= 10 && w.chars().all(|c| c.is_ascii_uppercase())
}

fn spell(w: &str) -> String {
    w.chars().filter_map(letter).collect::<Vec<_>>().join(" ")
}

fn capitalize(w: &str) -> String {
    let mut c = w.chars();
    c.next()
        .map(|f| f.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}

/// "rateLimit" -> [rate, Limit]; "rate_limit" and "rate-limit" likewise;
/// "HTTPServer" -> [HTTP, Server].
fn split_parts(w: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    for chunk in w.split(['-', '_']).filter(|s| !s.is_empty()) {
        let chars: Vec<char> = chunk.chars().collect();
        let mut current = String::new();
        for (i, &c) in chars.iter().enumerate() {
            let prev = i.checked_sub(1).map(|j| chars[j]);
            let next = chars.get(i + 1).copied();
            let boundary = match prev {
                Some(p) => {
                    (p.is_lowercase() && c.is_uppercase())
                        || (p.is_uppercase()
                            && c.is_uppercase()
                            && next.is_some_and(char::is_lowercase))
                        || (p.is_alphabetic() != c.is_alphabetic())
                }
                None => false,
            };
            if boundary && !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
            current.push(c);
        }
        if !current.is_empty() {
            parts.push(current);
        }
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lexicon() -> Lexicon {
        let words = [
            ("the", "ði"),
            ("plan", "plˈæn"),
            ("adds", "ˈædz"),
            ("rate", "ɹˈAt"),
            ("limit", "lˈɪmɪt"),
            ("route", "ɹˈut"),
            ("health", "hˈɛlθ"),
            ("check", "ʧˈɛk"),
            ("one", "wˈʌn"),
            ("hundred", "hˈʌndɹəd"),
            ("server", "sˈɜɹvəɹ"),
            ("It", "ɪt"),
        ];
        Lexicon::from_map(
            words
                .into_iter()
                .map(|(w, p)| (w.to_owned(), p.to_owned()))
                .collect(),
        )
    }

    #[test]
    fn looks_words_up_and_keeps_pauses() {
        assert_eq!(
            lexicon().phonemes("The plan adds Redis."),
            "ði plˈæn ˈædz ɹˈɛdɪs."
        );
    }

    #[test]
    fn says_numbers_as_words() {
        assert_eq!(lexicon().phonemes("100"), "wˈʌn hˈʌndɹəd");
    }

    #[test]
    fn spells_acronyms() {
        assert_eq!(lexicon().phonemes("API"), "ˈA pˈi ˈI");
        assert_eq!(lexicon().phonemes("JSON"), "ʤˈAsᵊn");
        assert_eq!(lexicon().phonemes("REST"), "ɹˈɛst");
    }

    #[test]
    fn splits_code_names_and_compounds() {
        let l = lexicon();
        assert_eq!(l.phonemes("rateLimit"), "ɹˈAt lˈɪmɪt");
        assert_eq!(l.phonemes("rate-limit"), "ɹˈAt lˈɪmɪt");
        assert_eq!(l.phonemes("healthcheck"), "hˈɛlθ ʧˈɛk");
        assert_eq!(l.phonemes("HTTPServer"), "ˈAʧ tˈi tˈi pˈi sˈɜɹvəɹ");
    }

    #[test]
    fn handles_suffixes_on_known_words() {
        assert_eq!(lexicon().phonemes("routed"), "ɹˈutɪd");
        assert_eq!(lexicon().phonemes("limits"), "lˈɪmɪts");
        assert_eq!(lexicon().phonemes("checked"), "ʧˈɛkt");
        assert_eq!(lexicon().phonemes("checking"), "ʧˈɛkɪŋ");
    }

    #[test]
    fn spells_what_it_cannot_say() {
        assert_eq!(lexicon().phonemes("zq"), "zˈi kjˈu");
    }
}
