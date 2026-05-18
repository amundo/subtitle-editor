---
title: Refactor plan for SubtitleEditor
author: Pat
---

This is a classic “god component”: `SubtitleEditor` owns document state, media loading, autosave, waveform analysis, cue rendering, speakers, search, keyboard shortcuts, dialogs, and export all at once. 

Refactor in **small safe slices**:

### 1. Split by responsibility, not by file length

Create controllers like:

```txt
SubtitleEditor.js              // shell only: compose controllers + state
controllers/
  MediaController.js            // load media, matching media, MIME/blob logic
  PreviewTrackController.js     // VTT blob URL, text track listeners
  CuePlaybackController.js      // active/playback cue sync
  CueEditingController.js       // split, merge, delete, boundaries
  KeyboardController.js         // global shortcuts
  ExportController.js           // save/download output
  SpeakerPanelController.js     // speaker dialog rendering/events
  CueSearchPanelController.js   // search input state/count
```

`SubtitleEditor` should eventually read like:

```js
initialize() {
  this.renderShell()
  this.cacheElements()
  this.createControllers()
  this.bindControllers()
  this.render()
}
```

### 2. Extract low-risk utility methods first

Move these first because they are mostly pure:

```js
clamp()
getMediaMimeType()
getTextSplitIndex()
splitCueText()
joinCueText()
createCueId()
findCueAtTime()
getTranscriptMetadataMediaPath()
```

Suggested file:

```txt
services/SubtitleEditorUtils.js
```

### 3. Extract media loading next

This cluster belongs together:

```js
canFindMatchingMedia()
loadMatchingMediaForTranscript()
loadMediaForTranscript()
loadMediaFromPath()
getMediaAnalysisBlob()
readMediaBlobFromPath()
getMediaMimeType()
updateMediaLoadControlVisibility()
```

Make `MediaController` emit callbacks like:

```js
onMediaLoaded({ path, manuallyLoaded })
onAudioReady({ audioBuffer, envelope, frameDuration })
```

### 4. Extract preview track management

This is its own subsystem:

```js
refreshPreviewTrack()
schedulePreviewTrackRefresh()
cancelScheduledPreviewTrackRefresh()
ensurePreviewTrackShowing()
revokePreviewTrackUrl()
bindPreviewCueEvents()
clearPreviewCueListeners()
```

This would drastically shrink the editor.

### 5. Make cue state explicit

Right now state is scattered across many instance fields. Create one object:

```js
this.state = {
  cues: [],
  activeCue: null,
  playbackCue: null,
  search: {
    query: '',
    matchCase: false,
    wholeWords: false
  },
  document: {
    sourceData: null,
    format: null,
    path: null
  },
  media: {
    path: null,
    autoLoadedPath: null,
    manuallyLoaded: false
  },
  dirty: {
    hasUnsavedChanges: false,
    revision: 0
  }
}
```

Do this gradually; do **not** rewrite everything at once.

### 6. Pull the huge `renderCues()` handler object out

That method is doing too much. Make:

```js
getCueListData()
getCueListHandlers()
renderCues()
```

So `renderCues()` becomes mostly assignment:

```js
renderCues() {
  this.cueList.data = this.getCueListData()
  this.syncCueListRenderState()
}
```

### 7. Last step: make `SubtitleEditor` an app coordinator

Final goal:

```js
class SubtitleEditor extends HTMLElement {
  connectedCallback() {
    this.app = new SubtitleEditorApp(this)
    this.app.start()
  }

  disconnectedCallback() {
    this.app.stop()
  }
}
```

The custom element should manage DOM lifecycle, not contain the whole application.

Best first PR: **extract `PreviewTrackController`**. It has clear boundaries, obvious cleanup needs, and reduces a lot of noise without changing core behavior.
