use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

const MAIN_LABEL: &str = "main";

/// Collega alla finestra principale il comportamento che in Electron viveva
/// nell'handler `enter/leave-full-screen`. Va chiamata una sola volta, dal
/// setup dell'app.
pub fn wire_main_window(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else { return };

    // Tauri non espone un evento dedicato di ingresso/uscita fullscreen: lo
    // deduciamo confrontando is_fullscreen() ad ogni Resized (il fullscreen
    // nativo genera comunque un resize) ed emettiamo solo sui cambi di stato,
    // per pilotare l'inset dei semafori macOS come faceva `enter/leave-full-screen`.
    let was_fullscreen = Arc::new(AtomicBool::new(main.is_fullscreen().unwrap_or(false)));
    let window_for_events = main.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            let is_fs = window_for_events.is_fullscreen().unwrap_or(false);
            if was_fullscreen.swap(is_fs, Ordering::SeqCst) != is_fs {
                let _ = window_for_events.emit("dashai:fullscreen", is_fs);
            }
        }
    });
}

/// Stato fullscreen della finestra chiamante al momento della chiamata.
#[tauri::command]
pub fn window_is_fullscreen(window: Window) -> bool {
    window.is_fullscreen().unwrap_or(false)
}
