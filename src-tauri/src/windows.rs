use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::webview::Color;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

const MAIN_LABEL: &str = "main";

fn detached_label(id: &str) -> String {
    format!("detached-{id}")
}

/// Collega alla finestra principale il comportamento che in Electron viveva
/// negli handler `enter/leave-full-screen` e `closed`. Va chiamata una sola
/// volta, dal setup dell'app.
pub fn wire_main_window(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else { return };

    // Tauri non espone un evento dedicato di ingresso/uscita fullscreen: lo
    // deduciamo confrontando is_fullscreen() ad ogni Resized (il fullscreen
    // nativo genera comunque un resize) ed emettiamo solo sui cambi di stato,
    // per pilotare l'inset dei semafori macOS come faceva `enter/leave-full-screen`.
    let was_fullscreen = Arc::new(AtomicBool::new(main.is_fullscreen().unwrap_or(false)));
    let app_for_events = app.clone();
    let window_for_events = main.clone();
    main.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            let is_fs = window_for_events.is_fullscreen().unwrap_or(false);
            if was_fullscreen.swap(is_fs, Ordering::SeqCst) != is_fs {
                let _ = window_for_events.emit("dashai:fullscreen", is_fs);
            }
        }
        WindowEvent::Destroyed => {
            // Chiudi eventuali finestre estratte rimaste aperte.
            for (label, w) in app_for_events.webview_windows() {
                if label != MAIN_LABEL {
                    let _ = w.close();
                }
            }
        }
        _ => {}
    });
}

/// Apre la card `id` in una finestra separata (idempotente: se esiste già la
/// mette a fuoco invece di duplicarla).
#[tauri::command]
pub fn terminal_detach_open(app: AppHandle, id: String, title: String, color: String) -> bool {
    let label = detached_label(&id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return true;
    }

    let query = format!(
        "term={}&title={}&color={}",
        urlencoding::encode(&id),
        urlencoding::encode(&title),
        urlencoding::encode(&color)
    );
    let url = WebviewUrl::App(format!("index.html?{query}").into());

    let win = match WebviewWindowBuilder::new(&app, &label, url)
        .title(format!("{title} — DashAI"))
        .inner_size(720.0, 520.0)
        .min_inner_size(360.0, 240.0)
        .background_color(Color(0x19, 0x19, 0x19, 0xff))
        .visible(false)
        .build()
    {
        Ok(w) => w,
        Err(_) => return false,
    };

    let win_show = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            // Riaggancio: avvisa la finestra principale di riprendere l'output.
            let _ = win_show.app_handle().emit_to(MAIN_LABEL, "dashai:redock", serde_json::json!({ "id": id }));
        }
    });
    let _ = win.show();

    true
}

/// Chiude la finestra separata della card `id`, se esiste.
#[tauri::command]
pub fn terminal_detach_close(app: AppHandle, id: String) -> bool {
    if let Some(w) = app.get_webview_window(&detached_label(&id)) {
        let _ = w.close();
    }
    true
}

/// Stato fullscreen della finestra chiamante al momento della chiamata.
#[tauri::command]
pub fn window_is_fullscreen(window: Window) -> bool {
    window.is_fullscreen().unwrap_or(false)
}
