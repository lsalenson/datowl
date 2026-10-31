// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Every streamed cell is its own small String: mimalloc cuts the fetch path's CPU by about a third
// compared with the macOS system allocator.
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() {
    datowl_desktop::run()
}
