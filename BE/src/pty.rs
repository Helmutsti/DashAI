use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, Window};

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ShellKey {
    Default,
    Powershell,
    Pwsh,
    Cmd,
    Gitbash,
    Zsh,
    Bash,
    Fish,
    Custom,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOpts {
    id: String,
    cols: u16,
    rows: u16,
    shell: Option<ShellKey>,
    shell_path: Option<String>,
    cwd: Option<String>,
    startup_command: Option<String>,
    close_on_exit: Option<bool>,
}

#[derive(Serialize, Clone)]
struct TermDataPayload {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct TermExitPayload {
    id: String,
    #[serde(rename = "exitCode")]
    exit_code: i32,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default, Clone)]
pub struct PtyState(Arc<Mutex<HashMap<String, Session>>>);

/// Percorsi tipici di Git Bash su Windows (best-effort).
const GIT_BASH_CANDIDATES: [&str; 2] = [
    r"C:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files (x86)\Git\bin\bash.exe",
];

fn home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".into())
}

/// Shell Unix predefinita: $SHELL, poi zsh (default macOS), infine bash.
fn default_unix_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            return shell;
        }
    }
    if Path::new("/bin/zsh").exists() {
        return "/bin/zsh".into();
    }
    "/bin/bash".into()
}

fn resolve_unix_shell(shell: Option<ShellKey>, shell_path: Option<&str>) -> (String, Vec<String>) {
    match shell {
        Some(ShellKey::Zsh) => ("zsh".into(), vec!["-i".into(), "-l".into()]),
        Some(ShellKey::Bash) => ("bash".into(), vec!["-i".into(), "-l".into()]),
        Some(ShellKey::Fish) => ("fish".into(), vec!["-i".into(), "-l".into()]),
        Some(ShellKey::Custom) => (custom_or_default_unix(shell_path), vec!["-i".into(), "-l".into()]),
        _ => (default_unix_shell(), vec![]),
    }
}

fn resolve_unix_shell_run(
    shell: Option<ShellKey>,
    cmd: &str,
    shell_path: Option<&str>,
) -> (String, Vec<String>) {
    match shell {
        Some(ShellKey::Zsh) => ("zsh".into(), vec!["-l".into(), "-c".into(), cmd.into()]),
        Some(ShellKey::Bash) => ("bash".into(), vec!["-l".into(), "-c".into(), cmd.into()]),
        Some(ShellKey::Fish) => ("fish".into(), vec!["-l".into(), "-c".into(), cmd.into()]),
        Some(ShellKey::Custom) => (
            custom_or_default_unix(shell_path),
            vec!["-l".into(), "-c".into(), cmd.into()],
        ),
        _ => (default_unix_shell(), vec!["-l".into(), "-c".into(), cmd.into()]),
    }
}

fn custom_or_default_unix(shell_path: Option<&str>) -> String {
    shell_path
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(default_unix_shell)
}

fn custom_or_default_windows(shell_path: Option<&str>) -> String {
    shell_path
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "powershell.exe".into())
}

fn gitbash_path() -> String {
    GIT_BASH_CANDIDATES
        .iter()
        .find(|p| Path::new(p).exists())
        .map(|p| p.to_string())
        .unwrap_or_else(|| "bash.exe".into())
}

/// Risolve la coppia eseguibile/argomenti per la shell scelta.
fn resolve_shell(shell: Option<ShellKey>, shell_path: Option<&str>) -> (String, Vec<String>) {
    if !cfg!(windows) {
        return resolve_unix_shell(shell, shell_path);
    }
    match shell {
        Some(ShellKey::Pwsh) => ("pwsh.exe".into(), vec![]),
        Some(ShellKey::Cmd) => ("cmd.exe".into(), vec![]),
        Some(ShellKey::Gitbash) => (gitbash_path(), vec!["-i".into(), "-l".into()]),
        Some(ShellKey::Custom) => (custom_or_default_windows(shell_path), vec![]),
        _ => ("powershell.exe".into(), vec![]),
    }
}

