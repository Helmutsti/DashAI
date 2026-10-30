//! Sessioni passate degli agenti (Claude Code, Codex) per una cartella.
//!
//! Non le salva DashAI: sono gli agenti stessi a tenerle su disco.
//! - Claude Code: `~/.claude/projects/<cartella codificata>/<id>.jsonl`, dove la
//!   cartella codificata è il percorso con ogni carattere non alfanumerico
//!   sostituito da `-`.
//! - Codex: `~/.codex/sessions/AAAA/MM/GG/rollout-*.jsonl`; la prima riga
//!   (`session_meta`) dice id e cartella di lavoro.
//!
//! Il nome è quello ufficiale dell'agente: per Claude Code la voce `ai-title`
//! (o `custom-title` se rinominata) dentro la sessione; per Codex il
//! `thread_name` in `~/.codex/session_index.jsonl`. In mancanza si usa il
//! primo messaggio.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Quante sessioni Claude leggere al massimo (le più recenti).
const MAX_CLAUDE: usize = 60;
/// Quanti file Codex esaminare al massimo (i più recenti, di tutte le cartelle).
const MAX_CODEX_SCAN: usize = 400;
/// Lunghezza massima del nome mostrato.
const TITLE_MAX: usize = 90;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    agent: &'static str,
    id: String,
    title: String,
    /// ultima modifica, millisecondi dall'epoca
    updated: u64,
    /// messaggi scambiati, quando si possono contare
    messages: Option<u32>,
}

fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn clean_title(s: &str) -> Option<String> {
    let line = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.is_empty() || line.starts_with('<') {
        return None;
    }
    let mut out: String = line.chars().take(TITLE_MAX).collect();
    if line.chars().count() > TITLE_MAX {
        out.push('…');
    }
    Some(out)
}

/// Testo di un messaggio: stringa semplice o elenco di blocchi `{type, text}`.
fn message_text(content: &Value) -> Option<String> {
    match content {
        Value::String(s) => Some(s.clone()),
        Value::Array(items) => items
            .iter()
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .next()
            .map(str::to_string),
        _ => None,
    }
}

fn normalize(p: &str) -> String {
    let s = p.trim_end_matches(['/', '\\']).replace('\\', "/");
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

fn claude_dir_name(cwd: &str) -> String {
    cwd.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

fn claude_sessions(home: &Path, cwd: &str) -> Vec<AgentSession> {
    let dir = home.join(".claude").join("projects").join(claude_dir_name(cwd));
    let mut files: Vec<PathBuf> = match fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().is_some_and(|e| e == "jsonl"))
            .collect(),
        Err(_) => return vec![],
    };
    files.sort_by_key(|p| std::cmp::Reverse(mtime_ms(p)));
    files.truncate(MAX_CLAUDE);

    let mut out = vec![];
    for path in files {
        let Ok(file) = File::open(&path) else { continue };
        let mut summary: Option<String> = None;
        let mut ai_title: Option<String> = None;
        let mut custom_title: Option<String> = None;
        let mut first_user: Option<String> = None;
        let mut messages = 0u32;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            match v.get("type").and_then(Value::as_str) {
                // Nome generato da Claude Code; si aggiorna nel tempo: vale l'ultimo.
                Some("ai-title") => {
                    if let Some(s) = v.get("aiTitle").and_then(Value::as_str) {
                        ai_title = clean_title(s).or(ai_title);
                    }
                }
                // Nome dato a mano dall'utente (/rename).
                Some("custom-title") => {
                    if let Some(s) = v.get("customTitle").or_else(|| v.get("title")).and_then(Value::as_str) {
                        custom_title = clean_title(s).or(custom_title);
                    }
                }
                Some("summary") => {
                    if let Some(s) = v.get("summary").and_then(Value::as_str) {
                        summary = clean_title(s);
                    }
                }
                Some("user") => {
                    let meta = v.get("isMeta").and_then(Value::as_bool).unwrap_or(false);
                    let text = v.get("message").and_then(|m| m.get("content")).and_then(message_text);
                    if let Some(t) = text.filter(|_| !meta) {
                        messages += 1;
                        if first_user.is_none() {
                            first_user = clean_title(&t);
                        }
                    }
                }
                Some("assistant") => messages += 1,
                _ => {}
            }
        }
        let Some(title) = custom_title.or(ai_title).or(summary).or(first_user) else { continue };
        let id = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        out.push(AgentSession { agent: "claude", id, title, updated: mtime_ms(&path), messages: Some(messages) });
    }
    out
}

fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>, depth: u8) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() && depth > 0 {
            collect_jsonl(&p, out, depth - 1);
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            out.push(p);
        }
    }
}

/// Nomi delle conversazioni Codex (`thread_name`) per id; vale l'ultima riga.
fn codex_names(home: &Path) -> HashMap<String, String> {
    let mut names = HashMap::new();
    let Ok(file) = File::open(home.join(".codex").join("session_index.jsonl")) else { return names };
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if let (Some(id), Some(name)) = (
            v.get("id").and_then(Value::as_str),
            v.get("thread_name").and_then(Value::as_str).and_then(clean_title),
        ) {
            names.insert(id.to_string(), name);
        }
    }
    names
}

fn codex_sessions(home: &Path, cwd: &str) -> Vec<AgentSession> {
    let names = codex_names(home);
    let mut files = vec![];
    collect_jsonl(&home.join(".codex").join("sessions"), &mut files, 4);
    files.sort_by_key(|p| std::cmp::Reverse(mtime_ms(p)));
    files.truncate(MAX_CODEX_SCAN);
    let want = normalize(cwd);

    let mut out = vec![];
    for path in files {
        let Ok(file) = File::open(&path) else { continue };
        let mut lines = BufReader::new(file).lines().map_while(Result::ok);
        let Some(first) = lines.next() else { continue };
        let Ok(meta) = serde_json::from_str::<Value>(&first) else { continue };
        let payload = meta.get("payload").unwrap_or(&meta);
        let (Some(id), Some(dir)) = (
            payload.get("id").and_then(Value::as_str),
            payload.get("cwd").and_then(Value::as_str),
        ) else {
            continue;
        };
        if normalize(dir) != want {
            continue;
        }
        let mut title = names.get(id).cloned();
        for line in lines.take(if title.is_some() { 0 } else { 400 }) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            let p = v.get("payload").unwrap_or(&v);
            let text = match p.get("type").and_then(Value::as_str) {
                Some("user_message") => p.get("message").and_then(Value::as_str).map(str::to_string),
                Some("message") if p.get("role").and_then(Value::as_str) == Some("user") => {
                    p.get("content").and_then(message_text)
                }
                _ => None,
            };
            if let Some(t) = text.and_then(|t| clean_title(&t)) {
                title = Some(t);
                break;
            }
        }
        let Some(title) = title else { continue };
        out.push(AgentSession { agent: "codex", id: id.to_string(), title, updated: mtime_ms(&path), messages: None });
    }
    out
}

/// Sessioni passate di Claude Code e Codex per la cartella `cwd`, dalla più recente.
#[tauri::command]
pub fn agent_sessions(cwd: String) -> Vec<AgentSession> {
    let Some(home) = dirs::home_dir() else { return vec![] };
    // Chat senza progetto: partono dalla cartella utente, come la shell.
    let cwd = if cwd.trim().is_empty() { home.to_string_lossy().into_owned() } else { cwd };
    let mut all = claude_sessions(&home, &cwd);
    all.extend(codex_sessions(&home, &cwd));
    all.sort_by_key(|s| std::cmp::Reverse(s.updated));
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_claude_project_dir_like_claude_code() {
        assert_eq!(claude_dir_name(r"C:\Users\me\My.App"), "C--Users-me-My-App");
        assert_eq!(claude_dir_name("/home/me/app"), "-home-me-app");
    }

    /// Prova sui dati veri della macchina: `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn lists_real_sessions() {
        let cwd = std::env::var("DASHAI_TEST_CWD").unwrap_or_default();
        for s in agent_sessions(cwd).iter().take(5) {
            println!("{} | {} | {}", s.agent, s.id, s.title);
        }
    }

    #[test]
    fn titles_skip_markup_and_get_trimmed() {
        assert_eq!(clean_title("<command-name>/clear</command-name>"), None);
        assert_eq!(clean_title("  Rifai   il login\ncon OAuth "), Some("Rifai il login con OAuth".into()));
    }
}
