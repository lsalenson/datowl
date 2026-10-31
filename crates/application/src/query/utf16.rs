use std::str::CharIndices;

/// Converts increasing byte offsets into UTF-16 offsets (what the editor counts in),
/// walking the text only once.
pub struct Utf16Cursor<'a> {
    chars: CharIndices<'a>,
    byte: usize,
    units: u32,
}

impl<'a> Utf16Cursor<'a> {
    pub fn new(text: &'a str) -> Self {
        Self { chars: text.char_indices(), byte: 0, units: 0 }
    }

    /// `byte` must not be smaller than the previous call's.
    pub fn at(&mut self, byte: usize) -> u32 {
        while self.byte < byte {
            match self.chars.next() {
                Some((i, c)) => {
                    self.units += c.len_utf16() as u32;
                    self.byte = i + c.len_utf8();
                }
                None => break,
            }
        }
        self.units
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_utf16_units() {
        let text = "aé😀b";
        let mut cursor = Utf16Cursor::new(text);
        assert_eq!(cursor.at(0), 0);
        assert_eq!(cursor.at(1), 1);
        assert_eq!(cursor.at(3), 2);
        assert_eq!(cursor.at(7), 4);
        assert_eq!(cursor.at(8), 5);
    }
}
