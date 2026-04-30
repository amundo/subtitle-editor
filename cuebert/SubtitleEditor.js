// SubtitleEditor.js
import './cue-editor/CueEditor.js'
import './cue-list-view/CueListView.js'
import { formatTime, parseTime } from './services/time.js'
import {
  parseSubtitleFile,
  parseVtt,
  parseAtrainJson
} from './services/TranscriptParser.js'
import {
  buildVtt,
  buildPlainText,
  buildAtrainJson
} from './services/TranscriptExporter.js'

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

    // display preferences
    this.cueFontSizeEm = 1
    this.minCueFontSizeEm = 0.6
    this.maxCueFontSizeEm = 2

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

    // audio analysis state
    this.audioBuffer = null
    this.envelope = null
    this.frameDuration = null
    this.valleys = null

    // cue focus/playback UI state
    this.activeCue = null
    this.activeCueElement = null
    this.cueElementByCue = new Map()
    this.playbackCue = null
    this.playbackCueElement = null
    this.previewCueListeners = []
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
            <button data-role="mediaMuteBtn" class="transport-button" type="button" aria-label="Mute">${this.renderVolumeIcon(false)}</button>
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
    this.saveBtn = this.querySelector('[data-role="saveBtn"]')
    this.downloadBtn = this.querySelector('[data-role="downloadBtn"]')
    this.downloadTextBtn = this.querySelector('[data-role="downloadTextBtn"]')
    this.autosaveStatus = this.querySelector('[data-role="autosaveStatus"]')
    this.autosaveToggle = this.querySelector('[data-role="autosaveToggle"]')
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
    this.bindVideoEvents()
    this.bindFileEvents()
    this.bindExportEvents()
    this.bindSpeakerEvents()
    this.bindTransportControls()
    this.bindPreferenceEvents()

    this.updateTransportUi()
  }

  bindVideoEvents() {
    this.video.addEventListener('timeupdate', () => {
      this.updateTransportUi()
      this.syncActiveCueToPlayback('timeupdate')
      if (this.previewEnd !== null && this.video.currentTime >= this.previewEnd) {
        this.video.pause()
        this.previewEnd = null
      }
    })

    this.video.addEventListener('loadedmetadata', () => {
      this.updateTransportUi()
    })

    this.video.addEventListener('durationchange', () => {
      this.updateTransportUi()
    })

    this.video.addEventListener('play', () => {
      this.updateTransportUi()
      this.syncActiveCueToPlayback('play')
    })

    this.video.addEventListener('pause', () => {
      this.updateTransportUi()
    })

    this.previewTrack?.addEventListener('load', () => {
      this.ensurePreviewTrackShowing()
      this.bindPreviewCueEvents()
      this.syncActiveCueToPlayback('trackload')
    })
  }

  bindFileEvents() {
    this.videoFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      this.mediaLoadedFromPath = this.getFilePath(file)
      this.autoLoadedMediaPath = null
      this.video.src = URL.createObjectURL(file)
      this.updateTransportUi()
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
        contents: buildVtt(this.cues),
        mimeType: 'text/vtt'
      }).then(targetPath => {
        if (targetPath && this.loadedTranscriptFormat === 'vtt') {
          this.markSavedToPath(targetPath)
        }
      })
    })

    this.saveBtn.addEventListener('click', () => {
      if (this.loadedTranscriptFormat !== 'atrain-json' || !this.loadedTranscript) return

      const json = buildAtrainJson(this.cues, this.loadedTranscript)
      this.saveTextOutput({
        defaultPath: this.getCuebertJsonDefaultPath(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
        contents: JSON.stringify(json, null, 2),
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
        contents: buildPlainText(this.cues),
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
  bindTransportControls() {

    this.mediaPlayBtn?.addEventListener('click', () => {
      if (!this.video.src) return
      if (this.video.paused) {
        this.video.play().catch(err => {
          console.error('Media playback failed:', err)
        })
      } else {
        this.video.pause()
      }
    })

    this.mediaSeek?.addEventListener('input', () => {
      const nextTime = Number(this.mediaSeek.value)
      if (Number.isFinite(nextTime)) {
        this.video.currentTime = nextTime
        this.updateTransportUi()
      }
    })

    this.mediaMuteBtn?.addEventListener('click', () => {
      this.video.muted = !this.video.muted
      this.updateTransportUi()
    })

    this.mediaVolume?.addEventListener('input', () => {
      const nextVolume = Number(this.mediaVolume.value)
      if (!Number.isFinite(nextVolume)) return

      this.video.volume = Math.min(1, Math.max(0, nextVolume))
      this.video.muted = this.video.volume === 0
      this.updateTransportUi()
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

  updateTransportUi() {
    if (!this.video) return

    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0
    const currentTime = Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0

    if (this.currentTimeLabel) {
      this.currentTimeLabel.textContent = formatTime(currentTime)
    }

    if (this.durationTimeLabel) {
      this.durationTimeLabel.textContent = formatTime(duration)
    }

    if (this.mediaSeek) {
      this.mediaSeek.max = String(duration)
      this.mediaSeek.value = String(Math.min(currentTime, duration || currentTime))
      this.mediaSeek.disabled = duration === 0
    }

    if (this.mediaPlayBtn) {
      this.mediaPlayBtn.textContent = this.video.paused ? '▶' : '❚❚'
      this.mediaPlayBtn.disabled = !this.video.src
      this.mediaPlayBtn.setAttribute('aria-label', this.video.paused ? 'Play' : 'Pause')
    }

    if (this.mediaMuteBtn) {
      this.mediaMuteBtn.innerHTML = this.renderVolumeIcon(this.video.muted || this.video.volume === 0)
      this.mediaMuteBtn.setAttribute('aria-label', this.video.muted ? 'Unmute' : 'Mute')
    }

    if (this.mediaVolume) {
      this.mediaVolume.value = String(this.video.muted ? 0 : this.video.volume)
    }
  }

  renderVolumeIcon(muted) {
    const waves = muted
      ? '<line x1="18" y1="9" x2="23" y2="14"></line><line x1="23" y1="9" x2="18" y2="14"></line>'
      : '<path d="M18 9a5 5 0 0 1 0 6"></path><path d="M21 6a9 9 0 0 1 0 12"></path>'

    return `
      <svg class="transport-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
        ${waves}
      </svg>
    `
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

    const { envelope, frameDuration, valleys } =
      this.buildEnvelopeAndValleys(audioBuffer)

    this.envelope = envelope
    this.frameDuration = frameDuration
    this.valleys = valleys

    // re-render cues so they can show waveforms
    if (this.cues.length) {
      this.renderCues()
    }
  }

  buildEnvelopeAndValleys(audioBuffer) {
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

    // very simple valley detection on the smoothed envelope
    const valleys = []
    for (let i = 1; i < envelope.length - 1; i++) {
      if (envelope[i] < envelope[i - 1] && envelope[i] <= envelope[i + 1]) {
        valleys.push(i)
      }
    }

    const frameDuration = windowSize / sampleRate
    return { envelope, frameDuration, valleys }
  }

  findNextValleyTime(afterTime) {
    if (!this.valleys || !this.frameDuration) return afterTime
    const startIndex = Math.floor(afterTime / this.frameDuration)
    const idx = this.valleys.find(i => i > startIndex)
    return idx != null ? idx * this.frameDuration : afterTime
  }

  findPrevValleyTime(beforeTime) {
    if (!this.valleys || !this.frameDuration) return beforeTime
    const startIndex = Math.floor(beforeTime / this.frameDuration)
    for (let k = this.valleys.length - 1; k >= 0; k--) {
      const i = this.valleys[k]
      if (i * this.frameDuration < beforeTime && i < startIndex) {
        return i * this.frameDuration
      }
    }
    return beforeTime
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
      this.updateTransportUi()
      throw err
    }

    this.video.src = mediaUrl
    this.updateTransportUi()
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
    const parsed = parseSubtitleFile(text, fileName)
    this.cues = parsed.cues
    this.loadedTranscript = parsed.sourceData
    this.loadedTranscriptFormat = parsed.format
    this.loadedTranscriptPath = sourcePath
    this.manualSpeakers = []
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = null
    this.renderSpeakerEditor()
    this.renderCues()
    this.refreshPreviewTrack()
    this.loadMediaForTranscript(sourcePath, parsed.sourceData).catch(err => {
      console.warn('Transcript media load failed:', err)
    })
    this.saveBtn.disabled = parsed.format !== 'atrain-json'
    this.downloadBtn.disabled = false
    this.downloadTextBtn.disabled = false
    this.updateMediaLoadControlVisibility(parsed.sourceData)
    window.cuebertLog?.('info', 'loaded-transcript', {
      fileName,
      sourcePath,
      format: parsed.format,
      cueCount: parsed.cues.length,
      autosave: this.getAutosaveAvailability()
    })
    this.updateAutosaveStatus()
  }

  refreshPreviewTrack() {
    if (!this.previewTrack) return

    this.clearPreviewCueListeners()
    const vtt = buildVtt(this.cues)
    const nextUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
    const previousUrl = this.previewTrackUrl

    this.previewTrackUrl = nextUrl
    this.previewTrack.src = nextUrl
    this.ensurePreviewTrackShowing()

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl)
    }
  }

  markDirty() {
    this.hasUnsavedChanges = true
    this.changeRevision++
    this.refreshPreviewTrack()
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
    const hasWriteTextFile = Boolean(window.__TAURI__?.fs?.writeTextFile)
    const hasTranscriptAutosaveCommand = Boolean(window.__TAURI__?.core?.invoke)
    const hasTranscriptPath = Boolean(this.loadedTranscriptPath)
    const isCuebertJson = this.isCuebertJsonPath(this.loadedTranscriptPath)
    const targetPath = this.getAutosaveTargetPath()
    let reason = 'available'

    if (!hasTranscriptPath) {
      reason = 'missing-loadedTranscriptPath'
    } else if (!targetPath) {
      reason = 'unsupported-format'
    } else if (!this.hasAutosaveWriterForTarget(targetPath)) {
      reason = 'missing-transcript-autosave-command'
    }

    return {
      available: reason === 'available',
      reason,
      loadedTranscriptPath: this.loadedTranscriptPath,
      loadedTranscriptFormat: this.loadedTranscriptFormat,
      hasWriteTextFile,
      hasTranscriptAutosaveCommand,
      isCuebertJson,
      targetPath,
      willCreateCuebertJson: this.loadedTranscriptFormat === 'atrain-json' &&
        Boolean(targetPath) &&
        targetPath !== this.loadedTranscriptPath
    }
  }

  hasAutosaveWriterForTarget(targetPath) {
    if (!targetPath) return false
    return Boolean(window.__TAURI__?.core?.invoke)
  }

  getAutosaveTargetPath() {
    if (!this.loadedTranscriptPath) return null
    if (this.loadedTranscriptFormat === 'vtt') return this.loadedTranscriptPath
    if (this.loadedTranscriptFormat !== 'atrain-json') return null
    if (this.isCuebertJsonPath(this.loadedTranscriptPath)) return this.loadedTranscriptPath

    return this.getCuebertJsonPathForSource(this.loadedTranscriptPath)
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
    await window.__TAURI__.core.invoke('write_transcript_autosave', {
      sourcePath: this.loadedTranscriptPath,
      targetPath,
      contents
    })
  }

  buildLoadedTranscriptContents() {
    if (this.loadedTranscriptFormat === 'atrain-json') {
      const json = buildAtrainJson(this.cues, this.loadedTranscript, {
        mediaPath: this.mediaLoadedFromPath,
        speakers: this.getUniqueSpeakers(),
        title: this.getTranscriptTitle()
      })
      return `${JSON.stringify(json, null, 2)}\n`
    }

    if (this.loadedTranscriptFormat === 'vtt') {
      return buildVtt(this.cues)
    }

    throw new Error(`Autosave is not available for ${this.loadedTranscriptFormat}`)
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
    if (!autosave.hasTranscriptAutosaveCommand) return 'Autosave desktop only'
    if (!autosave.loadedTranscriptPath) return 'Open from disk to autosave'

    return 'Autosave unavailable'
  }

  getFilePath(file) {
    return file?.path || file?.webkitRelativePath || null
  }

  getPathFileName(path) {
    return typeof path === 'string'
      ? path.split(/[\\/]/).pop() || ''
      : ''
  }

  getPathDirectory(path) {
    if (typeof path !== 'string') return ''

    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return index === -1 ? '' : path.slice(0, index)
  }

  joinPath(directory, fileName) {
    if (!directory) return fileName
    const separator = directory.includes('\\') ? '\\' : '/'
    return `${directory}${separator}${fileName}`
  }

  getTranscriptTitle() {
    const metadataTitle = this.loadedTranscript?.metadata?.title
    if (typeof metadataTitle === 'string' && metadataTitle.trim()) {
      return metadataTitle.trim()
    }

    const fileName = this.getPathFileName(this.loadedTranscriptPath)
    return fileName ? fileName.replace(/\.[^.]+$/, '') : 'Untitled'
  }

  getCuebertJsonDefaultPath() {
    return this.getCuebertJsonFileNameForSource(this.loadedTranscriptPath)
  }

  getCuebertJsonFileNameForSource(sourcePath) {
    const sourceName = this.getPathFileName(sourcePath)
    const baseName = sourceName
      ? sourceName.replace(/(?:\.cuebert)?\.json$/i, '').replace(/\.[^.]+$/, '')
      : this.getTranscriptTitle()

    return `${baseName || 'transcription'}.cuebert.json`
  }

  getCuebertJsonPathForSource(sourcePath) {
    const directory = this.getPathDirectory(sourcePath)
    return this.joinPath(directory, this.getCuebertJsonFileNameForSource(sourcePath))
  }

  isCuebertJsonPath(path) {
    return typeof path === 'string' && /\.cuebert\.json$/i.test(path)
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
    if (this.loadedTranscriptFormat !== 'atrain-json' || !this.loadedTranscript) return
    if (Array.isArray(this.loadedTranscript)) {
      this.loadedTranscript = {
        metadata: {},
        segments: this.loadedTranscript
      }
    }

    this.loadedTranscript.metadata = {
      ...(this.loadedTranscript.metadata ?? {}),
      title: this.getTranscriptTitle(),
      speakers: this.getUniqueSpeakers(),
      media: this.mediaLoadedFromPath || this.loadedTranscript.metadata?.media || null
    }
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
    if (this.activeCueElement && this.activeCueElement !== element) {
      this.activeCueElement.classList.remove('is-active')
    }
    this.activeCueElement = element
    if (element) element.classList.add('is-active')
    if (options.scroll && element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  setPlaybackCue(cue, source = 'playback') {
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
    this.setActiveCue(cue, element, { scroll: true })
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
    if (!this.video || this.video.paused || this.previewEnd !== null) return

    const currentCue = this.findCueAtTime(this.video.currentTime)
    if (currentCue) {
      this.setPlaybackCue(currentCue, source)
    } else {
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
        this.setPlaybackCue(cue, 'texttrack-enter')
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
    return [...new Set(
      [...this.manualSpeakers, ...this.cues
        .map(cue => (typeof cue.speaker === 'string' ? cue.speaker.trim() : ''))
        .filter(Boolean)]
    )]
  }

  renameSpeaker(fromSpeaker, toSpeaker) {
    const from = typeof fromSpeaker === 'string' ? fromSpeaker.trim() : ''
    const to = typeof toSpeaker === 'string' ? toSpeaker.trim() : ''
    if (!from || !to || from === to) return

    this.manualSpeakers = this.manualSpeakers.map(speaker =>
      speaker === from ? to : speaker
    )
    this.manualSpeakers = [...new Set(this.manualSpeakers)]

    this.cues.forEach(cue => {
      if (cue.speaker === from) {
        cue.speaker = to
      }
    })

    this.afterCueChange()
  }

  setCueSpeaker(cue, speaker) {
    const nextSpeaker = typeof speaker === 'string' ? speaker.trim() : ''
    cue.speaker = nextSpeaker || null
    this.afterCueChange()
  }



  setCueBoundary(cue, edge, time) {
    const minCueDuration = 0.05
    const mediaDuration = this.getMediaDuration()
    const maxTime = mediaDuration || Math.max(cue.end, time, 0)

    if (edge === 'start') {
      cue.start = this.clamp(time, 0, Math.max(0, cue.end - minCueDuration))
      return 'start'
    }

    cue.end = this.clamp(time, cue.start + minCueDuration, maxTime)
    return 'end'
  }

  playBoundaryPreview(cue, edge) {
    const previewDuration = 0.75

    if (edge === 'start') {
      this.playTimeRange(cue.start, Math.min(cue.end, cue.start + previewDuration))
      return
    }

    this.playTimeRange(Math.max(cue.start, cue.end - previewDuration), cue.end)
  }

  playTimeRange(start, end) {
    if (!this.video || !this.video.src) return

    this.previewEnd = Math.max(start, end)
    this.video.currentTime = Math.max(0, start)
    this.updateTransportUi()
    this.video.play().catch(err => {
      console.error('Media playback failed:', err)
    })
  }

  getMediaDuration() {
    return Number.isFinite(this.video?.duration) ? this.video.duration : 0
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

  addSpeaker(speaker) {
    const nextSpeaker = typeof speaker === 'string' ? speaker.trim() : ''
    if (!nextSpeaker) return

    if (!this.getUniqueSpeakers().includes(nextSpeaker)) {
      this.manualSpeakers.push(nextSpeaker)
    }

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

  renderCues() {
    this.cueList.data = {
      cues: this.cues,
      video: this.video,
      activeCue: this.activeCue,
      playbackCue: this.playbackCue,
      speakers: this.getUniqueSpeakers(),
      envelope: this.envelope,
      frameDuration: this.frameDuration,
      formatTime,
      handlers: {
        onPlayCue: cue => {
          this.playTimeRange(cue.start, cue.end)
        },
        onSnapStartToNow: cue => {
          cue.start = this.video.currentTime
          if (cue.start > cue.end) cue.start = cue.end
          this.afterCueChange({ speakersChanged: false })
        },
        onSnapEndToNow: cue => {
          cue.end = this.video.currentTime
          if (cue.end < cue.start) cue.end = cue.start
          this.afterCueChange({ speakersChanged: false })
        },
        onExtendStartBackward: cue => {
          cue.start = this.findPrevValleyTime(cue.start)
          this.afterCueChange({ speakersChanged: false })
        },
        onExtendEndForward: cue => {
          cue.end = this.findNextValleyTime(cue.end)
          this.afterCueChange({ speakersChanged: false })
        },
        onSetSpeaker: (cue, nextSpeaker) => {
          this.setCueSpeaker(cue, nextSpeaker)
        },
        onSplitCue: (cue, selection) => {
          this.splitCue(cue, selection)
        },
        onDeleteCue: cue => {
          this.deleteCue(cue)
        },
        onWaveformSeek: (cue, time, cueEditor) => {
          this.setActiveCue(cue, cueEditor)
          this.video.currentTime = this.clamp(time, 0, this.getMediaDuration())
          this.updateTransportUi()
        },
        onWaveformBoundaryChange: (cue, { edge, time }, cueEditor) => {
          this.setCueBoundary(cue, edge, time)
          cueEditor.updateTimeLabels()
          cueEditor.renderWaveform()
          this.updateTransportUi()
        },
        onWaveformBoundaryCommit: (cue, { edge, time }, cueEditor) => {
          const nextEdge = this.setCueBoundary(cue, edge, time)
          cueEditor.updateTimeLabels()
          cueEditor.renderWaveform()
          this.playBoundaryPreview(cue, nextEdge)
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
