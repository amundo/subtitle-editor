// SubtitleEditor.js
import './cue-editor/CueEditor.js'
import './cue-list-view/CueListView.js'
import { formatTime, parseTime } from './services/time.js'
import { AutosaveController } from './services/AutosaveController.js'
import { SpeakerController } from './services/SpeakerController.js'
import { TranscriptDocument } from './services/TranscriptDocument.js'
import { TransportController } from './services/TransportController.js'
import { CueSearchController } from './services/CueSearchController.js'
import {
  deleteCue as deleteCueOperation,
  mergeCues as mergeCuesOperation,
  splitCue as splitCueOperation
} from './services/CueOperations.js'

class SubtitleEditor extends HTMLElement {
  constructor() {
    super()

    this.isInitialized = false

    // transcript/document state
    this.cues = []
    this.manualSpeakers = []
    this.loadedTranscript = null
    this.loadedTranscriptFormat = null
    this.loadedTranscriptPath = null

    // media source state
    this.mediaLoadedFromPath = null
    this.autoLoadedMediaPath = null

    // preview/playback state
    this.previewEnd = null
    this.previewTrackUrl = null
    this.previewTrackRefreshTimer = null

    // display preferences
    this.cueFontSizeEm = 1
    this.minCueFontSizeEm = 0.6
    this.maxCueFontSizeEm = 2
    this.cueSearchQuery = ''
    this.cueSearchMatchCase = false
    this.cueSearchWholeWords = false

    // autosave state
    this.autosaveEnabled = true
    this.autosaveDelayMs = 1200
    this.autosaveTimer = null
    this.autosaveInFlight = false
    this.autosaveQueued = false
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = null
    this.lastAutosaveDiagnosticSignature = ''
    this.autosaveController = new AutosaveController()
    this.speakerController = new SpeakerController()
    this.transcriptDocument = new TranscriptDocument()
    this.cueSearchController = new CueSearchController()

    // audio analysis state
    this.audioBuffer = null
    this.envelope = null
    this.frameDuration = null

    // cue focus/playback UI state
    this.activeCue = null
    this.activeCueElement = null
    this.cueElementByCue = new Map()
    this.playbackCue = null
    this.playbackCueElement = null
    this.previewCueListeners = []
    this.transportPlaybackHighlightActive = false
  }

  connectedCallback() {
    if (this.isInitialized) return
    this.initialize()
    this.isInitialized = true
  }

  initialize() {
    this.renderShell()
    this.cacheElements()
    this.bindEvents()
  }

  disconnectedCallback() {
    this.cancelScheduledAutosave()
    this.cancelScheduledPreviewTrackRefresh()
    this.clearPreviewCueListeners()
    this.revokePreviewTrackUrl()
  }

  renderShell() {
    this.innerHTML = `
        <header class="top-toolbar">
          <img id="cuebert-logo" src="./icons/cuebert-logo.svg" alt="Cuebert logo" class="logo">
          <span class="file-inputs">
            <label class="file-load-button" data-role="mediaLoadControl" hidden>
              <span>Load media</span>
              <input class="visually-hidden-file" type="file" data-role="videoFile" accept="video/*,audio/*">
            </label>
            <label class="file-load-button">
              <span>Load transcript</span>
              <input class="visually-hidden-file" type="file" data-role="vttFile" accept=".json,.vtt,application/json,text/vtt">
            </label>
          </span>
        </header>

        <div class="cues-column">
          <div class="cue-panel-header">
            <strong>Cues</strong>
            <div class="cue-panel-actions">
              <span class="adjust-font-size">
                <button data-role="decreaseFontBtn">A-</button>
                <button data-role="increaseFontBtn">A+</button>
              </span>

              <span data-role="autosaveStatus" class="autosave-status">Autosave ready</span>
              <label class="autosave-toggle">
                <input type="checkbox" data-role="autosaveToggle" checked>
                Autosave
              </label>
              <button data-role="editSpeakersBtn" hidden>Edit speakers</button>
              Export:
              <button data-role="saveBtn" disabled>Cuebert JSON</button>
              <button data-role="downloadTextBtn" disabled>TXT</button>
              <button data-role="downloadBtn" disabled>VTT</button>
            </div>
          </div>
          <div class="cue-search-row" data-role="cueSearchRow">
            <label class="cue-search-label">
              <span>Search cues</span>
              <input
                data-role="cueSearchInput"
                class="cue-search-input"
                type="search"
                placeholder="Search text or speaker…"
                autocomplete="off"
              >
            </label>
            <label class="cue-search-option">
              <input data-role="cueSearchMatchCase" type="checkbox">
              <span>Match Case</span>
            </label>
            <label class="cue-search-option">
              <input data-role="cueSearchWholeWords" type="checkbox">
              <span>Whole Words</span>
            </label>
            <span data-role="cueSearchCount" class="cue-search-count"></span>
          </div>
          <cue-list-view data-role="cueList" class="cue-list"></cue-list-view>
        </div>

        <footer class="media-bar">
          <video data-role="video" preload="metadata" aria-hidden="true" tabindex="-1">
            <track
              data-role="previewTrack"
              kind="subtitles"
              srclang="en"
              label="Edited subtitles"
              default
            >
          </video>
          <div class="transport-controls" role="group" aria-label="Media playback controls">
            <button data-role="mediaPlayBtn" class="transport-button" type="button" aria-label="Play">▶</button>
            <input
              data-role="mediaSeek"
              class="media-seek"
              type="range"
              min="0"
              max="0"
              step="0.01"
              value="0"
              aria-label="Media position"
            >
            <div class="current-time-row">
              <span data-role="currentTime" class="time-label">00:00:00.000</span>
              <span class="time-divider">/</span>
              <span data-role="durationTime" class="time-label">00:00:00.000</span>
            </div>
            <button data-role="mediaMuteBtn" class="transport-button" type="button" aria-label="Mute">${TransportController.renderVolumeIcon(false)}</button>
            <input
              data-role="mediaVolume"
              class="media-volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value="1"
              aria-label="Volume"
            >
          </div>
        </footer>

        <button
          data-role="shortcutGuideBtn"
          class="shortcut-guide-button"
          type="button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >?</button>

        <dialog data-role="shortcutGuideDialog" class="shortcut-guide-dialog">
          <div class="shortcut-guide-panel">
            <div class="shortcut-guide-header">
              <strong>Keyboard Shortcuts</strong>
              <button data-role="closeShortcutGuideBtn" type="button" aria-label="Close keyboard shortcuts">Close</button>
            </div>
            <dl class="shortcut-list">
              <div>
                <dt><kbd>Cmd</kbd><kbd>/</kbd></dt>
                <dd>Focus cue search</dd>
              </div>
              <div>
                <dt><kbd>Cmd</kbd><kbd>Enter</kbd></dt>
                <dd>Play current cue while editing text</dd>
              </div>
              <div>
                <dt><kbd>Cmd</kbd><kbd>Option</kbd><kbd>Down</kbd></dt>
                <dd>Move to next visible cue text box</dd>
              </div>
              <div>
                <dt><kbd>Cmd</kbd><kbd>Option</kbd><kbd>Up</kbd></dt>
                <dd>Move to previous visible cue text box</dd>
              </div>
            </dl>
            <small>Guess who loves you?</small>
          </div>
        </dialog>

        <dialog data-role="speakerDialog" class="speaker-dialog">
          <div class="speaker-panel">
            <div class="speaker-panel-header">
              <strong>Speakers</strong>
              <span class="speaker-panel-hint">Rename a speaker once to update every cue.</span>
            </div>
            <form data-role="addSpeakerForm" class="speaker-add-row">
              <input
                data-role="addSpeakerInput"
                class="speaker-input"
                type="text"
                placeholder="New speaker name"
                aria-label="New speaker name"
              >
              <button data-role="addSpeakerBtn" class="speaker-apply" type="submit">Add speaker</button>
            </form>
            <div data-role="speakerList" class="speaker-list"></div>
            <div class="speaker-dialog-actions">
              <button data-role="closeSpeakerDialogBtn" type="button">Close</button>
            </div>
          </div>
        </dialog>
    `
  }

