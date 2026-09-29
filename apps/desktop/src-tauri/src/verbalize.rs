//! Turns coding notation into words before grapheme-to-phoneme conversion.
//!
//! This text is only used for synthesis. The panel keeps showing the original
//! plan and conversation text.

use crate::developer_lexicon::{Pronunciation, find};

pub fn text(input: &str) -> String {
    let prepared = input.replace("->", " returns ").replace("=>", " maps to ");
    let mut out = String::with_capacity(prepared.len());
    let mut token = String::new();
    let mut generic_depth = 0;
    let flush = |token: &mut String, out: &mut String| {
        if !token.is_empty() {
            out.push_str(&lexeme(token));
            token.clear();
        }
    };

    for (at, c) in prepared.char_indices() {
        if is_lexeme_char(c) {
            token.push(if c == '’' { '\'' } else { c });
            continue;
        }
        let next = prepared[at + c.len_utf8()..].chars().next();
        let generic_open = c == '<'
            && !token.is_empty()
            && next.is_some_and(char::is_alphanumeric)
            && (token.chars().count() > 1 || token.chars().next().is_some_and(char::is_uppercase));
        flush(&mut token, &mut out);
        match c {
            '&' => out.push_str(" and "),
            '=' => out.push_str(" equals "),
            '<' if generic_open => {
                generic_depth += 1;
                out.push_str(" of ");
            }
            '>' if generic_depth > 0 => generic_depth -= 1,
            '>' => out.push_str(" greater than "),
            '<' => out.push_str(" less than "),
            _ => out.push(c),
        }
    }
    flush(&mut token, &mut out);
    collapse_whitespace(&out)
}

fn is_lexeme_char(c: char) -> bool {
    c.is_alphanumeric()
        || matches!(
            c,
            '\'' | '’' | '-' | '_' | '.' | '/' | '@' | '#' | '+' | ':' | '%' | '$'
        )
}

fn lexeme(raw: &str) -> String {
    match raw.to_ascii_lowercase().as_str() {
        "e.g." => return "for example".into(),
        "i.e." => return "that is".into(),
        "vs." => return "versus".into(),
        _ => {}
    }

    let (core, trailing) = split_trailing_punctuation(raw);
    let mut spoken = core_text(core);
    spoken.push_str(trailing);
    spoken
}

fn split_trailing_punctuation(raw: &str) -> (&str, &str) {
    let at = raw.trim_end_matches(['.', ':']).len();
    if at == 0 { ("", raw) } else { raw.split_at(at) }
}

fn core_text(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }

    match raw.to_ascii_lowercase().as_str() {
        "c++" => return "C plus plus".into(),
        "c#" => return "C sharp".into(),
        ".net" => return "dot net".into(),
        "+" => return "plus".into(),
        "$" => return "dollar".into(),
        _ => {}
    }

    if let Some(policy) = find(raw) {
        return match policy {
            Pronunciation::Alias(alias) => alias.into(),
            Pronunciation::Initialism => letters(raw),
            Pronunciation::Phonemes(_) => raw.into(),
        };
    }

    if let Some(flag) = raw.strip_prefix("--").filter(|s| !s.is_empty()) {
        return format!("dash dash {}", core_text(flag));
    }
    if let Some(issue) = raw.strip_prefix('#').filter(|s| digits(s)) {
        return format!("number {}", spoken_number(issue));
    }
    if let Some(percent) = raw.strip_suffix('%').filter(|s| digits(s)) {
        return format!("{} percent", spoken_number(percent));
    }
    if let Some(port) = port(raw) {
        return port;
    }
    if let Some(version) = dotted_number(raw) {
        return version;
    }
    if let Some(http_version) = protocol_version(raw) {
        return http_version;
    }
    if let Some(percentile) = percentile(raw) {
        return percentile;
    }

    if raw.contains("::") {
        return raw
            .split("::")
            .map(core_text)
            .collect::<Vec<_>>()
            .join(" colon colon ");
    }
    if raw.contains('/') {
        let prefix = raw.strip_prefix('@').map_or("", |_| "at ");
        let body = raw.strip_prefix('@').unwrap_or(raw);
        return format!(
            "{prefix}{}",
            body.split('/')
                .map(core_text)
                .collect::<Vec<_>>()
                .join(" slash ")
        );
    }
    if raw.contains('.') {
        let prefix = if raw.starts_with('.') { "dot " } else { "" };
        let body = raw.strip_prefix('.').unwrap_or(raw);
        return format!(
            "{prefix}{}",
            body.split('.')
                .map(core_text)
                .collect::<Vec<_>>()
                .join(" dot ")
        );
    }
    if raw.contains('+') {
        return raw
            .split('+')
            .filter(|part| !part.is_empty())
            .map(core_text)
            .collect::<Vec<_>>()
            .join(" plus ");
    }
    if raw.contains('#') {
        return raw
            .split('#')
            .map(core_text)
            .collect::<Vec<_>>()
            .join(" hash ");
    }
    if digits(raw) {
        return spoken_number(raw);
    }

    let mixed = split_letters_and_digits(raw);
    if mixed.len() > 1 {
        return mixed
            .iter()
            .map(|part| core_text(part))
            .collect::<Vec<_>>()
            .join(" ");
    }
    raw.into()
}

