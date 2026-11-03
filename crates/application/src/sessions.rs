//! Live sessions, their execution channels, running executions and the result set each
//! channel keeps open.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, RwLock,
    },
};

use datowl_domain::{CancellationToken, Error, ExecChannel, Result, Session};
use tokio::sync::OnceCell;
use uuid::Uuid;

/// Two runs racing to open the same channel must end up on the same connection.
type ChannelCell = Arc<OnceCell<Arc<dyn ExecChannel>>>;

struct LiveSession {
    session: Arc<dyn Session>,
    channels: HashMap<String, ChannelCell>,
}

struct Run {
    connection: Uuid,
    channel: String,
    token: CancellationToken,
}

pub(crate) struct SessionRegistry {
    sessions: RwLock<HashMap<Uuid, LiveSession>>,
    /// Running executions, by run id.
    runs: Mutex<HashMap<u64, Run>>,
    /// Token of the result set each channel keeps open for paging.
    open_results: Mutex<HashMap<(Uuid, String), u64>>,
    next_id: AtomicU64,
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self {
            sessions: RwLock::default(),
            runs: Mutex::default(),
            open_results: Mutex::default(),
            next_id: AtomicU64::new(1),
        }
    }
}

/// A statement can be stuck on a dead network: closing never makes the caller wait for it.
fn close_in_background(cell: ChannelCell) {
    if let Some(channel) = cell.get().cloned() {
        tokio::spawn(async move { channel.close().await });
    }
}

impl SessionRegistry {
    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    pub fn get(&self, id: Uuid) -> Result<Arc<dyn Session>> {
        self.sessions
            .read()
            .expect("sessions lock poisoned")
            .get(&id)
            .map(|live| live.session.clone())
            .ok_or(Error::NotConnected)
    }

    /// The channel named `name`, opened on first use.
    pub async fn channel(&self, id: Uuid, name: &str) -> Result<Arc<dyn ExecChannel>> {
        let (session, cell) = {
            let mut sessions = self.sessions.write().expect("sessions lock poisoned");
            let live = sessions.get_mut(&id).ok_or(Error::NotConnected)?;
            let cell = live.channels.entry(name.to_owned()).or_default().clone();
            (live.session.clone(), cell)
        };
        cell.get_or_try_init(|| session.open_channel()).await.cloned()
    }

    /// Registers a session, closing the one it replaces.
    pub fn insert(&self, id: Uuid, session: Arc<dyn Session>) {
        self.remove(id);
        let live = LiveSession { session, channels: HashMap::new() };
        self.sessions.write().expect("sessions lock poisoned").insert(id, live);
    }

    /// Cancels what the session is running and closes it.
    pub fn remove(&self, id: Uuid) {
        self.cancel_runs(|run| run.connection == id);
        self.open_results.lock().expect("results lock poisoned").retain(|(connection, _), _| *connection != id);
        let live = self.sessions.write().expect("sessions lock poisoned").remove(&id);
        for cell in live.into_iter().flat_map(|live| live.channels.into_values()) {
            close_in_background(cell);
        }
    }

    /// Cancels what the channel is running and closes it.
    pub fn close_channel(&self, id: Uuid, name: &str) {
        self.cancel_runs(|run| run.connection == id && run.channel == name);
        self.forget_result(id, name);
        let cell = self
            .sessions
            .write()
            .expect("sessions lock poisoned")
            .get_mut(&id)
            .and_then(|live| live.channels.remove(name));
        if let Some(cell) = cell {
            close_in_background(cell);
        }
    }

    /// Cancels every run and closes every session.
    pub fn reset(&self) {
        let ids: Vec<Uuid> = self.sessions.read().expect("sessions lock poisoned").keys().copied().collect();
        for id in ids {
            self.remove(id);
        }
    }

    fn cancel_runs(&self, matches: impl Fn(&Run) -> bool) {
        for run in self.runs.lock().expect("runs lock poisoned").values().filter(|run| matches(run)) {
            run.token.cancel();
        }
    }

    pub fn start_run(&self, connection: Uuid, channel: &str) -> (u64, CancellationToken) {
        let id = self.next_id();
        let token = CancellationToken::new();
        let run = Run { connection, channel: channel.to_owned(), token: token.clone() };
        self.runs.lock().expect("runs lock poisoned").insert(id, run);
        (id, token)
    }

    pub fn finish_run(&self, id: u64) {
        self.runs.lock().expect("runs lock poisoned").remove(&id);
    }

    pub fn cancel_run(&self, id: u64) {
        if let Some(run) = self.runs.lock().expect("runs lock poisoned").get(&id) {
            run.token.cancel();
        }
    }

