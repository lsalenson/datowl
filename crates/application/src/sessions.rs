//! Live sessions, running executions and the result set each connection keeps open.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, RwLock,
    },
};

use datowl_domain::{CancellationToken, Error, Result, Session};
use uuid::Uuid;

pub(crate) struct SessionRegistry {
    sessions: RwLock<HashMap<Uuid, Arc<dyn Session>>>,
    /// Cancellation handles of running executions, by run id.
    runs: Mutex<HashMap<u64, CancellationToken>>,
    /// Token of the result set each connection keeps open for paging.
    open_results: Mutex<HashMap<Uuid, u64>>,
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

impl SessionRegistry {
    fn next_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    pub fn get(&self, id: Uuid) -> Result<Arc<dyn Session>> {
        self.sessions.read().expect("sessions lock poisoned").get(&id).cloned().ok_or(Error::NotConnected)
    }

    /// Registers a session, returning the one it replaces.
    pub fn insert(&self, id: Uuid, session: Arc<dyn Session>) -> Option<Arc<dyn Session>> {
        self.forget_result(id);
        self.sessions.write().expect("sessions lock poisoned").insert(id, session)
    }

    pub fn remove(&self, id: Uuid) -> Option<Arc<dyn Session>> {
        self.forget_result(id);
        self.sessions.write().expect("sessions lock poisoned").remove(&id)
    }

    /// Cancels every run and forgets every session, returning them to close.
    pub fn reset(&self) -> Vec<Arc<dyn Session>> {
        for (_, token) in self.runs.lock().expect("runs lock poisoned").drain() {
            token.cancel();
        }
        self.open_results.lock().expect("results lock poisoned").clear();
        self.sessions.write().expect("sessions lock poisoned").drain().map(|(_, s)| s).collect()
    }

    pub fn start_run(&self) -> (u64, CancellationToken) {
        let id = self.next_id();
        let token = CancellationToken::new();
        self.runs.lock().expect("runs lock poisoned").insert(id, token.clone());
        (id, token)
    }

    pub fn finish_run(&self, id: u64) {
        self.runs.lock().expect("runs lock poisoned").remove(&id);
    }

    pub fn cancel_run(&self, id: u64) {
        if let Some(token) = self.runs.lock().expect("runs lock poisoned").get(&id) {
            token.cancel();
        }
    }

    pub fn open_result(&self, connection: Uuid) -> u64 {
        let token = self.next_id();
        self.open_results.lock().expect("results lock poisoned").insert(connection, token);
        token
    }

    pub fn is_open_result(&self, connection: Uuid, token: u64) -> bool {
        self.open_results.lock().expect("results lock poisoned").get(&connection) == Some(&token)
    }

    pub fn forget_result(&self, connection: Uuid) {
        self.open_results.lock().expect("results lock poisoned").remove(&connection);
    }
}