/// Come resolve_shell, ma per eseguire un comando e uscire al suo termine.
fn resolve_shell_run(
    shell: Option<ShellKey>,
    cmd: &str,
    shell_path: Option<&str>,
) -> (String, Vec<String>) {
    if !cfg!(windows) {
        return resolve_unix_shell_run(shell, cmd, shell_path);
    }
    match shell {
        Some(ShellKey::Pwsh) => (
            "pwsh.exe".into(),
            vec!["-NoLogo".into(), "-NoProfile".into(), "-Command".into(), cmd.into()],
        ),
        Some(ShellKey::Cmd) => ("cmd.exe".into(), vec!["/C".into(), cmd.into()]),
        Some(ShellKey::Gitbash) => (gitbash_path(), vec!["-lc".into(), cmd.into()]),
        Some(ShellKey::Custom) => (
            custom_or_default_windows(shell_path),
            vec!["-NoLogo".into(), "-NoProfile".into(), "-Command".into(), cmd.into()],
        ),
        _ => (
            "powershell.exe".into(),
            vec!["-NoLogo".into(), "-NoProfile".into(), "-Command".into(), cmd.into()],
        ),
    }
}

/// Directory di partenza valida (fallback a home se mancante/inesistente).
fn resolve_cwd(cwd: Option<&str>) -> String {
    if let Some(c) = cwd {
        let trimmed = c.trim();
        if !trimmed.is_empty() && Path::new(trimmed).is_dir() {
            return trimmed.to_string();
        }
    }
    home_dir()
}

fn emit_error(app: &AppHandle, window_label: &str, id: &str, file: &str, msg: &str) {
    let data = format!("\r\n\x1b[38;5;203mImpossibile avviare \"{file}\": {msg}\x1b[0m\r\n");
    let _ = app.emit_to(window_label, "term:data", TermDataPayload { id: id.into(), data });
}

fn create_session(app: AppHandle, window_label: String, state: State<PtyState>, opts: CreateOpts) {
    {
        let sessions = state.0.lock().unwrap();
        if sessions.contains_key(&opts.id) {
            return;
        }
    }

    let cmd = opts.startup_command.as_deref().unwrap_or("").trim().to_string();
    let run_exit = opts.close_on_exit.unwrap_or(false) && !cmd.is_empty();
    let (file, args) = if run_exit {
        resolve_shell_run(opts.shell, &cmd, opts.shell_path.as_deref())
    } else {
        resolve_shell(opts.shell, opts.shell_path.as_deref())
    };
    let cwd = resolve_cwd(opts.cwd.as_deref());

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: if opts.rows > 0 { opts.rows } else { 24 },
        cols: if opts.cols > 0 { opts.cols } else { 80 },
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = match pty_system.openpty(size) {
        Ok(p) => p,
        Err(e) => {
            emit_error(&app, &window_label, &opts.id, &file, &e.to_string());
            return;
        }
    };

    let mut builder = CommandBuilder::new(&file);
    builder.args(&args);
    builder.cwd(&cwd);
    // Le app GUI (lanciate da Finder/Launchd) non ereditano TERM da una shell
    // di login: senza, la shell non sa mappare i tasti speciali (Canc, frecce,
    // ecc.) e ne stampa la sequenza di escape come testo letterale invece di
    // interpretarla. Dichiariamo il "dialetto" che xterm.js emula davvero.
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");

    let mut child = match pair.slave.spawn_command(builder) {
        Ok(c) => c,
        Err(e) => {
            emit_error(&app, &window_label, &opts.id, &file, &e.to_string());
            return;
        }
    };
    // Sul lato slave non serve più nulla dopo lo spawn: tenerlo aperto su Unix
    // impedisce la corretta rilevazione di EOF/hangup quando il processo esce.
    drop(pair.slave);

    let killer = child.clone_killer();
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            emit_error(&app, &window_label, &opts.id, &file, &e.to_string());
            return;
        }
    };
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            emit_error(&app, &window_label, &opts.id, &file, &e.to_string());
            return;
        }
    };

    let session = Session { master: pair.master, writer, killer };
    state.0.lock().unwrap().insert(opts.id.clone(), session);

    // Thread di lettura: inoltra l'output della pty verso la finestra che ha
    // creato la sessione.
    {
        let app = app.clone();
        let id = opts.id.clone();
        let label = window_label.clone();
        let mut reader = reader;
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app.emit_to(&label, "term:data", TermDataPayload { id: id.clone(), data });
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Thread di attesa: rileva l'uscita del processo, pulisce la sessione e
    // notifica la finestra.
    {
        let app = app.clone();
        let id = opts.id.clone();
        let sessions = state.0.clone();
        let label = window_label.clone();
        thread::spawn(move || {
            let exit_code = child.wait().map(|s| s.exit_code() as i32).unwrap_or(-1);
            sessions.lock().unwrap().remove(&id);
            let _ = app.emit_to(&label, "term:exit", TermExitPayload { id: id.clone(), exit_code });
        });
    }

    // In modalità interattiva il comando d'avvio viene "digitato" al prompt
    // dopo un breve ritardo. In modalità esegui-ed-esci è già negli argomenti.
    if !run_exit && !cmd.is_empty() {
        let sessions = state.0.clone();
        let id = opts.id.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(600));
            if let Some(s) = sessions.lock().unwrap().get_mut(&id) {
                let _ = s.writer.write_all(format!("{cmd}\r").as_bytes());
            }
        });
    }
}