    pub fn open_result(&self, connection: Uuid, channel: &str) -> u64 {
        let token = self.next_id();
        self.open_results.lock().expect("results lock poisoned").insert((connection, channel.to_owned()), token);
        token
    }

    pub fn is_open_result(&self, connection: Uuid, channel: &str, token: u64) -> bool {
        self.open_results.lock().expect("results lock poisoned").get(&(connection, channel.to_owned())) == Some(&token)
    }

    pub fn forget_result(&self, connection: Uuid, channel: &str) {
        self.open_results.lock().expect("results lock poisoned").remove(&(connection, channel.to_owned()));
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::atomic::AtomicUsize, time::Duration};

    use datowl_domain::{NodeRef, ObjectRef, PageOutcome, ResultSink, Row, SchemaSnapshot, TreeNode};

    use super::*;

    #[derive(Default)]
    struct FakeSession {
        opened: AtomicUsize,
    }

    #[async_trait::async_trait]
    impl Session for FakeSession {
        fn server_version(&self) -> &str {
            "fake"
        }
        async fn open_channel(&self) -> Result<Arc<dyn ExecChannel>> {
            self.opened.fetch_add(1, Ordering::Relaxed);
            tokio::time::sleep(Duration::from_millis(10)).await;
            Ok(Arc::new(FakeChannel))
        }
        async fn children(&self, _: &NodeRef) -> Result<Vec<TreeNode>> {
            Ok(Vec::new())
        }
        async fn ddl(&self, _: &ObjectRef) -> Result<String> {
            Ok(String::new())
        }
        async fn completion_schema(&self) -> Result<SchemaSnapshot> {
            Err(Error::NotConnected)
        }
        async fn side_query(&self, _: &str) -> Result<Vec<Row>> {
            Ok(Vec::new())
        }
    }

    struct FakeChannel;

    #[async_trait::async_trait]
    impl ExecChannel for FakeChannel {
        async fn execute(&self, _: &str, _: usize, _: &CancellationToken, _: &mut dyn ResultSink) -> Result<PageOutcome> {
            Ok(PageOutcome::default())
        }
        async fn fetch_more(&self, _: usize, _: &CancellationToken, _: &mut dyn ResultSink) -> Result<PageOutcome> {
            Err(Error::NoOpenResult)
        }
        async fn close_result(&self) -> Result<()> {
            Ok(())
        }
        // Stands for a statement stuck on a dead network.
        async fn close(&self) {
            std::future::pending::<()>().await
        }
    }

    fn registry() -> (SessionRegistry, Uuid, Arc<FakeSession>) {
        let (registry, id, session) = (SessionRegistry::default(), Uuid::new_v4(), Arc::new(FakeSession::default()));
        registry.insert(id, session.clone());
        (registry, id, session)
    }

    #[tokio::test]
    async fn a_channel_opens_once_even_when_runs_race() {
        let (registry, id, session) = registry();
        let (a, b, other) = tokio::join!(registry.channel(id, "a"), registry.channel(id, "a"), registry.channel(id, "b"));
        assert!(Arc::ptr_eq(&a.unwrap(), &b.unwrap()));
        other.unwrap();
        assert_eq!(session.opened.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn open_results_belong_to_their_channel() {
        let (registry, id, _) = registry();
        let a = registry.open_result(id, "a");
        let b = registry.open_result(id, "b");
        registry.forget_result(id, "b");
        assert!(registry.is_open_result(id, "a", a));
        assert!(!registry.is_open_result(id, "b", b));
    }

    #[tokio::test]
    async fn closing_a_channel_cancels_only_its_runs() {
        let (registry, id, session) = registry();
        registry.channel(id, "a").await.unwrap();
        let (_, a) = registry.start_run(id, "a");
        let (_, b) = registry.start_run(id, "b");
        registry.close_channel(id, "a");
        assert!(a.is_cancelled() && !b.is_cancelled());
        // Used again, it opens a new one.
        registry.channel(id, "a").await.unwrap();
        assert_eq!(session.opened.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn disconnecting_cancels_runs_without_waiting_for_them() {
        let (registry, id, _) = registry();
        registry.channel(id, "a").await.unwrap();
        let (_, run) = registry.start_run(id, "a");
        let (_, elsewhere) = registry.start_run(Uuid::new_v4(), "a");
        registry.remove(id);
        assert!(run.is_cancelled() && !elsewhere.is_cancelled());
        assert!(matches!(registry.channel(id, "a").await, Err(Error::NotConnected)));
    }
}
