//! End-to-end tests against a real server. Skipped unless `DATOWL_TEST_PG_PORT` is set;
//! the database must accept `trust` auth for user `datowl` on localhost and contain the
//! fixture created by `tests/fixture.sql`.

use std::{sync::Arc, time::Instant};

use uuid::Uuid;
use datowl_domain::{
    CancellationToken, Column, ConnectionConfig, Driver, DriverKind, Error, FolderKind, NodeRef,
    ObjectFolderKind, ObjectKind, ObjectRef, ResultSink, Row, Session, TlsMode,
};
use datowl_postgres::PostgresDriver;

#[derive(Default)]
struct Collect {
    columns: Vec<Column>,
    rows: Vec<Row>,
    notices: Vec<String>,
}

impl ResultSink for Collect {
    fn columns(&mut self, columns: Vec<Column>) {
        self.columns = columns;
    }
    fn row(&mut self, row: Row) {
        self.rows.push(row);
    }
    fn notice(&mut self, message: String) {
        self.notices.push(message);
    }
}

async fn session() -> Option<Arc<dyn Session>> {
    let port: u16 = std::env::var("DATOWL_TEST_PG_PORT").ok()?.parse().ok()?;
    let config = ConnectionConfig {
        id: Uuid::new_v4(),
        name: "test".into(),
        driver: DriverKind::Postgres,
        host: "localhost".into(),
        port,
        user: "datowl".into(),
        database: "postgres".into(),
        tls: TlsMode::Disable,
        save_password: false,
        color: None,
    };
    Some(PostgresDriver.connect(&config, None).await.expect("connect"))
}

async fn run(s: &dyn Session, sql: &str, page: usize) -> (datowl_domain::Result<datowl_domain::PageOutcome>, Collect) {
    let mut sink = Collect::default();
    let outcome = s.execute(sql, page, &CancellationToken::new(), &mut sink).await;
    (outcome, sink)
}

async fn count_orders(s: &dyn Session) -> String {
    let (_, sink) = run(s, "select count(*) from orders", 10).await;
    sink.rows[0][0].clone().unwrap()
}

#[tokio::test]
async fn paging_transactions_errors_and_cancel() {
    let Some(s) = session().await else { return };
    let observer = session().await.unwrap();
    assert!(s.server_version().starts_with("PostgreSQL 16"));
    run(&*s, "delete from orders where status in ('x', 'y')", 10).await.0.unwrap();

    // Paged through a cursor.
    let (outcome, sink) = run(&*s, "select * from users order by id", 500).await;
    let outcome = outcome.unwrap();
    assert_eq!((outcome.rows, outcome.has_more), (500, true));
    assert_eq!(sink.columns[0].type_name, "int8");
    assert!(sink.columns[0].numeric);
    assert_eq!(sink.rows[0][0].as_deref(), Some("1"));
    assert_eq!(sink.rows[6][2], None, "NULL comes through as None");

    let mut more = Collect::default();
    let page = s.fetch_more(500, &CancellationToken::new(), &mut more).await.unwrap();
    assert_eq!((page.rows, page.has_more), (500, true));
    assert_eq!(more.rows[0][0].as_deref(), Some("501"));
    let page = s.fetch_more(100_000, &CancellationToken::new(), &mut more).await.unwrap();
    assert_eq!((page.rows, page.has_more), (1500, false));
    assert!(matches!(s.fetch_more(10, &CancellationToken::new(), &mut more).await, Err(Error::NoOpenResult)));

    // A result left open must not swallow the next write: it commits on its own.
    let before: i64 = count_orders(&*observer).await.parse().unwrap();
    assert!(run(&*s, "select * from orders", 10).await.0.unwrap().has_more);
    let (outcome, sink) = run(&*s, "insert into orders (user_id, total, status) values (1, 1, 'x')", 10).await;
    assert_eq!(outcome.unwrap().rows_affected, Some(1));
    assert!(sink.columns.is_empty());
    assert_eq!(count_orders(&*observer).await.parse::<i64>().unwrap(), before + 1);

    // Inside the user's own transaction, paging leaves the transaction alone.
    run(&*s, "begin", 10).await.0.unwrap();
    assert!(run(&*s, "select * from users", 10).await.0.unwrap().has_more);
    run(&*s, "insert into orders (user_id, total, status) values (1, 1, 'y')", 10).await.0.unwrap();
    run(&*s, "rollback", 10).await.0.unwrap();
    assert_eq!(count_orders(&*observer).await.parse::<i64>().unwrap(), before + 1);

    // Errors point into the user's text.
    for (sql, code, position) in [("select id, email from userz", "[42P01]", 23), ("select id,, email from users", "[42601]", 11)] {
        match run(&*s, sql, 10).await.0 {
            Err(Error::Database { message, position: p }) => {
                assert!(message.starts_with(code), "{message}");
                assert_eq!(p, Some(position), "{sql}");
            }
            other => panic!("expected an error for {sql}, got {other:?}"),
        }
    }

    // Data-modifying CTEs cannot run in a cursor and fall back to direct execution.
    let (outcome, sink) = run(&*s, "with d as (delete from orders where status = 'x' returning *) select count(*) from d", 10).await;
    outcome.unwrap();
    assert_eq!(sink.rows, vec![vec![Some("1".to_owned())]]);

    // Notices reach the sink.
    let (outcome, sink) = run(&*s, "do $$ begin raise notice 'hello from plpgsql'; end $$", 10).await;
    outcome.unwrap();
    assert!(sink.notices.iter().any(|n| n.contains("hello from plpgsql")), "{:?}", sink.notices);

    // Cancellation stops a running statement and leaves the session usable.
    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        trigger.cancel();
    });
    let started = Instant::now();
    let mut sink = Collect::default();
    let outcome = s.execute("select pg_sleep(10)", 10, &cancel, &mut sink).await;
    assert!(matches!(outcome, Err(Error::Cancelled)), "{outcome:?}");
    assert!(started.elapsed().as_secs() < 3);
    assert_eq!(run(&*s, "select 1", 10).await.1.rows, vec![vec![Some("1".to_owned())]]);
}

