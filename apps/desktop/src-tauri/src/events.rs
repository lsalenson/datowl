use datowl_application::{RunEvent, RunEvents};
use tauri::ipc::Channel;

/// Sends a run's events over the IPC channel the editor passed to the command.
pub struct ChannelEvents(pub Channel<RunEvent>);

impl RunEvents for ChannelEvents {
    fn send(&self, event: RunEvent) {
        let _ = self.0.send(event);
    }
}