  cacheElements() {
    this.video = this.querySelector('[data-role="video"]')
    this.previewTrack = this.querySelector('[data-role="previewTrack"]')
    this.currentTimeLabel = this.querySelector('[data-role="currentTime"]')
    this.durationTimeLabel = this.querySelector('[data-role="durationTime"]')
    this.mediaPlayBtn = this.querySelector('[data-role="mediaPlayBtn"]')
    this.mediaSeek = this.querySelector('[data-role="mediaSeek"]')
    this.mediaMuteBtn = this.querySelector('[data-role="mediaMuteBtn"]')
    this.mediaVolume = this.querySelector('[data-role="mediaVolume"]')
    this.mediaLoadControl = this.querySelector('[data-role="mediaLoadControl"]')
    this.videoFileInput = this.querySelector('[data-role="videoFile"]')
    this.vttFileInput = this.querySelector('[data-role="vttFile"]')
    this.cueList = this.querySelector('[data-role="cueList"]')
    this.cueSearchRow = this.querySelector('[data-role="cueSearchRow"]')
    this.cueSearchInput = this.querySelector('[data-role="cueSearchInput"]')
    this.cueSearchMatchCaseInput = this.querySelector('[data-role="cueSearchMatchCase"]')
    this.cueSearchWholeWordsInput = this.querySelector('[data-role="cueSearchWholeWords"]')
    this.cueSearchCount = this.querySelector('[data-role="cueSearchCount"]')
    this.saveBtn = this.querySelector('[data-role="saveBtn"]')
    this.downloadBtn = this.querySelector('[data-role="downloadBtn"]')
    this.downloadTextBtn = this.querySelector('[data-role="downloadTextBtn"]')
    this.autosaveStatus = this.querySelector('[data-role="autosaveStatus"]')
    this.autosaveToggle = this.querySelector('[data-role="autosaveToggle"]')
    this.shortcutGuideBtn = this.querySelector('[data-role="shortcutGuideBtn"]')
    this.shortcutGuideDialog = this.querySelector('[data-role="shortcutGuideDialog"]')
    this.closeShortcutGuideBtn = this.querySelector('[data-role="closeShortcutGuideBtn"]')
    this.editSpeakersBtn = this.querySelector('[data-role="editSpeakersBtn"]')
    this.speakerDialog = this.querySelector('[data-role="speakerDialog"]')
    this.closeSpeakerDialogBtn = this.querySelector('[data-role="closeSpeakerDialogBtn"]')
    this.addSpeakerForm = this.querySelector('[data-role="addSpeakerForm"]')
    this.addSpeakerInput = this.querySelector('[data-role="addSpeakerInput"]')
    this.speakerList = this.querySelector('[data-role="speakerList"]')
    this.cuebertLogo = this.querySelector('#cuebert-logo')
    this.adjustFontSizeButtons = {
      increase: this.querySelector('[data-role="increaseFontBtn"]'),
      decrease: this.querySelector('[data-role="decreaseFontBtn"]')
    }
  }


  bindEvents() {
    this.transportController = new TransportController({
      video: this.video,
      previewTrack: this.previewTrack,
      controls: {
        currentTimeLabel: this.currentTimeLabel,
        durationTimeLabel: this.durationTimeLabel,
        mediaSeek: this.mediaSeek,
        mediaPlayBtn: this.mediaPlayBtn,
        mediaMuteBtn: this.mediaMuteBtn,
        mediaVolume: this.mediaVolume
      },
      getPreviewEnd: () => this.previewEnd,
      setPreviewEnd: previewEnd => {
        this.previewEnd = previewEnd
      },
      onPlaybackSync: source => {
        this.syncActiveCueToPlayback(source)
      },
      onPreviewTrackLoad: () => {
        this.ensurePreviewTrackShowing()
        this.bindPreviewCueEvents()
      }
    })
    this.transportController.bindVideoEvents()
    this.bindFileEvents()
    this.bindExportEvents()
    this.bindSpeakerEvents()
    this.bindShortcutGuideEvents()
    this.transportController.bindTransportControls()
    this.bindPreferenceEvents()
    this.bindCueSearchEvents()
    this.bindKeyboardEvents()

    this.transportController.updateUi()
  }

