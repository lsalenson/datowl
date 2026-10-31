//! Splits a SQL script into statements without parsing it.
//!
//! The lexer only understands what can hide a `;`: quoted strings and identifiers,
//! comments and Postgres dollar quoting. Each span is trimmed so it starts on the first
//! keyword and stops before trailing whitespace, comments and the `;`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dialect {
    Postgres,
    Clickhouse,
}

/// Byte range of one statement in the source text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    pub fn slice<'a>(&self, sql: &'a str) -> &'a str {
        &sql[self.start..self.end]
    }
}

pub fn split_statements(sql: &str, dialect: Dialect) -> Vec<Span> {
    let b = sql.as_bytes();
    let mut spans = Vec::new();
    let mut start: Option<usize> = None;
    let mut end = 0;
    let mut i = 0;

    while i < b.len() {
        let c = b[i];
        match c {
            b'-' if b.get(i + 1) == Some(&b'-') => {
                i = skip_line_comment(b, i);
                continue;
            }
            b'/' if b.get(i + 1) == Some(&b'*') => {
                i = skip_block_comment(b, i);
                continue;
            }
            b';' => {
                if let Some(s) = start.take() {
                    spans.push(Span { start: s, end });
                }
                i += 1;
                continue;
            }
            c if c.is_ascii_whitespace() => {
                i += 1;
                continue;
            }
            _ => {}
        }

        start.get_or_insert(i);
        i = match c {
            b'\'' => skip_quoted(b, i, b'\'', backslash_escapes(b, i, dialect)),
            b'"' => skip_quoted(b, i, b'"', dialect == Dialect::Clickhouse),
            b'`' if dialect == Dialect::Clickhouse => skip_quoted(b, i, b'`', true),
            b'$' if dialect == Dialect::Postgres => skip_dollar_quoted(b, i).unwrap_or(i + 1),
            _ => i + utf8_width(c),
        };
        end = i;
    }

    if let Some(s) = start {
        spans.push(Span { start: s, end });
    }
    spans
}

fn utf8_width(lead: u8) -> usize {
    match lead {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        _ => 4,
    }
}

fn is_ident(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c >= 0x80
}

/// ClickHouse always honours backslash escapes; Postgres only inside `E'...'` strings.
fn backslash_escapes(b: &[u8], quote: usize, dialect: Dialect) -> bool {
    match dialect {
        Dialect::Clickhouse => true,
        Dialect::Postgres => {
            quote >= 1
                && matches!(b[quote - 1], b'E' | b'e')
                && (quote < 2 || !is_ident(b[quote - 2]))
        }
    }
}

/// Returns the index just past the closing quote (a doubled quote is an escaped quote).
fn skip_quoted(b: &[u8], open: usize, quote: u8, backslash: bool) -> usize {
    let mut j = open + 1;
    while j < b.len() {
        let c = b[j];
        if backslash && c == b'\\' {
            j += 2;
        } else if c == quote {
            if b.get(j + 1) == Some(&quote) {
                j += 2;
            } else {
                return j + 1;
            }
        } else {
            j += 1;
        }
    }
    b.len()
}

/// `$tag$ ... $tag$`. Returns `None` when the `$` is not an opening tag
/// (positional parameter `$1`, or part of an identifier such as `a$b`).
fn skip_dollar_quoted(b: &[u8], open: usize) -> Option<usize> {
    if open > 0 && is_ident(b[open - 1]) {
        return None;
    }
    let mut j = open + 1;
    if b.get(j).is_some_and(|c| c.is_ascii_digit()) {
        return None;
    }
    while j < b.len() && is_ident(b[j]) {
        j += 1;
    }
    if b.get(j) != Some(&b'$') {
        return None;
    }
    let tag = &b[open..=j];
    let body = j + 1;
    let close = b[body..].windows(tag.len()).position(|w| w == tag);
    Some(close.map_or(b.len(), |p| body + p + tag.len()))
}

fn skip_line_comment(b: &[u8], i: usize) -> usize {
    b[i..].iter().position(|&c| c == b'\n').map_or(b.len(), |p| i + p)
}

fn skip_block_comment(b: &[u8], i: usize) -> usize {
    let mut depth = 0;
    let mut j = i;
    while j + 1 < b.len() {
        match (b[j], b[j + 1]) {
            (b'/', b'*') => {
                depth += 1;
                j += 2;
            }
            (b'*', b'/') => {
                depth -= 1;
                j += 2;
                if depth == 0 {
                    return j;
                }
            }
            _ => j += 1,
        }
    }
    b.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn split(sql: &str, dialect: Dialect) -> Vec<&str> {
        split_statements(sql, dialect).iter().map(|s| s.slice(sql)).collect()
    }

    #[test]
    fn splits_on_semicolons_and_trims() {
        assert_eq!(
            split("  select 1;\n\nselect 2 ;  select 3", Dialect::Postgres),
            ["select 1", "select 2", "select 3"]
        );
    }

    #[test]
    fn ignores_empty_and_comment_only_statements() {
        assert_eq!(
            split(";; -- just a comment\n; /* block */ ;select 1; -- tail", Dialect::Postgres),
            ["select 1"]
        );
    }

    #[test]
    fn keeps_inner_comments_but_drops_leading_and_trailing_ones() {
        assert_eq!(
            split("-- lead\nselect /* ; */ 1 -- trailing ;\n;", Dialect::Postgres),
            ["select /* ; */ 1"]
        );
    }

    #[test]
    fn semicolons_inside_strings_and_identifiers() {
        assert_eq!(
            split(r#"select 'a;''b', "x;y" from t; select 2"#, Dialect::Postgres),
            [r#"select 'a;''b', "x;y" from t"#, "select 2"]
        );
    }

    #[test]
    fn postgres_escape_strings() {
        assert_eq!(split(r"select E'it\'s;'; select 2", Dialect::Postgres), [r"select E'it\'s;'", "select 2"]);
        // Outside E-strings a backslash is a plain character.
        assert_eq!(split(r"select '\'; select 2", Dialect::Postgres), [r"select '\'", "select 2"]);
    }

    #[test]
    fn postgres_dollar_quoting() {
        let sql = "create function f() returns int as $body$ begin; return 1; end $body$ language plpgsql; select $1, a$b";
        assert_eq!(
            split(sql, Dialect::Postgres),
            [
                "create function f() returns int as $body$ begin; return 1; end $body$ language plpgsql",
                "select $1, a$b"
            ]
        );
        assert_eq!(split("do $$ begin; end $$; select 1", Dialect::Postgres), ["do $$ begin; end $$", "select 1"]);
    }

    #[test]
    fn nested_block_comments() {
        assert_eq!(split("select /* a /* ; */ b */ 1; select 2", Dialect::Postgres), ["select /* a /* ; */ b */ 1", "select 2"]);
    }

    #[test]
    fn clickhouse_backticks_and_backslashes() {
        assert_eq!(
            split(r"select `a;b`, 'it\'s;' from t; select 2", Dialect::Clickhouse),
            [r"select `a;b`, 'it\'s;' from t", "select 2"]
        );
    }

    #[test]
    fn unterminated_constructs_run_to_the_end() {
        assert_eq!(split("select 'oops; select 2", Dialect::Postgres), ["select 'oops; select 2"]);
        assert_eq!(split("select 1 /* never closed ;", Dialect::Postgres), ["select 1"]);
    }

    #[test]
    fn multibyte_text_keeps_char_boundaries() {
        assert_eq!(split("select 'é;è' as café;select '日本'", Dialect::Postgres), ["select 'é;è' as café", "select '日本'"]);
    }
}