fn port(raw: &str) -> Option<String> {
    let (host, number) = raw.rsplit_once(':')?;
    if host.is_empty() || host.contains(':') || !digits(number) {
        return None;
    }
    Some(format!(
        "{}, port {}",
        core_text(host),
        spoken_number(number)
    ))
}

fn dotted_number(raw: &str) -> Option<String> {
    let (prefix, number) = match raw.as_bytes().first() {
        Some(b'v' | b'V') => ("version ", &raw[1..]),
        _ => ("", raw),
    };
    let parts: Vec<_> = number.split('.').collect();
    if parts.len() < 2 || !parts.iter().all(|part| digits(part)) {
        return None;
    }
    let separator = if parts.len() == 4 && prefix.is_empty() {
        " dot "
    } else {
        " point "
    };
    Some(format!(
        "{prefix}{}",
        parts
            .iter()
            .map(|part| spoken_number(part))
            .collect::<Vec<_>>()
            .join(separator)
    ))
}

fn protocol_version(raw: &str) -> Option<String> {
    let (protocol, version) = raw.split_once('/')?;
    if !digits(version) {
        return None;
    }
    match find(protocol) {
        Some(Pronunciation::Initialism) => Some(format!(
            "{} version {}",
            letters(protocol),
            spoken_number(version)
        )),
        _ => None,
    }
}

fn percentile(raw: &str) -> Option<String> {
    let number = raw.strip_prefix('p').or_else(|| raw.strip_prefix('P'))?;
    digits(number).then(|| format!("P {}", spoken_number(number)))
}