  bindKeyboardEvents() {
    this.addEventListener('keydown', event => {
      if (
        event.code !== 'Slash' ||
        !event.metaKey ||
        event.altKey ||
        event.ctrlKey
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      this.focusCueSearch()
    })
  }

  focusCueSearch() {
    if (!this.cueSearchInput) return

    this.cueSearchRow?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    this.cueSearchInput.focus({ preventScroll: true })
    this.cueSearchInput.select()
  }

  bindFileEvents() {
    this.videoFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      this.mediaLoadedFromPath = this.getFilePath(file)
      this.autoLoadedMediaPath = null
      this.video.src = URL.createObjectURL(file)
      this.transportController.updateUi()
      this.ensurePreviewTrackShowing()
      // kick off async audio analysis
      this.initAudioAnalysis(file).catch(err => {
        console.error('Audio analysis failed:', err)
      })
      if (this.mediaLoadedFromPath) this.markMediaPathChanged()
      this.updateMediaLoadControlVisibility()
    })

    this.vttFileInput.addEventListener('click', e => {
      if (!this.canUseNativeTranscriptPicker()) return

      e.preventDefault()
      this.openNativeTranscriptFile().catch(err => {
        console.error('Subtitle parsing failed:', err)
        alert('Could not load that aTrain JSON file.')
      })
    })

