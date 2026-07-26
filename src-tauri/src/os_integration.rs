use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Apre il selettore cartella nativo. None se annullato.
///
/// Deve essere `async`: i comandi Tauri non-async girano sul thread main, ma
/// `blocking_*` blocca il thread chiamante in attesa che il pannello nativo
/// (che su macOS deve girare anch'esso sul thread main) risponda — se il
/// chiamante è il thread main si crea un deadlock che si manifesta come UI
/// bloccata non appena si seleziona una cartella nel pannello.
#[tauri::command]
pub async fn dialog_pick_directory(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Apre il selettore file nativo (es. eseguibile di una shell custom). None se annullato.
#[tauri::command]
pub async fn dialog_pick_file(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// Apre `path` (o la home utente se vuoto) nel Finder/Esplora risorse.
#[tauri::command]
pub fn shell_open_path(app: AppHandle, path: String) -> bool {
    let target = if path.trim().is_empty() {
        dirs::home_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or(path)
    } else {
        path
    };
    app.opener().open_path(target, None::<&str>).is_ok()
}
