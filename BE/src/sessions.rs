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

//!
//! Le sessioni possono pesare decine di MB e vengono interrogate spesso: ogni
//! file si legge una volta sola e poi, se cresce, solo nella parte aggiunta
//! (gli agenti scrivono in coda). Lo stato letto resta in una cache in memoria.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
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

/// Dimensione e data di modifica: se non cambiano, il file è come l'ultima volta.
#[derive(Clone, Copy, PartialEq, Eq)]
struct Stamp {
    len: u64,
    mtime: u64,
}

fn stamp(p: &Path) -> Option<Stamp> {
    let m = fs::metadata(p).ok()?;
    let mtime = m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
    Some(Stamp { len: m.len(), mtime })
}

/// Quanto si sa di una sessione Claude letta fino al byte `offset`.
#[derive(Default)]
struct ClaudeState {
    stamp: Option<Stamp>,
    offset: u64,
    summary: Option<String>,
    ai_title: Option<String>,
    custom_title: Option<String>,
    first_user: Option<String>,
    messages: u32,
}

impl ClaudeState {
    fn take_line(&mut self, line: &str) {
        let Ok(v) = serde_json::from_str::<Value>(line) else { return };
        match v.get("type").and_then(Value::as_str) {
            // Nome generato da Claude Code; si aggiorna nel tempo: vale l'ultimo.
            Some("ai-title") => {
                if let Some(s) = v.get("aiTitle").and_then(Value::as_str) {
                    self.ai_title = clean_title(s).or(self.ai_title.take());
                }
            }
            // Nome dato a mano dall'utente (/rename).
            Some("custom-title") => {
                if let Some(s) = v.get("customTitle").or_else(|| v.get("title")).and_then(Value::as_str) {
                    self.custom_title = clean_title(s).or(self.custom_title.take());
                }
            }
            Some("summary") => {
                if let Some(s) = v.get("summary").and_then(Value::as_str) {
                    self.summary = clean_title(s);
                }
            }
            Some("user") => {
                let meta = v.get("isMeta").and_then(Value::as_bool).unwrap_or(false);
                let text = v.get("message").and_then(|m| m.get("content")).and_then(message_text);
                if let Some(t) = text.filter(|_| !meta) {
                    self.messages += 1;
                    if self.first_user.is_none() {
                        self.first_user = clean_title(&t);
                    }
                }
            }
            Some("assistant") => self.messages += 1,
            _ => {}
        }
    }

    /// Porta lo stato in pari col file: niente se è invariato, solo la parte
    /// nuova se è cresciuto, tutto da capo se è stato riscritto più corto.
    fn refresh(&mut self, path: &Path) {
        let Some(now) = stamp(path) else { return };
        if self.stamp == Some(now) {
            return;
        }
        if now.len < self.offset {
            *self = ClaudeState::default();
        }
        let Ok(mut file) = File::open(path) else { return };
        if file.seek(SeekFrom::Start(self.offset)).is_err() {
            return;
        }
        let mut reader = BufReader::new(file);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                // Riga ancora a metà (l'agente la sta scrivendo): si riprende da qui.
                Ok(_) if buf.last() != Some(&b'\n') => break,
                Ok(n) => {
                    self.offset += n as u64;
                    self.take_line(&String::from_utf8_lossy(&buf));
                }
            }
        }
        self.stamp = Some(now);
    }

    fn title(&self) -> Option<String> {
        self.custom_title
            .clone()
            .or_else(|| self.ai_title.clone())
            .or_else(|| self.summary.clone())
            .or_else(|| self.first_user.clone())
    }
}

/// Per una sessione Codex basta la prima parte del file: chi è, in che
/// cartella, e il primo messaggio come nome di riserva.
#[derive(Clone)]
struct CodexInfo {
    id: String,
    dir: String,
    first_user: Option<String>,
}

#[derive(Default)]
struct Cache {
    claude: HashMap<PathBuf, ClaudeState>,
    codex: HashMap<PathBuf, (Stamp, Option<CodexInfo>)>,
    codex_names: Option<(Stamp, HashMap<String, String>)>,
}

fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
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

    let mut cache = cache().lock().unwrap();
    let mut out = vec![];
    for path in files {
        let state = cache.claude.entry(path.clone()).or_default();
        state.refresh(&path);
        let Some(title) = state.title() else { continue };
        let id = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let updated = state.stamp.map(|s| s.mtime).unwrap_or(0);
        out.push(AgentSession { agent: "claude", id, title, updated, messages: Some(state.messages) });
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
fn read_codex_names(path: &Path) -> HashMap<String, String> {
    let mut names = HashMap::new();
    let Ok(file) = File::open(path) else { return names };
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

/// Legge l'inizio di una sessione Codex: id, cartella e primo messaggio.
fn read_codex_info(path: &Path) -> Option<CodexInfo> {
    let file = File::open(path).ok()?;
    let mut lines = BufReader::new(file).lines().map_while(Result::ok);
    let meta = serde_json::from_str::<Value>(&lines.next()?).ok()?;
    let payload = meta.get("payload").unwrap_or(&meta);
    let id = payload.get("id").and_then(Value::as_str)?.to_string();
    let dir = payload.get("cwd").and_then(Value::as_str)?.to_string();
    let mut first_user = None;
    for line in lines.take(400) {
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
            first_user = Some(t);
            break;
        }
    }
    Some(CodexInfo { id, dir, first_user })
}

fn codex_sessions(home: &Path, cwd: &str) -> Vec<AgentSession> {
    let mut files = vec![];
    collect_jsonl(&home.join(".codex").join("sessions"), &mut files, 4);
    let mut files: Vec<(PathBuf, Stamp)> = files.into_iter().filter_map(|p| stamp(&p).map(|s| (p, s))).collect();
    files.sort_by_key(|(_, s)| std::cmp::Reverse(s.mtime));
    files.truncate(MAX_CODEX_SCAN);
    let want = normalize(cwd);

    let mut cache = cache().lock().unwrap();
    let index = home.join(".codex").join("session_index.jsonl");
    match (stamp(&index), &cache.codex_names) {
        (Some(now), Some((old, _))) if *old == now => {}
        (Some(now), _) => cache.codex_names = Some((now, read_codex_names(&index))),
        (None, _) => cache.codex_names = None,
    }

    let mut out = vec![];
    for (path, now) in files {
        // Si rilegge l'inizio solo se il file è cambiato e non se ne sa ancora
        // tutto (il primo messaggio può arrivare dopo l'apertura).
        let fresh = match cache.codex.get(&path) {
            Some((old, _)) if *old == now => false,
            Some((_, Some(info))) if info.first_user.is_some() => false,
            _ => true,
        };
        if fresh {
            cache.codex.insert(path.clone(), (now, read_codex_info(&path)));
        }
        let Some((_, Some(info))) = cache.codex.get(&path) else { continue };
        if normalize(&info.dir) != want {
            continue;
        }
        let named = cache.codex_names.as_ref().and_then(|(_, n)| n.get(&info.id).cloned());
        let Some(title) = named.or_else(|| info.first_user.clone()) else { continue };
        out.push(AgentSession { agent: "codex", id: info.id.clone(), title, updated: now.mtime, messages: None });
    }
    out
}

/// Sessioni passate di Claude Code e Codex per la cartella `cwd`, dalla più recente.
///
/// Asincrono di proposito: i comandi sincroni girano sul thread della finestra
/// e una lettura lunga bloccherebbe l'interfaccia (e la digitazione).
#[tauri::command]
pub async fn agent_sessions(cwd: String) -> Vec<AgentSession> {
    tauri::async_runtime::spawn_blocking(move || collect_sessions(cwd)).await.unwrap_or_default()
}

fn collect_sessions(cwd: String) -> Vec<AgentSession> {
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
        let t = std::time::Instant::now();
        let first = collect_sessions(cwd.clone());
        let cold = t.elapsed();
        let t = std::time::Instant::now();
        let _ = collect_sessions(cwd);
        println!("prima lettura {cold:?}, seconda {:?}", t.elapsed());
        for s in first.iter().take(5) {
            println!("{} | {} | {}", s.agent, s.id, s.title);
        }
    }

    #[test]
    fn claude_state_reads_only_appended_lines() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("dashai-sessions-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");
        let user = r#"{"type":"user","message":{"content":"Primo messaggio"}}"#;
        fs::write(&path, format!("{user}\n")).unwrap();

        let mut st = ClaudeState::default();
        st.refresh(&path);
        assert_eq!((st.messages, st.title()), (1, Some("Primo messaggio".into())));

        // riga a metà: non va contata finché non è completa
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        write!(f, r#"{{"type":"assistant"#).unwrap();
        st.refresh(&path);
        assert_eq!(st.messages, 1);
        writeln!(f, r#""}}"#).unwrap();
        writeln!(f, r#"{{"type":"ai-title","aiTitle":"Titolo vero"}}"#).unwrap();
        drop(f);
        st.refresh(&path);
        assert_eq!((st.messages, st.title()), (2, Some("Titolo vero".into())));

        // file riscritto più corto: si riparte da capo
        fs::write(&path, format!("{user}\n")).unwrap();
        st.refresh(&path);
        assert_eq!((st.messages, st.title()), (1, Some("Primo messaggio".into())));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn titles_skip_markup_and_get_trimmed() {
        assert_eq!(clean_title("<command-name>/clear</command-name>"), None);
        assert_eq!(clean_title("  Rifai   il login\ncon OAuth "), Some("Rifai il login con OAuth".into()));
    }
}