    this.vttFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      file.text().then(text => {
        this.loadTranscriptText(text, {
          fileName: file.name,
          sourcePath: this.getFilePath(file)
        })
      }).catch(err => {
        console.error('Subtitle parsing failed:', err)
        alert('Could not load that aTrain JSON file.')
      })
    })


  }
  bindExportEvents() {
    this.downloadBtn.addEventListener('click', () => {
      this.saveTextOutput({
        defaultPath: 'adjusted-subtitles.vtt',
        filters: [{ name: 'WebVTT', extensions: ['vtt'] }],
        contents: this.transcriptDocument.buildVttContents(this.cues),
        mimeType: 'text/vtt'
      }).then(targetPath => {
        if (targetPath && this.loadedTranscriptFormat === 'vtt') {
          this.markSavedToPath(targetPath)
        }
      })
    })

    this.saveBtn.addEventListener('click', () => {
      if (this.loadedTranscriptFormat !== 'atrain-json' || !this.loadedTranscript) return

      this.saveTextOutput({
        defaultPath: this.getCuebertJsonDefaultPath(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
        contents: this.transcriptDocument.buildCuebertJsonContents({
          cues: this.cues,
          sourceData: this.loadedTranscript,
          mediaPath: this.mediaLoadedFromPath,
          speakers: this.getUniqueSpeakers(),
          title: this.getTranscriptTitle()
        }),
        mimeType: 'application/json'
      }).then(targetPath => {
        if (targetPath) {
          this.markSavedToPath(targetPath)
        }
      })
    })

    this.downloadTextBtn.addEventListener('click', () => {
      this.saveTextOutput({
        defaultPath: 'transcript.txt',
        filters: [{ name: 'Text', extensions: ['txt'] }],
        contents: this.transcriptDocument.buildPlainTextContents(this.cues),
        mimeType: 'text/plain'
      })
    })

  }
  bindSpeakerEvents() {
    this.editSpeakersBtn.addEventListener('click', () => {
      if (this.speakerDialog) this.speakerDialog.showModal()
    })

    this.closeSpeakerDialogBtn.addEventListener('click', () => {
      if (this.speakerDialog?.open) this.speakerDialog.close()
    })

    this.addSpeakerForm.addEventListener('submit', e => {
      e.preventDefault()
      this.addSpeaker(this.addSpeakerInput?.value ?? '')
    })

  }

  bindShortcutGuideEvents() {
    this.shortcutGuideBtn?.addEventListener('click', () => {
      if (!this.shortcutGuideDialog) return

      if (this.shortcutGuideDialog.open) {
        this.shortcutGuideDialog.close()
        return
      }

      this.shortcutGuideDialog.showModal()
    })

    this.closeShortcutGuideBtn?.addEventListener('click', () => {
      if (this.shortcutGuideDialog?.open) {
        this.shortcutGuideDialog.close()
      }
    })
  }

  bindCueSearchEvents() {
    this.cueSearchInput?.addEventListener('input', () => {
      this.cueSearchQuery = this.cueSearchInput.value
      this.renderCues()
    })
    this.cueSearchMatchCaseInput?.addEventListener('change', () => {
      this.cueSearchMatchCase = this.cueSearchMatchCaseInput.checked
      this.renderCues()
    })
    this.cueSearchWholeWordsInput?.addEventListener('change', () => {
      this.cueSearchWholeWords = this.cueSearchWholeWordsInput.checked
      this.renderCues()
    })
  }

  bindPreferenceEvents() {
    this.autosaveToggle?.addEventListener('change', () => {
      this.autosaveEnabled = this.autosaveToggle.checked
      if (!this.autosaveEnabled) {
        this.cancelScheduledAutosave()
      } else if (this.hasUnsavedChanges) {
        this.scheduleAutosave()
      }
      this.updateAutosaveStatus()
    })



    this.adjustFontSizeButtons.increase?.addEventListener('click', () => {
      this.adjustCueFontSize(0.1)
    })

    this.adjustFontSizeButtons.decrease?.addEventListener('click', () => {
      this.adjustCueFontSize(-0.1)
    })

  }

  adjustCueFontSize(deltaEm) {
    const nextSize = Math.min(
      this.maxCueFontSizeEm,
      Math.max(this.minCueFontSizeEm, this.cueFontSizeEm + deltaEm)
    )

    this.cueFontSizeEm = Math.round(nextSize * 10) / 10
    document.documentElement.style.setProperty('--cue-font-size', `${this.cueFontSizeEm}em`)
  }

  // ---------- audio analysis ----------

  async initAudioAnalysis(file) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) {
      console.warn('Web Audio API not available; waveform disabled')
      return
    }

    const audioCtx = new AC()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    this.audioBuffer = audioBuffer

    const { envelope, frameDuration } =
      this.buildEnvelope(audioBuffer)

    this.envelope = envelope
    this.frameDuration = frameDuration

    // re-render cues so they can show waveforms
    if (this.cues.length) {
      this.renderCues()
    }
  }

  buildEnvelope(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const windowSize = 2048 // samples per envelope frame

    const envelope = []
    for (let i = 0; i < channelData.length; i += windowSize) {
      let sum = 0
      let count = 0
      for (let j = i; j < i + windowSize && j < channelData.length; j++) {
        const v = channelData[j]
        sum += v * v
        count++
      }
      const rms = Math.sqrt(sum / count)
      envelope.push(rms)
    }

    const frameDuration = windowSize / sampleRate
    return { envelope, frameDuration }
  }

  // ---------- time helpers ----------





  canUseNativeTranscriptPicker() {
    return Boolean(window.__TAURI__?.dialog?.open && window.__TAURI__?.fs?.readTextFile)
  }

  canFindMatchingMedia() {
    return Boolean(window.__TAURI__?.core?.invoke && window.__TAURI__?.core?.convertFileSrc)
  }

  async openNativeTranscriptFile() {
    const selectedPath = await window.__TAURI__.dialog.open({
      multiple: false,
      filters: [{ name: 'Transcripts', extensions: ['json', 'vtt'] }]
    })

    if (!selectedPath || Array.isArray(selectedPath)) return

    const text = await window.__TAURI__.fs.readTextFile(selectedPath)
    this.loadTranscriptText(text, {
      fileName: this.getPathFileName(selectedPath),
      sourcePath: selectedPath
    })
  }

  async loadMatchingMediaForTranscript(transcriptPath) {
    if (!transcriptPath || !this.canFindMatchingMedia()) return
    if (this.mediaLoadedFromPath && this.mediaLoadedFromPath !== this.autoLoadedMediaPath) return

    const mediaPath = await window.__TAURI__.core.invoke('find_matching_media', {
      transcriptPath
    })
    if (!mediaPath || mediaPath === this.mediaLoadedFromPath) return

    await this.loadMediaFromPath(mediaPath)
    this.autoLoadedMediaPath = mediaPath
    this.mediaLoadedFromPath = mediaPath
    this.updateMediaLoadControlVisibility()
    window.cuebertLog?.('info', 'auto-loaded-matching-media', {
      transcriptPath,
      mediaPath
    })
  }

  async loadMediaForTranscript(transcriptPath, sourceData) {
    if (!this.canFindMatchingMedia()) return
    if (this.mediaLoadedFromPath && this.mediaLoadedFromPath !== this.autoLoadedMediaPath) return

    const metadataMediaPath = this.getTranscriptMetadataMediaPath(sourceData)
    if (metadataMediaPath) {
      try {
        await this.loadMediaFromPath(metadataMediaPath)
        this.autoLoadedMediaPath = metadataMediaPath
        this.mediaLoadedFromPath = metadataMediaPath
        this.updateMediaLoadControlVisibility()
        window.cuebertLog?.('info', 'loaded-transcript-metadata-media', {
          transcriptPath,
          mediaPath: metadataMediaPath
        })
        return
      } catch (err) {
        console.warn('Metadata media load failed; trying matching filename:', err)
      }
    }

    await this.loadMatchingMediaForTranscript(transcriptPath)
  }

  async loadMediaFromPath(mediaPath) {
    const mediaUrl = window.__TAURI__.core.convertFileSrc(mediaPath)
    let blob = null

    try {
      const response = await fetch(mediaUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      blob = await response.blob()
    } catch (err) {
      this.video.removeAttribute('src')
      this.transportController.updateUi()
      throw err
    }

    this.video.src = mediaUrl
    this.transportController.updateUi()
    this.ensurePreviewTrackShowing()

    try {
      await this.initAudioAnalysis(blob)
    } catch (err) {
      console.warn('Auto-loaded media is playable, but waveform analysis failed:', err)
    }
  }

  getTranscriptMetadataMediaPath(sourceData) {
    const media = sourceData?.metadata?.media
    if (typeof media === 'string') return media.trim()
    if (media && typeof media.path === 'string') return media.path.trim()
    return ''
  }

  updateMediaLoadControlVisibility(sourceData = this.loadedTranscript) {
    if (!this.mediaLoadControl) return
    this.mediaLoadControl.hidden = Boolean(
      this.getTranscriptMetadataMediaPath(sourceData) || this.mediaLoadedFromPath
    )
  }

  loadTranscriptText(text, { fileName = '', sourcePath = null } = {}) {
    const document = this.transcriptDocument.parseText(text, { fileName, sourcePath })
    this.cues = document.cues
    this.loadedTranscript = document.sourceData
    this.loadedTranscriptFormat = document.format
    this.loadedTranscriptPath = document.path
    this.manualSpeakers = []
    this.cueSearchQuery = ''
    if (this.cueSearchInput) this.cueSearchInput.value = ''
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = null
    this.renderSpeakerEditor()
    this.renderCues()
    this.refreshPreviewTrack()
    this.loadMediaForTranscript(sourcePath, document.sourceData).catch(err => {
      console.warn('Transcript media load failed:', err)
    })
    this.saveBtn.disabled = document.format !== 'atrain-json'
    this.downloadBtn.disabled = false
    this.downloadTextBtn.disabled = false
    this.updateMediaLoadControlVisibility(document.sourceData)
    window.cuebertLog?.('info', 'loaded-transcript', {
      fileName,
      sourcePath,
      format: document.format,
      cueCount: document.cues.length,
      autosave: this.getAutosaveAvailability()
    })
    this.updateAutosaveStatus()
  }

  refreshPreviewTrack() {
    if (!this.previewTrack) return
    this.previewTrackRefreshTimer = null

    this.clearPreviewCueListeners()
    const vtt = this.transcriptDocument.buildVttContents(this.cues)
    const nextUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
    const previousUrl = this.previewTrackUrl

    this.previewTrackUrl = nextUrl
    this.previewTrack.src = nextUrl
    this.ensurePreviewTrackShowing()

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl)
    }
  }

  schedulePreviewTrackRefresh() {
    if (this.previewTrackRefreshTimer) return

    this.previewTrackRefreshTimer = window.setTimeout(() => {
      this.refreshPreviewTrack()
    }, 0)
  }

  cancelScheduledPreviewTrackRefresh() {
    if (!this.previewTrackRefreshTimer) return

    window.clearTimeout(this.previewTrackRefreshTimer)
    this.previewTrackRefreshTimer = null
  }

  markDirty() {
    this.hasUnsavedChanges = true
    this.changeRevision++
    this.schedulePreviewTrackRefresh()
    this.scheduleAutosave()
    this.updateAutosaveStatus()
  }

  afterCueChange({ speakersChanged = true } = {}) {
    if (speakersChanged) {
      this.renderSpeakerEditor()
    }

    this.renderCues()
    this.markDirty()
  }
  
  markMediaPathChanged() {
    if (this.loadedTranscriptFormat !== 'atrain-json' || !this.loadedTranscript) return
    this.markDirty()
  }

  scheduleAutosave() {
    this.cancelScheduledAutosave()

    if (!this.autosaveEnabled || !this.canAutosave()) return

    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null
      this.autosave().catch(error => {
        console.error('Autosave failed:', error)
        this.updateAutosaveStatus(`Autosave failed: ${error?.message ?? error}`)
      })
    }, this.autosaveDelayMs)
  }

  cancelScheduledAutosave() {
    if (this.autosaveTimer) {
      window.clearTimeout(this.autosaveTimer)
      this.autosaveTimer = null
    }
  }

  getAutosaveAvailability() {
    return this.autosaveController.getAvailability({
      loadedTranscriptPath: this.loadedTranscriptPath,
      loadedTranscriptFormat: this.loadedTranscriptFormat
    })
  }

  hasAutosaveWriterForTarget(targetPath) {
    return this.autosaveController.hasWriterForTarget(targetPath)
  }

  getAutosaveTargetPath() {
    return this.autosaveController.getTargetPath({
      loadedTranscriptPath: this.loadedTranscriptPath,
      loadedTranscriptFormat: this.loadedTranscriptFormat
    })
  }

  canAutosave() {
    return this.getAutosaveAvailability().available
  }

  logAutosaveDiagnostic(message, detail = {}) {
    const payload = {
      ...detail,
      autosave: this.getAutosaveAvailability(),
      hasUnsavedChanges: this.hasUnsavedChanges,
      autosaveEnabled: this.autosaveEnabled
    }
    const signature = JSON.stringify({ message, payload })
    if (signature === this.lastAutosaveDiagnosticSignature) return

    this.lastAutosaveDiagnosticSignature = signature
    window.cuebertLog?.('info', message, payload)
  }

  async autosave() {
    if (!this.hasUnsavedChanges || !this.autosaveEnabled || !this.canAutosave()) {
      this.logAutosaveDiagnostic('autosave-skipped')
      this.updateAutosaveStatus()
      return
    }

    if (this.autosaveInFlight) {
      this.autosaveQueued = true
      return
    }

    this.autosaveInFlight = true
    this.updateAutosaveStatus('Autosaving...')

    try {
      const revision = this.changeRevision
      const contents = this.buildLoadedTranscriptContents()
      const targetPath = this.getAutosaveTargetPath()
      if (!targetPath) throw new Error('Autosave target path is unavailable')

      const previousPath = this.loadedTranscriptPath
      await this.writeAutosaveContents(targetPath, contents)
      if (revision === this.changeRevision) {
        if (targetPath !== previousPath) {
          this.loadedTranscriptPath = targetPath
          this.updateMediaLoadControlVisibility()
        }
        this.hasUnsavedChanges = false
        this.syncLoadedTranscriptMetadata()
      } else {
        this.hasUnsavedChanges = true
        this.autosaveQueued = true
      }
      this.lastAutosavedAt = new Date()
      window.cuebertLog?.('info', 'autosaved-transcript', {
        previousPath,
        targetPath,
        createdCuebertJson: targetPath !== previousPath
      })
      this.updateAutosaveStatus()
    } finally {
      this.autosaveInFlight = false
    }

    if (this.autosaveQueued) {
      this.autosaveQueued = false
      this.scheduleAutosave()
    }
  }

  async writeAutosaveContents(targetPath, contents) {
    await this.autosaveController.writeContents({
      sourcePath: this.loadedTranscriptPath,
      targetPath,
      contents
    })
  }

  buildLoadedTranscriptContents() {
    return this.transcriptDocument.buildContents({
      format: this.loadedTranscriptFormat,
      cues: this.cues,
      sourceData: this.loadedTranscript,
      mediaPath: this.mediaLoadedFromPath,
      speakers: this.getUniqueSpeakers(),
      title: this.getTranscriptTitle()
    })
  }

  updateAutosaveStatus(message = null) {
    if (!this.autosaveStatus) return

    if (message) {
      this.autosaveStatus.textContent = message
      this.autosaveStatus.dataset.state = message.toLowerCase().includes('fail')
        ? 'error'
        : 'saving'
      return
    }

    if (!this.cues.length) {
      this.autosaveStatus.textContent = 'Autosave ready'
      this.autosaveStatus.dataset.state = 'idle'
      return
    }

    if (!this.autosaveEnabled) {
      this.autosaveStatus.textContent = this.hasUnsavedChanges
        ? 'Unsaved changes'
        : 'Autosave off'
      this.autosaveStatus.dataset.state = this.hasUnsavedChanges ? 'dirty' : 'idle'
      return
    }

    const autosave = this.getAutosaveAvailability()
    if (!autosave.available) {
      this.autosaveStatus.textContent = this.getAutosaveUnavailableMessage(autosave)
      this.autosaveStatus.dataset.state = 'idle'
      this.logAutosaveDiagnostic('autosave-unavailable')
      return
    }

    if (this.autosaveTimer) {
      this.autosaveStatus.textContent = 'Autosave pending'
      this.autosaveStatus.dataset.state = 'dirty'
      return
    }

    if (this.hasUnsavedChanges) {
      this.autosaveStatus.textContent = 'Unsaved changes'
      this.autosaveStatus.dataset.state = 'dirty'
      return
    }

    this.autosaveStatus.textContent = this.lastAutosavedAt
      ? `Saved ${this.lastAutosavedAt.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      })}`
      : 'Autosave ready'
    this.autosaveStatus.dataset.state = 'saved'
  }

  getAutosaveUnavailableMessage(autosave) {
    return this.autosaveController.getUnavailableMessage(autosave)
  }

  getFilePath(file) {
    return file?.path || file?.webkitRelativePath || null
  }

  getPathFileName(path) {
    return this.autosaveController.getPathFileName(path)
  }

  getTranscriptTitle() {
    return this.transcriptDocument.getTranscriptTitle({
      sourceData: this.loadedTranscript,
      path: this.loadedTranscriptPath,
      getPathFileName: path => this.getPathFileName(path)
    })
  }

  getCuebertJsonDefaultPath() {
    return this.getCuebertJsonFileNameForSource(
      this.loadedTranscriptPath,
      this.getTranscriptTitle()
    )
  }

  getCuebertJsonFileNameForSource(sourcePath, fallbackTitle = this.getTranscriptTitle()) {
    return this.autosaveController.getCuebertJsonFileNameForSource(
      sourcePath,
      fallbackTitle
    )
  }

  markSavedToPath(targetPath) {
    this.loadedTranscriptPath = targetPath
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = new Date()
    this.syncLoadedTranscriptMetadata()
    this.updateMediaLoadControlVisibility()
    this.updateAutosaveStatus()
  }

  syncLoadedTranscriptMetadata() {
    this.loadedTranscript = this.transcriptDocument.syncMetadata({
      format: this.loadedTranscriptFormat,
      sourceData: this.loadedTranscript,
      mediaPath: this.mediaLoadedFromPath,
      speakers: this.getUniqueSpeakers(),
      title: this.getTranscriptTitle()
    })
  }

  ensurePreviewTrackShowing() {
    const previewTextTrack = this.video?.textTracks?.[0]
    if (previewTextTrack) {
      previewTextTrack.mode = 'showing'
    }
  }

  revokePreviewTrackUrl() {
    if (this.previewTrackUrl) {
      URL.revokeObjectURL(this.previewTrackUrl)
      this.previewTrackUrl = null
    }
  }

  async saveTextOutput({ defaultPath, filters, contents, mimeType }) {
    try {
      const tauriDialog = window.__TAURI__?.dialog
      const tauriFs = window.__TAURI__?.fs

      if (tauriDialog?.save && tauriFs?.writeTextFile) {
        const targetPath = await tauriDialog.save({
          defaultPath,
          filters
        })

        if (!targetPath) return

        await tauriFs.writeTextFile(targetPath, contents)
        console.info(`Saved file to ${targetPath}`)
        return targetPath
      }

      const blob = new Blob([contents], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultPath
      a.click()
      URL.revokeObjectURL(url)
      return null
    } catch (error) {
      console.error('Saving file failed:', error)
      alert(`Saving file failed: ${error?.message ?? error}`)
    }
  }

  // ---------- cue rendering ----------

  setActiveCue(cue, element, options = {}) {
    this.activeCue = cue
    this.activeCueElement = element
    if (options.scroll && element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  focusCueText(cue, options = {}) {
    const cueEditor = this.cueElementByCue.get(cue)
    if (!cueEditor) return false

    this.setActiveCue(cue, cueEditor, options)
    cueEditor.focusText?.()
    return true
  }

  navigateCueText(cue, direction) {
    const visibleCues = this.getVisibleCues()
    const currentIndex = visibleCues.indexOf(cue)
    if (currentIndex === -1) return

    const nextCue = visibleCues[currentIndex + direction]
    if (!nextCue) return

    this.focusCueText(nextCue, { scroll: true })
  }

  setPlaybackCue(cue, source = 'playback', options = {}) {
    if (this.playbackCue === cue) return

    const previousCue = this.playbackCue
    if (this.playbackCueElement) {
      this.playbackCueElement.classList.remove('is-playback-active')
    }
    this.playbackCueElement = null
    this.playbackCue = cue
    if (previousCue) {
      this.dispatchEvent(new CustomEvent('cueend', {
        detail: { cue: previousCue, source },
        bubbles: true
      }))
    }
    if (!cue) return

    const element = this.cueElementByCue.get(cue)
    if (!element) return

    this.playbackCueElement = element
    element.classList.add('is-playback-active')
    this.dispatchEvent(new CustomEvent('cuestart', {
      detail: { cue, source },
      bubbles: true
    }))
    this.setActiveCue(cue, element, { scroll: options.scroll })
  }

  clearPlaybackCue(cue, source = 'playback') {
    if (cue && this.playbackCue !== cue) return

    const endedCue = this.playbackCue
    if (this.playbackCueElement) {
      this.playbackCueElement.classList.remove('is-playback-active')
    }
    this.playbackCue = null
    this.playbackCueElement = null

    if (endedCue) {
      this.dispatchEvent(new CustomEvent('cueend', {
        detail: { cue: endedCue, source },
        bubbles: true
      }))
    }
  }

  syncActiveCueToPlayback(source = 'playback') {
    this.updateTransportPlaybackHighlightState(source)
    if (!this.video || this.previewEnd !== null) return
    if (this.video.paused && source !== 'transport-seek') return
    if (!this.transportPlaybackHighlightActive) return

    const currentCue = this.findCueAtTime(this.video.currentTime)
    if (currentCue) {
      this.setPlaybackCue(currentCue, source, { scroll: true })
    } else {
      this.clearPlaybackCue(null, source)
    }
  }

  updateTransportPlaybackHighlightState(source) {
    if (source === 'transport-play' || source === 'transport-seek') {
      this.transportPlaybackHighlightActive = true
      return
    }

    if (source === 'cue-preview' || source === 'trackload') {
      this.transportPlaybackHighlightActive = false
      this.clearPlaybackCue(null, source)
    }
  }

  findCueAtTime(time) {
    if (!Number.isFinite(time)) return null

    return this.cues.find(cue =>
      Number.isFinite(cue?.start) &&
      Number.isFinite(cue?.end) &&
      time >= cue.start &&
      time < cue.end
    ) ?? null
  }

  bindPreviewCueEvents() {
    this.clearPreviewCueListeners()

    const textTrack = this.previewTrack?.track
    const trackCues = textTrack?.cues ? Array.from(textTrack.cues) : []
    if (!trackCues.length) return

    trackCues.forEach((trackCue, index) => {
      const cue = this.cues[index]
      if (!cue) return

      const onEnter = () => {
        if (this.previewEnd !== null) return
        this.syncActiveCueToPlayback('texttrack-enter')
      }
      const onExit = () => {
        this.clearPlaybackCue(cue, 'texttrack-exit')
        this.syncActiveCueToPlayback('texttrack-exit')
      }

      trackCue.addEventListener('enter', onEnter)
      trackCue.addEventListener('exit', onExit)
      this.previewCueListeners.push({ trackCue, onEnter, onExit })
    })
  }

  clearPreviewCueListeners() {
    this.previewCueListeners.forEach(({ trackCue, onEnter, onExit }) => {
      trackCue.removeEventListener('enter', onEnter)
      trackCue.removeEventListener('exit', onExit)
    })
    this.previewCueListeners = []
  }

  getUniqueSpeakers() {
    return this.speakerController.getUniqueSpeakers({
      manualSpeakers: this.manualSpeakers,
      cues: this.cues
    })
  }

  renameSpeaker(fromSpeaker, toSpeaker) {
    const result = this.speakerController.renameSpeaker({
      manualSpeakers: this.manualSpeakers,
      cues: this.cues,
      fromSpeaker,
      toSpeaker
    })
    if (!result.changed) return

    this.manualSpeakers = result.manualSpeakers
    this.afterCueChange()
  }

  setCueSpeaker(cue, speaker, cueEditor = null) {
    const previousSpeakers = this.getUniqueSpeakers()
    if (!this.speakerController.setCueSpeaker(cue, speaker)) return

    const nextSpeakers = this.getUniqueSpeakers()
    this.updateRenderedSpeakerOptions(nextSpeakers)
    cueEditor?.updateSpeakerPill?.()

    if (this.haveSpeakersChanged(previousSpeakers, nextSpeakers)) {
      this.renderSpeakerEditor()
    }

    this.markDirty()
  }

  updateRenderedSpeakerOptions(speakers) {
    this.cueElementByCue?.forEach(cueEditor => {
      cueEditor.speakerOptions = speakers
    })
  }

  haveSpeakersChanged(previousSpeakers, nextSpeakers) {
    if (previousSpeakers.length !== nextSpeakers.length) return true

    return previousSpeakers.some((speaker, index) => speaker !== nextSpeakers[index])
  }



  setCueBoundary(cue, edge, time) {
    const preview = this.getCueBoundaryPreview(cue, edge, time)
    cue[preview.edge] = preview.time
    return preview.edge
  }

  getCueBoundaryPreview(cue, edge, time) {
    const minCueDuration = 0.05
    const mediaDuration = this.transportController.getMediaDuration()
    const maxTime = mediaDuration || Math.max(cue.end, time, 0)

    if (edge === 'start') {
      return {
        edge: 'start',
        time: this.clamp(time, 0, Math.max(0, cue.end - minCueDuration))
      }
    }

    return {
      edge: 'end',
      time: this.clamp(time, cue.start + minCueDuration, maxTime)
    }
  }

  clamp(value, min, max) {
    const numericValue = Number.isFinite(value) ? value : min
    return Math.min(max, Math.max(min, numericValue))
  }

  getCueSplitTime(cue) {
    const currentTime = this.video?.currentTime
    if (
      Number.isFinite(currentTime) &&
      currentTime > cue.start &&
      currentTime < cue.end
    ) {
      return currentTime
    }

    return cue.start + (cue.end - cue.start) / 2
  }

  splitCueText(text, selectionStart = null) {
    if (!text) return ['', '']

    const splitIndex = this.getTextSplitIndex(text, selectionStart)
    return [
      text.slice(0, splitIndex).trim(),
      text.slice(splitIndex).trim()
    ]
  }

  getTextSplitIndex(text, selectionStart = null) {
    if (
      Number.isInteger(selectionStart) &&
      selectionStart > 0 &&
      selectionStart < text.length
    ) {
      return selectionStart
    }

    const midpoint = Math.floor(text.length / 2)
    const afterSpace = text.indexOf(' ', midpoint)
    const beforeSpace = text.lastIndexOf(' ', midpoint)

    if (afterSpace === -1) return beforeSpace === -1 ? midpoint : beforeSpace
    if (beforeSpace === -1) return afterSpace

    return (afterSpace - midpoint) < (midpoint - beforeSpace)
      ? afterSpace
      : beforeSpace
  }

  joinCueText(firstText = '', secondText = '') {
    return [firstText, secondText]
      .map(text => (text || '').trim())
      .filter(Boolean)
      .join('\n')
  }

  createCueId(baseId, suffix) {
    const nextId = `${baseId ?? this.cues.length + 1}-${suffix}`
    return this.cues.some(cue => String(cue.id) === nextId)
      ? `${nextId}-${Date.now()}`
      : nextId
  }

  splitCue(cue, selection = {}) {
    splitCueOperation.call(this, cue, selection)
  }

  mergeCues(targetCue, mergedCue) {
    mergeCuesOperation.call(this, targetCue, mergedCue)
  }

  deleteCue(cue) {
    deleteCueOperation.call(this, cue)
  }

  addSpeaker(speaker) {
    if (!this.speakerController.normalizeSpeaker(speaker)) return

    const result = this.speakerController.addSpeaker({
      manualSpeakers: this.manualSpeakers,
      cues: this.cues,
      speaker
    })
    this.manualSpeakers = result.manualSpeakers

    if (this.addSpeakerInput) this.addSpeakerInput.value = ''
    this.renderSpeakerEditor()
    this.renderCues()
  }

  renderSpeakerEditor() {
    if (!this.editSpeakersBtn || !this.speakerList) return

    const speakers = this.getUniqueSpeakers()
    this.editSpeakersBtn.hidden = this.cues.length === 0
    if (!speakers.length) {
      this.speakerList.innerHTML = ''
      return
    }

    this.speakerList.innerHTML = ''

    speakers.forEach(speaker => {
      const row = document.createElement('form')
      row.className = 'speaker-row'
      const source = document.createElement('span')
      source.className = 'speaker-source'
      source.textContent = speaker

      const input = document.createElement('input')
      input.className = 'speaker-input'
      input.type = 'text'
      input.value = speaker
      input.setAttribute('aria-label', `Rename ${speaker}`)

      const button = document.createElement('button')
      button.type = 'submit'
      button.className = 'speaker-apply'
      button.textContent = 'Apply'

      row.append(source, input, button)

      row.addEventListener('submit', e => {
        e.preventDefault()
        this.renameSpeaker(speaker, input?.value ?? '')
      })

      this.speakerList.appendChild(row)
    })
  }

  getSearchMatchedCues() {
    return this.cueSearchController.getMatchedCues({
      cues: this.cues,
      query: this.cueSearchQuery,
      matchCase: this.cueSearchMatchCase,
      wholeWords: this.cueSearchWholeWords
    })
  }

  getVisibleCues(searchMatchedCues = this.getSearchMatchedCues()) {
    const query = this.cueSearchQuery.trim()
    if (!query) return this.cues

    return searchMatchedCues
  }

  updateCueSearchCount({ visibleCues, matchedCues }) {
    if (!this.cueSearchCount) return

    const query = this.cueSearchQuery.trim()
    if (!query) {
      this.cueSearchCount.textContent = this.cues.length
        ? `${this.cues.length} cues`
        : ''
      return
    }

    const matchLabel = matchedCues.length === 1 ? 'match' : 'matches'
    this.cueSearchCount.textContent = `${visibleCues.length} of ${this.cues.length} ${matchLabel}`
  }

  renderCues() {
    const matchedCues = this.getSearchMatchedCues()
    const visibleCues = this.getVisibleCues(matchedCues)
    const isSearching = this.cueSearchQuery.trim().length > 0
    this.updateCueSearchCount({ visibleCues, matchedCues })

    this.cueList.data = {
      cues: visibleCues,
      allowMerge: !isSearching,
      video: this.video,
      activeCue: this.activeCue,
      playbackCue: this.playbackCue,
      speakers: this.getUniqueSpeakers(),
      envelope: this.envelope,
      frameDuration: this.frameDuration,
      formatTime,
      handlers: {
        onPlayCue: cue => {
          this.transportController.playTimeRange(cue.start, cue.end)
        },
        onSetSpeaker: (cue, nextSpeaker, cueEditor) => {
          this.setCueSpeaker(cue, nextSpeaker, cueEditor)
        },
        onSplitCue: (cue, selection) => {
          this.splitCue(cue, selection)
        },
        onDeleteCue: cue => {
          this.deleteCue(cue)
        },
        onNavigateCue: (cue, direction) => {
          this.navigateCueText(cue, direction)
        },
        onWaveformSeek: (cue, time, cueEditor) => {
          this.setActiveCue(cue, cueEditor)
          this.video.currentTime = this.clamp(
            time,
            0,
            this.transportController.getMediaDuration()
          )
          this.transportController.updateUi()
        },
        onWaveformBoundaryChange: (cue, { edge, time }, cueEditor) => {
          cueEditor.updateBoundaryPreviewLabels(
            this.getCueBoundaryPreview(cue, edge, time)
          )
        },
        onWaveformBoundaryCommit: (cue, { edge, time }, cueEditor) => {
          const nextEdge = this.setCueBoundary(cue, edge, time)
          cueEditor.updateTimeLabels()
          cueEditor.renderWaveform()
          this.transportController.playBoundaryPreview(cue, nextEdge)
          this.markDirty()
        },
        onFocusCue: (cue, cueEditor) => {
          this.setActiveCue(cue, cueEditor)
        },
        onCueChange: () => {
          this.markDirty()
        },
        onMergeCues: (previousCue, nextCue) => {
          this.mergeCues(previousCue, nextCue)
        }
      }
    }

    this.cueElementByCue = this.cueList.cueElementByCue
    this.activeCueElement = this.cueList.activeCueElement
    this.playbackCueElement = this.cueList.playbackCueElement

    this.bindPreviewCueEvents()
  }
}

customElements.define('cue-bert', SubtitleEditor)
export { SubtitleEditor }
