# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cuebert is a desktop subtitle editor (Tauri + web frontend) for reviewing and correcting AI-generated JSON transcripts alongside audio/video. Each cue (subtitle segment) gets its own inline waveform rather than a single global timeline.

## Commands

All tasks run via Deno (no Node required):

```sh
deno task dev          # Start Tauri in dev mode with hot reload
deno task build        # Build production .app + DMG
deno task build:debug  # Build debug binary
deno task clean        # Remove Rust build artifacts
deno task logs         # Show last 200 lines of ~/Library/Logs/Cuebert/cuebert.log
deno task logs:follow  # Tail log in real time
deno task transcribe   # Run whisper.cpp and produce a .cuebert.json file
deno task version      # Bump version across config files
```

Run a single test file:
```sh
deno test cuebert/services/CueStore.test.js --allow-read
```

Run all tests:
```sh
deno test cuebert/services/ --allow-read
```

Prerequisites: Rust toolchain, Xcode CLI tools (macOS), Deno.

## Architecture

### Frontend (`cuebert/`)

Pure web standards — no build step, no framework. The Tauri webview serves `cuebert/index.html` directly.

**Entry point:** `cuebert/index.html` mounts a single `<cue-bert>` custom element.

**`CueBert.js`** — the root Web Component. Owns all application state (loaded transcript, media, speakers, autosave state, UI preferences) and wires together all services. It is large and serves as the controller/orchestrator.

**UI components** (each is a folder with `.js`, `.html`, `.css`):
- `cue-list-view/` — virtual-scrolling list of all cues
- `cue-editor/` — inline editor for a single cue (text, timing, speaker, waveform)
- `wave-form/` — SVG waveform rendered per-cue from Web Audio API data

**Services (`cuebert/services/`)**:
| File | Role |
|------|------|
| `TranscriptParser.js` | Parses JSON transcripts (atrain-json format or raw whisper.cpp JSON) into cue arrays |
| `TranscriptExporter.js` | Serializes cues back to atrain-json or plain text |
| `TranscriptDocument.js` | Thin facade combining parser + exporter; manages metadata sync |
| `CueStore.js` | In-memory ordered store for cues; extends `EventTarget`; handles CRUD + search |
| `CueOperations.js` | Pure functions for delete/merge/split on a cue array |
| `CueSearchController.js` | Text search/filter over cues |
| `AudioAnalyzer.js` | Builds amplitude envelopes from `AudioBuffer` data via Web Audio API |
| `AutosaveController.js` | Determines autosave availability, computes target path (`.cuebert.json`), writes via Tauri invoke |
| `TransportController.js` | Controls `<video>` playback: play/pause, seek, speed, preview ranges |
| `SpeakerController.js` | Manages speaker label list |
| `MediaLoader.js` | Loads audio/video files into the browser |
| `BrowserFileAdapter.js` / `TauriFileAdapter.js` | File I/O abstraction: browser uses `<input type=file>`, Tauri uses `tauri-plugin-dialog` + `tauri-plugin-fs` |
| `time.js` | `formatTime` / `parseTime` utilities |
| `PreviewTrackController.js` | Manages per-cue playback preview state |

### Tauri backend (`src-tauri/src/main.rs`)

Three Rust commands exposed to the frontend via `invoke()`:
- `append_log` — appends JSON log entries to `~/Library/Logs/Cuebert/cuebert.log` and a version-specific log such as `cuebert-0.8.2.log`
- `find_matching_media` — auto-discovers a media file next to a transcript (same stem, common extensions)
- `write_transcript_autosave` — writes `.cuebert.json` with safety checks (same directory, correct extension)

### Data formats

- **atrain-json** — the native format: `{ metadata: {...}, segments: [{id, start, end, text, speaker, words}] }`
- **whisper.cpp JSON** — detected by presence of `transcription[]` array; converted to atrain-json on load
- **`.cuebert.json`** — an atrain-json file saved by Cuebert (autosave always targets this extension)

### Transcription pipeline

`scripts/cuebert-transcribe.js` wraps `whisper-cli` (from `cuebert-transcription-kit/`) to produce `.cuebert.json` files. The kit is distributed separately as `cuebert-transcription-kit.zip`.

### Logging

The app logs to `~/Library/Logs/Cuebert/cuebert.log` and `~/Library/Logs/Cuebert/cuebert-<version>.log` as newline-delimited JSON objects. Each line includes top-level `app_version`, and webview entries also include `entry.appVersion`. `app-logger.js` patches `console.*` to route through the Tauri `append_log` command when running in desktop mode.
