---
title: Cuebert Developer Syllabus
author: Pat
---

This syllabus is a guided introduction to how Cuebert works as a codebase. It is meant for developers who need to read, debug, extend, or review the software. The focus is not only what each file does, but how state and events move through the app.

Cuebert is mostly a static web application in `cuebert/`, wrapped by a small Tauri desktop shell in `src-tauri/`. The frontend uses native custom elements, browser media APIs, Web Audio, SVG, and small service modules. There is no framework build step.

## Learning Goals

By the end, a developer should be able to:

- trace transcript loading from file input to rendered cue editors
- explain the core cue data model
- understand how `SubtitleEditor` coordinates services and components
- modify cue operations safely
- debug playback, preview tracks, waveform interactions, and focus behavior
- add focused Deno tests for service-level logic
- understand the boundary between web frontend code and Tauri commands

## 1. Repository Map

Start by learning the major folders:

- `cuebert/`: static frontend application
- `cuebert/SubtitleEditor.js`: main app custom element and orchestration layer
- `cuebert/cue-editor/`: one cue editor component
- `cuebert/cue-list-view/`: cue list renderer and virtualization layer
- `cuebert/wave-form/`: SVG waveform component
- `cuebert/services/`: logic modules with most test coverage
- `src-tauri/`: desktop wrapper, filesystem commands, logging, and packaging
- `deno.json`: developer tasks for Tauri, builds, logs, and tests

### Reading Assignment

Read:

- `README.md`
- `deno.json`
- `cuebert/index.html`
- `cuebert/SubtitleEditor.js` constructor and `initialize()`

### Lab

Run the service tests:

```sh
deno test cuebert/services/*.test.js
```

Then run the app in development:

```sh
deno task dev
```

### Study Questions

1. Which parts of the app are plain browser code, and which parts require Tauri?
2. Why is `SubtitleEditor.js` the best starting point for tracing behavior?
3. What does the project gain by keeping most logic in `cuebert/services/`?

## 2. The Core Data Model

The central data structure is the cue. A cue is a plain object with fields such as:

- `id`
- `start`
- `end`
- `text`
- `speaker`
- `sourceSegmentId` or `sourceSegmentIds`
- `generatedFromAudioGap`

The app usually mutates cue objects directly, then calls `afterCueChange()` to re-render, mark dirty state, refresh preview subtitles, and schedule autosave.

### Reading Assignment

Read:

- `cuebert/services/TranscriptParser.js`
- `cuebert/services/TranscriptExporter.js`
- `cuebert/services/CueOperations.js`
- `cuebert/services/CueOperations.test.js`

### Lab

Add a temporary `console.log(this.cues)` after transcript loading, load a transcript, and inspect the cue objects. Remove the log afterward.

### Study Questions

1. How does Cuebert normalize JSON transcript segments into one editing model?

2. Why does `sourceSegmentIds` matter after splitting or merging cues?

"provenance tracking"

3. What must happen after mutating `this.cues`?

## 3. `SubtitleEditor` as the Coordinator

`SubtitleEditor` owns the main application state and wires together all components. It renders the shell, caches DOM nodes, binds events, loads files, tracks media state, renders cues, and delegates business logic to services.

Important state groups include:

- transcript state: `cues`, `loadedTranscript`, `loadedTranscriptFormat`, `loadedTranscriptPath`
- media state: `mediaLoadedFromPath`, `autoLoadedMediaPath`, `mediaLoadedManually`
- playback state: `previewEnd`, `playbackCue`, `transportPlaybackHighlightActive`
- autosave state: `hasUnsavedChanges`, `changeRevision`, autosave timers
- audio analysis state: `audioBuffer`, `envelope`, `frameDuration`
- focus state: `activeCue`, `keyboardFocusedCue`, cue element maps

### Reading Assignment

Read these methods in `cuebert/SubtitleEditor.js`:

- `constructor()`
- `renderShell()`
- `cacheElements()`
- `bindEvents()`
- `loadTranscriptDocument()`
- `renderCues()`
- `afterCueChange()`
- `deleteCue()`

### Lab

Trace what happens when a user edits cue text:

1. `CueEditor` emits `cuechange`.
2. `CueListView` handler calls the parent callback.
3. `SubtitleEditor` calls `afterCueChange()`.
4. Preview track and autosave are scheduled.

Write a short note explaining each step.

### Study Questions

1. Which responsibilities still live inside `SubtitleEditor`?
2. Which responsibilities have already been extracted to services?
3. What risks come from re-rendering cue editors after every cue change?

## 4. Component Boundaries

Cuebert uses custom elements as UI components:

- `cue-list-view`: renders cue editors, merge rows, and virtualized ranges
- `cue-editor`: renders one cue's speaker, play, timing, waveform, text, split, and delete controls
- `wave-form`: renders local waveform context and emits seek or boundary events
- `cue-bert`: the full app shell

The child components do not own global app state. They emit callbacks or custom events, and `SubtitleEditor` decides how app state changes.

