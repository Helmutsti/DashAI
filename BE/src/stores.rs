use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::config_dir::config_dir;

fn projects_file(app: &AppHandle) -> std::path::PathBuf {
    config_dir(app).join("projects.json")
}

fn settings_file(app: &AppHandle) -> std::path::PathBuf {
    config_dir(app).join("settings.json")
}

/// Legge e fa il parse di un JSON da disco. None se il file manca o non è
/// leggibile/valido: il renderer usa questo segnale per inizializzare i default.
fn read_json(path: &std::path::Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_json(path: &std::path::Path, data: &Value) -> bool {
    let Ok(pretty) = serde_json::to_string_pretty(data) else {
        return false;
    };
    std::fs::write(path, pretty).is_ok()
}

#[tauri::command]
pub fn projects_load(app: AppHandle) -> Option<Value> {
    read_json(&projects_file(&app))
}

#[tauri::command]
pub fn projects_save(app: AppHandle, data: Value) -> bool {
    write_json(&projects_file(&app), &data)
}

#[tauri::command]
pub fn projects_path(app: AppHandle) -> String {
    projects_file(&app).to_string_lossy().into_owned()
}

// `async`: vedi il commento su dialog_pick_directory in os_integration.rs —
// blocking_save_file/blocking_pick_file deadlockano se eseguiti sul thread main.
#[tauri::command]
pub async fn projects_export(app: AppHandle, data: Value) -> bool {
    let chosen = app
        .dialog()
        .file()
        .set_title("Esporta dati")
        .set_file_name("db.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    let Some(path) = chosen.and_then(|p| p.into_path().ok()) else {
        return false; // annullato dall'utente
    };
    write_json(&path, &data)
}

#[tauri::command]
pub async fn projects_import(app: AppHandle) -> Option<Value> {
    let chosen = app
        .dialog()
        .file()
        .set_title("Importa dati")
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    let path = chosen?.into_path().ok()?;
    match std::fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str(&raw) {
            Ok(v) => Some(v),
            Err(_) => Some(Value::Bool(false)), // JSON non valido
        },
        Err(_) => Some(Value::Bool(false)), // file illeggibile
    }
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Option<Value> {
    read_json(&settings_file(&app))
}

#[tauri::command]
pub fn settings_save(app: AppHandle, data: Value) -> bool {
    write_json(&settings_file(&app), &data)
}

#[tauri::command]
pub fn settings_path(app: AppHandle) -> String {
    settings_file(&app).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn write_then_read_json_round_trips() {
        let path = std::env::temp_dir().join(format!("dashai-store-test-{}.json", std::process::id()));
        let data = json!({ "version": 1, "projects": [{ "id": "p1" }] });

        assert!(write_json(&path, &data));
        assert_eq!(read_json(&path), Some(data));

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn read_json_returns_none_for_missing_file() {
        let path = std::env::temp_dir().join("dashai-store-test-does-not-exist.json");
        assert_eq!(read_json(&path), None);
    }
}