fn dispose_session(state: &State<PtyState>, id: &str) {
    if let Some(mut s) = state.0.lock().unwrap().remove(id) {
        let _ = s.killer.kill();
    }
}

#[tauri::command]
pub fn term_create(app: AppHandle, window: Window, state: State<PtyState>, opts: CreateOpts) -> bool {
    create_session(app, window.label().to_string(), state, opts);
    true
}

#[tauri::command]
pub fn term_input(state: State<PtyState>, id: String, data: String) {
    if let Some(s) = state.0.lock().unwrap().get_mut(&id) {
        let _ = s.writer.write_all(data.as_bytes());
    }
}

#[tauri::command]
pub fn term_resize(state: State<PtyState>, id: String, cols: u16, rows: u16) {
    if cols == 0 || rows == 0 {
        return;
    }
    if let Some(s) = state.0.lock().unwrap().get(&id) {
        let _ = s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
    }
}

#[tauri::command]
pub fn term_dispose(state: State<PtyState>, id: String) {
    dispose_session(&state, &id);
}

/// Termina tutte le shell attive (chiamata alla chiusura dell'app).
pub fn dispose_all(app: &AppHandle) {
    let state = app.state::<PtyState>();
    let mut sessions = state.0.lock().unwrap();
    for (_, mut s) in sessions.drain() {
        let _ = s.killer.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Verifica end-to-end la parte a rischio della migrazione: che
    // portable-pty spawni davvero una shell tramite resolve_shell_run e ne
    // legga l'output, esattamente come farà create_session a runtime.
    #[test]
    fn spawns_shell_and_captures_command_output() {
        let (file, args) = resolve_shell_run(None, "echo dashai-tauri-test", None);
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .expect("openpty");

        let mut builder = CommandBuilder::new(&file);
        builder.args(&args);
        builder.cwd(resolve_cwd(None));

        let mut child = pair.slave.spawn_command(builder).expect("spawn");
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().expect("reader");

        let mut output = String::new();
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    output.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if output.contains("dashai-tauri-test") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = child.wait();

        assert!(output.contains("dashai-tauri-test"), "output was: {output:?}");
    }

    #[test]
    fn resolve_cwd_falls_back_to_home_for_invalid_path() {
        assert_eq!(resolve_cwd(Some("/definitely/not/a/real/path/xyz")), home_dir());
    }

    #[test]
    fn resolve_shell_picks_git_bash_candidate_only_on_windows() {
        // su macOS/Linux deve sempre risolvere via il ramo Unix, mai gitbash.exe
        let (file, args) = resolve_shell(Some(ShellKey::Gitbash), None);
        if cfg!(windows) {
            assert!(file.to_lowercase().contains("bash"));
        } else {
            assert_eq!(file, default_unix_shell());
            assert!(args.is_empty());
        }
    }
}