### Reading Assignment

Read:

- `cuebert/cue-list-view/CueListView.js`
- `cuebert/cue-editor/CueEditor.js`
- `cuebert/wave-form/WaveForm.js`

### Lab

Trace a waveform boundary drag:

1. `WaveForm` emits `waveformboundarychange`.
2. `CueEditor` forwards it through `onWaveformBoundaryChange`.
3. `CueListView` forwards the cue and detail.
4. `SubtitleEditor` previews labels or commits the timing change.

### Study Questions

1. Why should `WaveForm` not mutate a cue directly?
2. What does `CueListView` need to know in order to virtualize long cue lists?
3. How does `ensureCueRendered()` support focus and playback state?

## 5. Transcript Parsing and Export

Cuebert accepts JSON-like transcript inputs. Parsing turns source transcript data into the shared cue model. Export turns the current cue model back into plain text or Cuebert/aTrain JSON.

`TranscriptDocument` is a facade over parsing, export, metadata syncing, and title derivation.

### Reading Assignment

Read:

- `cuebert/services/TranscriptDocument.js`
- `cuebert/services/TranscriptParser.js`
- `cuebert/services/TranscriptExporter.js`
- `cuebert/services/TranscriptDocument.test.js`

### Lab

Create a tiny test fixture in your head:

```json
{
  "segments": [
    { "id": 1, "start": 0, "end": 1, "text": " Hello" }
  ]
}
```

Trace how it becomes a cue and how it exports back to Cuebert JSON.

### Study Questions

1. What data is preserved when importing aTrain JSON?
2. Why does `buildAtrainJson()` clone source segments instead of creating every segment from scratch?
3. Why are generated audio-gap cues omitted from saved transcript JSON?

## 6. Cue Operations

Structural edits are isolated in `CueOperations.js`:

- `splitCue()`
- `mergeCues()`
- `deleteCue()`

These functions are called with `this` bound to `SubtitleEditor`, which gives them access to shared helpers and state. This is a transitional pattern: it keeps operation logic testable while still using app methods.

### Reading Assignment

Read:

- `cuebert/services/CueOperations.js`
- `cuebert/services/CueOperations.test.js`
- `SubtitleEditor.splitCue()`
- `SubtitleEditor.mergeCues()`
- `SubtitleEditor.deleteCue()`

### Lab

Follow a delete operation from the cue delete button to focus restoration:

1. `CueEditor.confirmDeleteCue()`
2. `CueListView` `onDeleteCue`
3. `SubtitleEditor.deleteCue()`
4. `deleteCueOperation.call(this, cue)`
5. `afterCueChange()`
6. focus moves to the next cue

### Study Questions

1. Why does deletion choose the next cue before removing the current cue?
2. What should happen when the last cue is deleted?
3. What should operation tests cover, and what needs browser-level verification?

## 7. Playback and Preview State

Playback is managed by `TransportController`. It owns transport controls, play/pause state, playback speed, seeking, cue preview ranges, and UI labels.

`SubtitleEditor` owns higher-level cue highlighting and preview track generation. The HTML `<video>` element is hidden but drives media playback and subtitle timing.

### Reading Assignment

Read:

- `cuebert/services/TransportController.js`
- `cuebert/services/TransportController.test.js`
- `cuebert/services/PreviewTrackController.js`
- playback-related methods in `SubtitleEditor.js`

### Lab

Trace what happens when the cue play button is clicked:

1. `CueEditor` calls `onPlayCue`.
2. `CueListView` forwards the cue.
3. `SubtitleEditor.renderCues()` handler calls `transportController.toggleTimeRange()`.
4. `TransportController` starts or stops a cue preview.
5. `timeupdate` events update labels, waveform playheads, and cue highlighting.

### Study Questions

1. Why does `TransportController` track pending playback separately from `video.paused`?
2. Why does cue preview state need both a start and end range?
3. What is the difference between text track cue highlighting and transport-driven highlighting?

## 8. Audio Analysis and Gap Cues

Audio analysis creates a simplified envelope from the first audio channel. The envelope powers local waveform rendering and gap cue detection.

The analysis flow is:

1. Decode media with Web Audio.
2. Build an RMS envelope.
3. Store `envelope` and `frameDuration`.
4. Render waveforms for cues.
5. Detect audible gaps between cues and insert generated empty cues when appropriate.

### Reading Assignment

Read:

- `cuebert/services/AudioAnalyzer.js`
- `cuebert/services/AudioAnalyzer.test.js`
- `SubtitleEditor.initAudioAnalysis()`
- `SubtitleEditor.fillAudibleCueGaps()`

### Lab

Explain why gap detection needs both a duration threshold and an audio threshold. Then change neither: this is a reading exercise.

### Study Questions

1. What does one envelope frame represent?
2. Why does gap detection sort cues before checking gaps?
3. Why should very short audible gaps be ignored?

## 9. Autosave, File Adapters, and Tauri

