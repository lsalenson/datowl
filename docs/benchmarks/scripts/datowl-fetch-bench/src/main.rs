//! Measures Datowl's PostgreSQL fetch path on `SELECT * FROM bench_rows` (200 000 x 3):
//!  * first_page: execute with the UI's default page size (500) — what the grid shows first;
//!  * first_row: time until the first row reaches the sink, same call;
//!  * all_rows: execute with page_size = 200 000 (every row streamed into the sink).
//! Each measure uses a fresh connection, as a new console would. Prints JSON lines.
use std::time::Instant;

use datowl_domain::{CancellationToken, Column, ConnectionConfig, Driver, DriverKind, ResultSink, Row, TlsMode};
use datowl_postgres::PostgresDriver;

// Same allocator as the desktop app.
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

struct Sink {
    started: Instant,
    first_row_us: Option<u128>,
    rows: Vec<Row>,
}

impl ResultSink for Sink {
    fn columns(&mut self, _columns: Vec<Column>) {}
    fn row(&mut self, row: Row) {
        if self.first_row_us.is_none() {
            self.first_row_us = Some(self.started.elapsed().as_micros());
        }
        self.rows.push(row);
    }
    fn notice(&mut self, _message: String) {}
}

async fn measure(port: u16, page: usize) -> (f64, f64, usize) {
    let config = ConnectionConfig {
        id: uuid::Uuid::new_v4(),
        name: "bench".into(),
        driver: DriverKind::Postgres,
        host: "localhost".into(),
        port,
        user: "datowl".into(),
        database: "postgres".into(),
        tls: TlsMode::Disable,
        save_password: false,
        color: None,
    };
    let session = PostgresDriver.connect(&config, None).await.expect("connect");
    let started = Instant::now();
    let mut sink = Sink { started, first_row_us: None, rows: Vec::with_capacity(page.min(200_000)) };
    let outcome = session
        .execute("SELECT * FROM bench_rows", page, &CancellationToken::new(), &mut sink)
        .await
        .expect("execute");
    let total = started.elapsed().as_secs_f64() * 1000.0;
    assert_eq!(outcome.rows as usize, sink.rows.len());
    let first = sink.first_row_us.expect("no row") as f64 / 1000.0;
    drop(sink);
    session.close().await;
    (first, total, outcome.rows as usize)
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PGPORT").ok().and_then(|p| p.parse().ok()).unwrap_or(55432);
    let runs: usize = std::env::args().nth(1).and_then(|r| r.parse().ok()).unwrap_or(5);
    // Warm-up (server cache, connection path), not reported.
    measure(port, 200_000).await;
    for run in 0..runs {
        let (first_row, first_page, n500) = measure(port, 500).await;
        let (_, all, n) = measure(port, 200_000).await;
        assert_eq!(n500, 500);
        assert_eq!(n, 200_000);
        println!(
            "{}",
            serde_json::json!({"run": run, "first_row_ms": first_row, "first_page_500_ms": first_page, "all_rows_ms": all, "rows": n})
        );
    }
}