#[tokio::test]
async fn explorer_ddl_and_completion() {
    let Some(s) = session().await else { return };

    let databases = s.children(&NodeRef::Root).await.unwrap();
    assert!(databases.iter().any(|n| n.label == "postgres" && n.node.is_some()));

    let folders = s
        .children(&NodeRef::Schema { database: "postgres".into(), schema: "public".into() })
        .await
        .unwrap();
    let labels: Vec<_> = folders.iter().map(|f| (f.label.as_str(), f.detail.as_deref())).collect();
    assert_eq!(labels, [("tables", Some("2")), ("views", Some("1")), ("routines", Some("1"))]);

    let tables = s
        .children(&NodeRef::Folder { database: "postgres".into(), schema: Some("public".into()), folder: FolderKind::Tables })
        .await
        .unwrap();
    assert_eq!(tables.iter().map(|t| t.label.as_str()).collect::<Vec<_>>(), ["orders", "users"]);

    let users = ObjectRef {
        database: "postgres".into(),
        schema: Some("public".into()),
        name: "users".into(),
        kind: ObjectKind::Table,
        oid: None,
    };
    let columns = s
        .children(&NodeRef::ObjectFolder { object: users.clone(), folder: ObjectFolderKind::Columns })
        .await
        .unwrap();
    assert_eq!(columns[0].label, "id");
    assert_eq!(columns[0].icon, datowl_domain::NodeIcon::PrimaryKeyColumn);

    let ddl = s.ddl(&users).await.unwrap();
    for fragment in [
        "CREATE TABLE public.users",
        "id         bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL",
        "PRIMARY KEY (id)",
        "UNIQUE (email)",
        "COMMENT ON TABLE public.users IS 'People';",
    ] {
        assert!(ddl.contains(fragment), "missing {fragment:?} in\n{ddl}");
    }
    let orders_ddl = s.ddl(&ObjectRef { name: "orders".into(), ..users.clone() }).await.unwrap();
    assert!(orders_ddl.contains("CREATE INDEX orders_user_idx ON public.orders USING btree (user_id);"), "{orders_ddl}");
    assert!(orders_ddl.contains("FOREIGN KEY (user_id) REFERENCES users(id)"), "{orders_ddl}");

    let view = s
        .ddl(&ObjectRef { name: "big_orders".into(), kind: ObjectKind::View, ..users.clone() })
        .await
        .unwrap();
    assert!(view.starts_with("CREATE OR REPLACE VIEW public.big_orders AS"), "{view}");

    let snapshot = s.completion_schema().await.unwrap();
    assert_eq!(snapshot.default_schema.as_deref(), Some("public"));
    let users_info = snapshot.tables.iter().find(|t| t.name == "users").unwrap();
    assert_eq!(users_info.columns.len(), 4);
}

#[tokio::test]
async fn streams_large_pages_fast() {
    let Some(s) = session().await else { return };
    let started = Instant::now();
    let (outcome, sink) = run(&*s, "select g, md5(g::text), now() from generate_series(1, 200000) g", 200_000).await;
    let elapsed = started.elapsed();
    assert_eq!(outcome.unwrap().rows, 200_000);
    assert_eq!(sink.rows.len(), 200_000);
    println!("200k rows x 3 cols fetched and decoded in {elapsed:?}");
}
