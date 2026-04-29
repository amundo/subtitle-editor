The nightmare is that `SubtitleEditor` is doing **everything**: UI shell, file loading, Tauri/browser save logic, transcript parsing, media loading, audio analysis, autosave, cue editing, speaker editing, preview tracks, and playback sync in one class. 

Refactor in this order:

### 2. Extract the safest files first

Then:

```js
// services/TranscriptExporter.js
export function buildVtt(cues) {}
export function buildPlainText(cues) {}
export function buildAtrainJson(cues, sourceData, options) {}
```

These are easiest because they barely need DOM.

### 3. Extract cue mutation next

Move these out:

```js
splitCue()
mergeCues()
deleteCue()
setCueBoundary()
splitCueText()
joinCueText()
createCueId()
getCueSplitTime()
```

Into:

```js
// services/CueOperations.js
export function splitCue(cues, cue, options) {}
export function mergeCues(cues, targetCue, mergedCue) {}
export function deleteCue(cues, cue) {}
```

The editor should say:

```js
this.cues = splitCue(this.cues, cue, options)
this.afterCueChange()
```

Not directly mutate and re-render everywhere.

### 4. Add one central change method

Right now every operation manually does some combination of:

```js
renderSpeakerEditor()
renderCues()
markDirty()
```

Make one method:

```js
afterCueChange() {
  this.renderSpeakerEditor()
  this.renderCues()
  this.markDirty()
}
```

Then replace all cue edits with that. This alone will reduce chaos.

### 5. Separate file saving from transcript logic

Make an adapter:

```js
class FileAdapter {
  async openTextFile() {}
  async saveTextFile({ defaultPath, filters, contents, mimeType }) {}
  async writeTextFile(path, contents) {}
}
```

Then have:

```js
TauriFileAdapter
BrowserFileAdapter
```

So `SubtitleEditor` no longer asks `window.__TAURI__?...` everywhere.

### 6. Extract autosave as a controller

Autosave has enough state to be its own object:

```js
const autosave = new AutosaveController({
  delayMs: 1200,
  canSave: () => this.canAutosave(),
  save: () => this.saveLoadedTranscript(),
  onStatus: status => this.setAutosaveStatus(status)
})
```

Then editor only calls:

```js
this.autosave.markDirty()
```

### 7. Delay component splitting

Do **not** immediately split toolbar/media bar/speaker dialog unless needed. First split logic. Later you can make:

```txt
components/
  MediaBar.js
  SpeakerDialog.js
  CueToolbar.js
```

But doing that first will make the refactor harder.

### 8. Good first Codex task

Give Codex something narrow:

> Refactor `SubtitleEditor.js` by extracting `formatTime`, `parseTime`, `parseVtt`, `parseAtrainJson`, `parseSubtitleFile`, `buildVtt`, and `buildPlainText` into service modules. Keep behavior identical. Update imports. Add simple Deno tests for parsing/exporting.

That is the safest first chunk.
