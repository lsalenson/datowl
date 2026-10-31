use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use datowl_domain::{Column, ResultSink, Row};

use super::{RunEvent, RunEvents};

/// Batches rows before they cross the IPC bridge: the first batch is small so the grid
/// paints immediately, later ones are large to keep serialization overhead low.
pub(crate) struct BatchingSink {
    events: Arc<dyn RunEvents>,
    index: usize,
    buffer: Vec<Row>,
    last_flush: Instant,
    flushed_once: bool,
}

const FIRST_BATCH: usize = 100;
const BATCH: usize = 5_000;
const MAX_LATENCY: Duration = Duration::from_millis(40);

impl BatchingSink {
    pub fn new(events: Arc<dyn RunEvents>, index: usize) -> Self {
        Self { events, index, buffer: Vec::new(), last_flush: Instant::now(), flushed_once: false }
    }

    pub fn flush(&mut self) {
        if self.buffer.is_empty() {
            return;
        }
        let rows = std::mem::take(&mut self.buffer);
        self.events.send(RunEvent::Rows { index: self.index, rows });
        self.last_flush = Instant::now();
        self.flushed_once = true;
    }
}

impl ResultSink for BatchingSink {
    fn columns(&mut self, columns: Vec<Column>) {
        self.events.send(RunEvent::Columns { index: self.index, columns });
    }

    fn row(&mut self, row: Row) {
        self.buffer.push(row);
        let threshold = if self.flushed_once { BATCH } else { FIRST_BATCH };
        if self.buffer.len() >= threshold || self.last_flush.elapsed() >= MAX_LATENCY {
            self.flush();
        }
    }

    fn notice(&mut self, message: String) {
        self.flush();
        self.events.send(RunEvent::Notice { message });
    }
}