fn split_letters_and_digits(raw: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut was_digit = None;
    for c in raw.chars() {
        let digit = c.is_ascii_digit();
        if was_digit.is_some_and(|previous| previous != digit) && !current.is_empty() {
            parts.push(std::mem::take(&mut current));
        }
        current.push(c);
        was_digit = Some(digit);
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

fn letters(raw: &str) -> String {
    raw.chars()
        .filter(char::is_ascii_alphabetic)
        .map(|c| c.to_ascii_uppercase().to_string())
        .collect::<Vec<_>>()
        .join(" ")
}

fn digits(raw: &str) -> bool {
    !raw.is_empty() && raw.chars().all(|c| c.is_ascii_digit())
}

fn spoken_number(raw: &str) -> String {
    if raw.len() > 1 && raw.starts_with('0') {
        return raw.chars().map(digit_word).collect::<Vec<_>>().join(" ");
    }
    match raw.parse::<u64>() {
        Ok(number) if raw.len() <= 9 => number_words(number),
        _ => raw.chars().map(digit_word).collect::<Vec<_>>().join(" "),
    }
}

fn digit_word(digit: char) -> &'static str {
    [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    ][digit.to_digit(10).unwrap_or(0) as usize]
}

/// 0 to 999,999,999 in words.
pub fn number_words(number: u64) -> String {
    const ONES: [&str; 20] = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ];
    const TENS: [&str; 10] = [
        "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    ];
    fn below_thousand(number: u64) -> String {
        let mut parts = Vec::new();
        if number >= 100 {
            parts.push(format!("{} hundred", ONES[(number / 100) as usize]));
        }
        let rest = number % 100;
        if rest > 0 || number == 0 {
            parts.push(if rest < 20 {
                ONES[rest as usize].to_owned()
            } else if rest.is_multiple_of(10) {
                TENS[(rest / 10) as usize].to_owned()
            } else {
                format!(
                    "{} {}",
                    TENS[(rest / 10) as usize],
                    ONES[(rest % 10) as usize]
                )
            });
        }
        parts.join(" ")
    }
    if number < 1000 {
        return below_thousand(number);
    }
    let mut parts = Vec::new();
    for (scale, name) in [(1_000_000, "million"), (1_000, "thousand")] {
        if !(number / scale).is_multiple_of(1000) {
            parts.push(format!("{} {name}", below_thousand(number / scale % 1000)));
        }
    }
    if !number.is_multiple_of(1000) {
        parts.push(below_thousand(number % 1000));
    }
    parts.join(" ")
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coding_speech_corpus() {
        let cases = [
            ("API", "A P I"),
            ("api", "A P I"),
            ("HTTP/2", "H T T P version two"),
            ("JSON", "JSON"),
            ("YAML", "YAML"),
            ("OAuth 2.0", "OAuth two point zero"),
            ("PostgreSQL", "Postgres Q L"),
            ("gRPC", "G R P C"),
            ("IPv6", "I P V six"),
            ("k8s", "Kubernetes"),
            ("i18n", "internationalization"),
            ("a11y", "accessibility"),
            ("C++", "C plus plus"),
            ("C#", "C sharp"),
            (".NET", "dot net"),
            ("--force", "dash dash force"),
            ("#42", "number forty two"),
            ("p95", "P ninety five"),
            ("v2.10.3", "version two point ten point three"),
            (
                "127.0.0.1",
                "one hundred twenty seven dot zero dot zero dot one",
            ),
            ("localhost:3000", "localhost, port three thousand"),
            ("@scope/package", "at scope slash package"),
            ("src/auth.ts", "src slash auth dot T S"),
            ("foo::bar", "foo colon colon bar"),
            ("S3", "S three"),
            ("100ms", "one hundred ms"),
            ("CI/CD", "C I slash C D"),
            ("useEffect", "useEffect"),
            ("snake_case", "snake_case"),
            ("foo+bar", "foo plus bar"),
            ("$5", "dollar five"),
            ("95%", "ninety five percent"),
            ("e.g.", "for example"),
            ("value->Result", "value returns Result"),
            ("a=b", "a equals b"),
        ];
        for (source, expected) in cases {
            assert_eq!(text(source), expected, "{source}");
        }
    }

    #[test]
    fn verbalizes_initialisms_and_familiar_acronyms_by_policy() {
        assert_eq!(
            text("The API returns JSON over HTTP."),
            "The A P I returns JSON over H T T P."
        );
        assert_eq!(
            text("REST is not the same as rest."),
            "REST is not the same as rest."
        );
    }

    #[test]
    fn verbalizes_language_and_code_symbols() {
        assert_eq!(
            text("C++, C#, .NET, foo::bar, and --force"),
            "C plus plus, C sharp, dot net, foo colon colon bar, and dash dash force"
        );
        assert_eq!(text("value -> Result<T>"), "value returns Result of T");
        assert_eq!(text("Use Vec<Result<T>>"), "Use Vec of Result of T");
        assert_eq!(text("Keep x > 3"), "Keep x greater than three");
    }

    #[test]
    fn verbalizes_versions_ports_addresses_and_percentiles() {
        assert_eq!(
            text("Use v2.10.3 on localhost:3000 with HTTP/2."),
            "Use version two point ten point three on localhost, port three thousand with H T T P version two."
        );
        assert_eq!(
            text("127.0.0.1 has p95 under 100ms."),
            "one hundred twenty seven dot zero dot zero dot one has P ninety five under one hundred ms."
        );
    }

    #[test]
    fn verbalizes_paths_packages_and_mixed_names() {
        assert_eq!(
            text("@scope/package uses src/auth.ts and S3"),
            "at scope slash package uses src slash auth dot T S and S three"
        );
        assert_eq!(
            text("k8s, i18n, IPv6, and gRPC"),
            "Kubernetes, internationalization, I P V six, and G R P C"
        );
    }

    #[test]
    fn numbers_keep_context() {
        assert_eq!(number_words(100), "one hundred");
        assert_eq!(number_words(42), "forty two");
        assert_eq!(number_words(3_000_017), "three million seventeen");
        assert_eq!(
            text("OAuth 2.0 is at 95%"),
            "OAuth two point zero is at ninety five percent"
        );
        assert_eq!(text("Wait... then retry."), "Wait... then retry.");
    }
}
