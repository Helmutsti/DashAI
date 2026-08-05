use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl, Window};
use tauri::webview::WebviewBuilder;

use crate::config_dir::config_dir;

/// Cartella dedicata dove la webview salva i dati persistenti (compresi i
/// cookie di login Spotify): separata dallo storage della webview principale,
/// cosi' il login sopravvive ai riavvii dell'app senza mischiarsi al resto.
fn spotify_data_dir(app: &AppHandle) -> PathBuf {
    config_dir(app).join("spotify-session")
}

#[derive(Default)]
pub struct SpotifyState(Arc<Mutex<HashMap<String, Webview>>>);

#[derive(Deserialize)]
pub struct SpotifyBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Crea la webview nativa del player, sovrapposta al punto della card indicato
/// da `bounds` (coordinate logiche, stesse unita' del DOM). E' una vera
/// navigazione di primo livello verso open.spotify.com, non un iframe: il sito
/// blocca l'incapsulamento (`frame-ancestors`), quindi solo una webview
/// separata puo' mostrare davvero login e player.
///
/// Su Windows, creare una webview figlia da un comando sincrono puo' bloccarsi
/// (problema noto di WebView2): per questo il comando e' `async`.
#[tauri::command]
pub async fn spotify_open(
    app: AppHandle,
    window: Window,
    state: State<'_, SpotifyState>,
    id: String,
    bounds: SpotifyBounds,
) -> Result<(), String> {
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }

    let url = tauri::Url::parse("https://open.spotify.com/").map_err(|e| e.to_string())?;

    // Senza uno user-agent "normale" Spotify non riconosce la webview come un
    // browser desktop vero e serve una versione ridotta della pagina, priva
    // dei controlli interattivi (incluso il pulsante di login).
    let builder = WebviewBuilder::new(format!("spotify-{id}"), WebviewUrl::External(url))
        .data_directory(spotify_data_dir(&app))
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 \
             (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        );

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|e| e.to_string())?;

    state.0.lock().unwrap().insert(id, webview);
    Ok(())
}

/// Riposiziona/ridimensiona la webview quando la card si muove (resize della
/// finestra, riordino, comprimi/espandi...): la webview e' una vista nativa a
/// parte, non segue da sola il layout del DOM.
#[tauri::command]
pub fn spotify_set_bounds(
    state: State<SpotifyState>,
    id: String,
    bounds: SpotifyBounds,
) -> Result<(), String> {
    let sessions = state.0.lock().unwrap();
    if let Some(webview) = sessions.get(&id) {
        webview
            .set_position(LogicalPosition::new(bounds.x, bounds.y))
            .map_err(|e| e.to_string())?;
        webview
            .set_size(LogicalSize::new(bounds.width, bounds.height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn spotify_reload(state: State<SpotifyState>, id: String) -> Result<(), String> {
    let sessions = state.0.lock().unwrap();
    if let Some(webview) = sessions.get(&id) {
        webview.reload().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn spotify_close(state: State<SpotifyState>, id: String) -> Result<(), String> {
    if let Some(webview) = state.0.lock().unwrap().remove(&id) {
        let _ = webview.close();
    }
    Ok(())
}

pub fn dispose_all(app: &AppHandle) {
    let state = app.state::<SpotifyState>();
    let mut sessions = state.0.lock().unwrap();
    for (_, webview) in sessions.drain() {
        let _ = webview.close();
    }
}
