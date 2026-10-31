//! Streaming reader for ClickHouse's `TabSeparated` output.
//!
//! TSV is the cheapest format ClickHouse can produce and the cheapest to parse: values
//! are already text, NULL is `\N`, and only a handful of escapes exist. Lines are cut
//! straight out of the network buffer with `memchr`.

use std::{ops::Range, pin::Pin};

use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use datowl_domain::{Error, Result, Row};

type ByteStream = Pin<Box<dyn Stream<Item = reqwest::Result<Bytes>> + Send>>;

pub(crate) struct LineReader {
    stream: ByteStream,
    buf: Vec<u8>,
    /// Start of the next unread line.
    pos: usize,
    /// Bytes before this offset are known to contain no newline.
    scanned: usize,
    eof: bool,
}

impl LineReader {
    pub fn new(stream: impl Stream<Item = reqwest::Result<Bytes>> + Send + 'static) -> Self {
        Self { stream: Box::pin(stream), buf: Vec::with_capacity(64 * 1024), pos: 0, scanned: 0, eof: false }
    }

    /// Returns the byte range of the next line inside [`Self::line`]'s buffer.
    /// The range is valid until the next call.
    pub async fn next_line(&mut self) -> Result<Option<Range<usize>>> {
        loop {
            if let Some(i) = memchr::memchr(b'\n', &self.buf[self.scanned..]) {
                let line = self.pos..self.scanned + i;
                self.pos = line.end + 1;
                self.scanned = self.pos;
                return Ok(Some(line));
            }
            self.scanned = self.buf.len();
            if self.eof {
                if self.pos < self.buf.len() {
                    let line = self.pos..self.buf.len();
                    self.pos = self.buf.len();
                    return Ok(Some(line));
                }
                return Ok(None);
            }
            if self.pos > 0 {
                self.buf.drain(..self.pos);
                self.scanned -= self.pos;
                self.pos = 0;
            }
            match self.stream.next().await {
                Some(Ok(chunk)) => self.buf.extend_from_slice(&chunk),
                Some(Err(e)) => return Err(Error::Connection(e.to_string())),
                None => self.eof = true,
            }
        }
    }

    pub fn line(&self, range: Range<usize>) -> &[u8] {
        &self.buf[range]
    }

    /// Everything not consumed yet, used to collect an exception message.
    pub async fn rest(&mut self) -> String {
        while !self.eof {
            match self.stream.next().await {
                Some(Ok(chunk)) => self.buf.extend_from_slice(&chunk),
                _ => self.eof = true,
            }
        }
        String::from_utf8_lossy(&self.buf[self.pos..]).into_owned()
    }
}

pub(crate) fn parse_row(line: &[u8]) -> Row {
    line.split(|&b| b == b'\t').map(parse_field).collect()
}

fn parse_field(field: &[u8]) -> Option<String> {
    if field == b"\\N" {
        return None;
    }
    if memchr::memchr(b'\\', field).is_none() {
        return Some(String::from_utf8_lossy(field).into_owned());
    }
    let mut out = Vec::with_capacity(field.len());
    let mut bytes = field.iter();
    while let Some(&b) = bytes.next() {
        if b != b'\\' {
            out.push(b);
            continue;
        }
        match bytes.next() {
            Some(b'n') => out.push(b'\n'),
            Some(b't') => out.push(b'\t'),
            Some(b'r') => out.push(b'\r'),
            Some(b'b') => out.push(0x08),
            Some(b'f') => out.push(0x0c),
            Some(b'0') => out.push(0),
            Some(&other) => out.push(other),
            None => out.push(b'\\'),
        }
    }
    Some(String::from_utf8_lossy(&out).into_owned())
}

/// ClickHouse reports errors that happen mid-stream inside the body, since the 200
/// status was already sent.
pub(crate) fn is_exception_line(line: &[u8]) -> bool {
    line.starts_with(b"__exception__") || (line.starts_with(b"Code: ") && memchr::memmem::find(line, b"DB::Exception").is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nulls_and_escapes() {
        assert_eq!(
            parse_row(b"1\t\\N\ta\\tb\\nc\tit\\'s\t\\\\N"),
            vec![
                Some("1".into()),
                None,
                Some("a\tb\nc".into()),
                Some("it's".into()),
                Some("\\N".into()),
            ]
        );
    }

    #[tokio::test]
    async fn reads_lines_across_chunks() {
        let chunks = vec![Ok(Bytes::from_static(b"a\tb\nc")), Ok(Bytes::from_static(b"d\te\n")), Ok(Bytes::from_static(b"tail"))];
        let mut reader = LineReader::new(futures_util::stream::iter(chunks));
        let mut lines = Vec::new();
        while let Some(range) = reader.next_line().await.unwrap() {
            lines.push(String::from_utf8(reader.line(range).to_vec()).unwrap());
        }
        assert_eq!(lines, ["a\tb", "cd\te", "tail"]);
    }

    #[test]
    fn detects_exceptions() {
        assert!(is_exception_line(b"Code: 395. DB::Exception: Value passed to 'throwIf' function is non-zero"));
        assert!(!is_exception_line(b"Code: 395\tsomething"));
    }
}
