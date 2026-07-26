use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

/// Cartella dove salvare i file di config (projects.json, settings.json).
///
/// In modalita **portable** i file stanno ACCANTO all'eseguibile, così l'app
/// è autoportante — ma solo in build di release: in dev `current_exe()`
/// punterebbe dentro `target/debug/`, mischiando dati con artefatti di build
/// (equivalente del check `app.isPackaged` della versione Electron).
/// Fallback sulla cartella di config standard del sistema se quella accanto
/// all'eseguibile non è scrivibile.
static CACHED_DIR: OnceLock<PathBuf> = OnceLock::new();

fn is_writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(".dashai-write-test");
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn config_dir(app: &AppHandle) -> PathBuf {
    if let Some(dir) = CACHED_DIR.get() {
        return dir.clone();
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if !cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.to_path_buf());
            }
        }
    }
    let app_config = app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from("."));
    candidates.push(app_config.clone());

    for dir in &candidates {
        if is_writable(dir) {
            let _ = CACHED_DIR.set(dir.clone());
            return dir.clone();
        }
    }

    let _ = std::fs::create_dir_all(&app_config);
    let _ = CACHED_DIR.set(app_config.clone());
    app_config
}