Cuebert can run as a browser-like frontend, but desktop functionality depends on Tauri. Tauri provides native file paths, filesystem writes, matching-media discovery, and logging.

Autosave is intentionally conservative. It writes `.cuebert.json` next to a source aTrain JSON file, or overwrites an existing `.cuebert.json` file. The Rust command validates that the autosave target is safe.

### Reading Assignment

Read:

- `cuebert/services/AutosaveController.js`
- `cuebert/services/TauriFileAdapter.js`
- `cuebert/services/BrowserFileAdapter.js`
- `src-tauri/src/main.rs`
- `src-tauri/capabilities/default.json`

### Lab

Trace autosave availability:

1. The app checks whether a transcript was opened from disk.
2. `AutosaveController` computes a target path.
3. The frontend calls `write_transcript_autosave`.
4. Rust validates source and target paths before writing.

### Study Questions

1. Why should autosave target validation happen in Rust, not only JavaScript?
2. Why does an aTrain JSON source create a sibling `.cuebert.json` target?
3. What features are unavailable outside the desktop wrapper?

## 10. Search, Speakers, and Small Controllers

Several focused controllers keep common logic outside the main element:

- `CueSearchController`: text and speaker search
- `SpeakerController`: manual speakers, cue speaker changes, renaming
- `AutosaveController`: autosave paths and availability
- `TranscriptDocument`: parsing/export facade

These classes are deliberately small and easy to unit test.

### Reading Assignment

Read:

- `cuebert/services/CueSearchController.js`
- `cuebert/services/CueSearchController.test.js`
- `cuebert/services/SpeakerController.js`
- `cuebert/services/SpeakerController.test.js`

### Lab

Add one new test case to either `CueSearchController.test.js` or `SpeakerController.test.js`, then remove it after verifying you understand the pattern.

### Study Questions

1. What makes these controllers easier to test than `SubtitleEditor`?
2. Why should search match both cue text and speaker labels?
3. How should speaker renames affect existing cues?

## 11. Rendering, Virtualization, and Focus

Cuebert may render hundreds or thousands of cues. `CueListView` virtualizes long lists by rendering only a range near the viewport, plus spacer elements. This improves performance but makes focus and playback highlighting more complicated.

When code needs to focus or highlight a cue, it cannot assume the cue has a DOM element. It must call `ensureCueRendered()` or work with cue references until the element exists.

### Reading Assignment

Read:

- `CueListView.shouldVirtualize()`
- `CueListView.renderVirtualRange()`
- `CueListView.ensureCueRendered()`
- `SubtitleEditor.syncCueListRenderState()`
- `SubtitleEditor.restoreKeyboardCueFocus()`
- `SubtitleEditor.setPlaybackCue()`

### Lab

Explain how focus should behave after deleting a cue in a virtualized list. Include what happens if the next cue was not rendered before deletion.

### Study Questions

1. Why does virtualization require a cue-to-element map?
2. Why is cue identity based on object references in several places?
3. What bugs can appear when focus restoration runs before rendering is complete?

## 12. Testing Strategy

Most current tests are service-level Deno tests. They are fast and useful for pure logic, path decisions, parsing/export behavior, and transport state transitions.

Browser-level or app-level verification is still needed for:

- focus behavior
- DOM events
- waveform pointer interactions
- real media playback behavior
- Tauri file dialogs and native filesystem behavior

### Reading Assignment

Read every file matching:

```sh
cuebert/services/*.test.js
```

### Lab

Pick one recent bug and identify the best level for a regression test:

- pure service test
- component DOM test
- browser smoke test
- manual Tauri test

### Study Questions

1. What should never require launching the desktop app to test?
2. What behavior is hard to cover with service tests alone?
3. How can a test avoid depending on real media playback?

## 13. Change Workflow

Use this workflow for most code changes:

1. Read the relevant component and service files.
2. Identify who owns state and who only emits events.
3. Add or update a focused test when the logic is in a service.
4. Keep edits narrowly scoped.
5. Run `deno test cuebert/services/*.test.js`.
6. For UI behavior, run the app and verify the workflow manually or with a browser smoke test.

### Common Commands

```sh
deno test cuebert/services/*.test.js
deno task dev
deno task build
deno task logs
```

### Study Questions

1. Before changing a component, how do you decide whether state belongs in the component or `SubtitleEditor`?
2. Before changing a service, what existing tests should you read first?
3. What should a final verification note include?

## Final Project

Implement a small developer-facing change from start to finish. Good examples:

- add a new cue search option
- change the minimum generated gap cue duration
- improve speaker rename behavior
- adjust cue focus behavior after split, merge, or delete
- add a new export edge-case test

Your final write-up should include:

- the user-visible behavior being changed
- the modules involved
- the state flow before and after the change
- tests added or updated
- manual verification performed
- risks that remain

### Final Study Questions

1. Which file was the best entry point for your change, and why?
2. Which module owned the final state change?
3. What event or callback path triggered the behavior?
4. What test would fail if your change regressed?
5. What part of the app still needs better separation or test coverage?
