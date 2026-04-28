#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{create_dir_all, OpenOptions},
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const LOG_FILE_NAME: &str = "cuebert.log";

fn fallback_log_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Logs")
                .join("Cuebert");
        }
    }

    std::env::temp_dir().join("Cuebert")
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn append_log_line(log_dir: PathBuf, line: &str) -> Result<(), String> {
    create_dir_all(&log_dir).map_err(|error| format!("failed to create log directory: {error}"))?;

    let log_path = log_dir.join(LOG_FILE_NAME);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("failed to open log file {}: {error}", log_path.display()))?;

    writeln!(file, "{line}").map_err(|error| format!("failed to write log file: {error}"))
}

#[tauri::command]
fn append_log(entry: serde_json::Value) -> Result<(), String> {
    let log_dir = fallback_log_dir();
    let line = serde_json::json!({
      "timestamp_ms": now_millis(),
      "entry": entry,
    });

    append_log_line(log_dir, &line.to_string())
}

#[tauri::command]
fn find_matching_media(transcript_path: String) -> Result<Option<String>, String> {
    let transcript_path = PathBuf::from(transcript_path);
    let directory = match transcript_path.parent() {
        Some(directory) => directory,
        None => return Ok(None),
    };
    let stem = match transcript_path.file_stem().and_then(|stem| stem.to_str()) {
        Some(stem) => stem,
        None => return Ok(None),
    };

    const MEDIA_EXTENSIONS: &[&str] = &[
        "mp4", "m4v", "mov", "webm", "mkv", "avi", "mp3", "m4a", "aac", "wav", "aiff", "flac",
        "ogg",
    ];

    for extension in MEDIA_EXTENSIONS {
        let candidate = directory.join(format!("{stem}.{extension}"));
        if candidate.is_file() {
            return Ok(Some(candidate.to_string_lossy().to_string()));
        }

        let uppercase_candidate = directory.join(format!("{stem}.{}", extension.to_uppercase()));
        if uppercase_candidate.is_file() {
            return Ok(Some(uppercase_candidate.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

fn main() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".to_string());

        let message = if let Some(message) = panic_info.payload().downcast_ref::<&str>() {
            (*message).to_string()
        } else if let Some(message) = panic_info.payload().downcast_ref::<String>() {
            message.clone()
        } else {
            "non-string panic payload".to_string()
        };

        let line = serde_json::json!({
          "timestamp_ms": now_millis(),
          "entry": {
            "level": "panic",
            "source": "rust",
            "message": message,
            "location": location,
          },
        });

        let _ = append_log_line(fallback_log_dir(), &line.to_string());
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![append_log, find_matching_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
