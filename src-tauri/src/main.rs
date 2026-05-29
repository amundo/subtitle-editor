#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{create_dir_all, write, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem, HELP_SUBMENU_ID},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

const LOG_FILE_NAME: &str = "cuebert.log";
const TRANSCRIPTION_SETUP_GUIDE_MENU_ID: &str = "transcription_setup_guide";
const TRANSCRIPTION_SETUP_GUIDE_WINDOW_LABEL: &str = "transcription-setup-guide";

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

fn is_cuebert_json_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|file_name| file_name.to_str())
        .map(|file_name| file_name.to_lowercase().ends_with(".cuebert.json"))
        .unwrap_or(false)
}

fn is_vtt_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("vtt"))
        .unwrap_or(false)
}

#[tauri::command]
fn write_transcript_autosave(
    source_path: String,
    target_path: String,
    contents: String,
) -> Result<(), String> {
    let source_path = PathBuf::from(source_path);
    let target_path = PathBuf::from(target_path);

    if !source_path.is_file() {
        return Err(format!(
            "source transcript does not exist: {}",
            source_path.display()
        ));
    }

    let source_dir = source_path
        .parent()
        .ok_or_else(|| "source transcript has no parent directory".to_string())?;
    let target_dir = target_path
        .parent()
        .ok_or_else(|| "autosave target has no parent directory".to_string())?;

    if source_dir != target_dir {
        return Err(format!(
            "autosave target must be in the same directory as the source transcript: {}",
            target_path.display()
        ));
    }

    if target_path == source_path {
        if !is_cuebert_json_path(&target_path) && !is_vtt_path(&target_path) {
            return Err(format!(
                "autosave can only overwrite .cuebert.json or .vtt transcripts: {}",
                target_path.display()
            ));
        }
    } else if !is_cuebert_json_path(&target_path) {
        return Err(format!(
            "autosave target must be a .cuebert.json file: {}",
            target_path.display()
        ));
    }

    write(&target_path, contents)
        .map_err(|error| format!("failed to write {}: {error}", target_path.display()))
}

fn install_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    let setup_guide_item = MenuItem::with_id(
        app.handle(),
        TRANSCRIPTION_SETUP_GUIDE_MENU_ID,
        "Transcription Setup Guide",
        true,
        None::<&str>,
    )?;

    if let Some(item) = menu.get(HELP_SUBMENU_ID) {
        if let Some(help_menu) = item.as_submenu() {
            help_menu.append(&setup_guide_item)?;
        }
    }

    app.set_menu(menu)?;
    Ok(())
}

fn open_transcription_setup_guide(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(TRANSCRIPTION_SETUP_GUIDE_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let result = WebviewWindowBuilder::new(
        &app,
        TRANSCRIPTION_SETUP_GUIDE_WINDOW_LABEL,
        WebviewUrl::App("help/transcription-setup.html".into()),
    )
    .title("Transcription Setup Guide")
    .inner_size(900.0, 760.0)
    .min_inner_size(640.0, 520.0)
    .resizable(true)
    .build();

    if let Err(error) = result {
        let line = serde_json::json!({
          "timestamp_ms": now_millis(),
          "entry": {
            "level": "error",
            "source": "rust",
            "message": "failed to open transcription setup guide",
            "error": error.to_string(),
          },
        });

        let _ = append_log_line(fallback_log_dir(), &line.to_string());
    }
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
        .setup(|app| {
            install_app_menu(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == TRANSCRIPTION_SETUP_GUIDE_MENU_ID {
                let app = app.clone();
                std::thread::spawn(move || {
                    open_transcription_setup_guide(app);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            append_log,
            find_matching_media,
            write_transcript_autosave
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
