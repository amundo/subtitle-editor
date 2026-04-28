// SubtitleEditor.js
import './cue-editor/CueEditor.js'

class SubtitleEditor extends HTMLElement {
  constructor() {
    super()
    this.cues = []
    this.manualSpeakers = []
    this.loadedTranscript = null
    this.loadedTranscriptFormat = null
    this.loadedTranscriptPath = null
    this.previewEnd = null
    this.previewTrackUrl = null
    this.cueFontSizeEm = 1
    this.minCueFontSizeEm = 0.6
    this.maxCueFontSizeEm = 2
    this.autosaveEnabled = true
    this.autosaveDelayMs = 1200
    this.autosaveTimer = null
    this.autosaveInFlight = false
    this.autosaveQueued = false
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = null

    // audio analysis
    this.audioBuffer = null
    this.envelope = null
    this.frameDuration = null
    this.valleys = null

    // active cue for focused editor state
    this.activeCue = null
    this.activeCueElement = null
  }

  connectedCallback() {
    this.renderShell()
    this.cacheElements()
    this.bindEvents()
  }

  disconnectedCallback() {
    this.cancelScheduledAutosave()
    this.revokePreviewTrackUrl()
  }

  renderShell() {
    this.innerHTML = `
        <header class="top-toolbar">
          <img id="cuebert-logo" src="../icons/cuebert-logo.svg" alt="Cuebert logo" class="logo">
          <span class="file-inputs">
            <label class="file-load-button">
              <span>Load media</span>
              <input class="visually-hidden-file" type="file" data-role="videoFile" accept="video/*,audio/*">
            </label>
            <label class="file-load-button">
              <span>Load aTrain</span>
              <input class="visually-hidden-file" type="file" data-role="vttFile" accept=".vtt,.json,application/json,text/vtt">
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
              <button data-role="saveBtn" disabled>aTrain</button>
              <button data-role="downloadTextBtn" disabled>TXT</button>
              <button data-role="downloadBtn" disabled>VTT</button>
            </div>
          </div>
          <div data-role="cueList" class="cue-list"></div>
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
            <button data-role="mediaMuteBtn" class="transport-button" type="button" aria-label="Mute">▮))</button>
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
    this.video.addEventListener('timeupdate', () => {
      this.updateTransportUi()
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
    })

    this.video.addEventListener('pause', () => {
      this.updateTransportUi()
    })

    this.videoFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      this.video.src = URL.createObjectURL(file)
      this.updateTransportUi()
      this.ensurePreviewTrackShowing()
      // kick off async audio analysis
      this.initAudioAnalysis(file).catch(err => {
        console.error('Audio analysis failed:', err)
      })
    })
    this.vttFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      file.text().then(text => {
        const parsed = this.parseSubtitleFile(text, file.name)
        this.cues = parsed.cues
        this.loadedTranscript = parsed.sourceData
        this.loadedTranscriptFormat = parsed.format
        this.loadedTranscriptPath = this.getFilePath(file)
        this.manualSpeakers = []
        this.hasUnsavedChanges = false
        this.changeRevision = 0
        this.lastAutosavedAt = null
        this.renderSpeakerEditor()
        this.renderCues()
        this.refreshPreviewTrack()
        this.saveBtn.disabled = parsed.format !== 'atrain-json'
        this.downloadBtn.disabled = false
        this.downloadTextBtn.disabled = false
        this.updateAutosaveStatus()
      }).catch(err => {
        console.error('Subtitle parsing failed:', err)
        alert(
          'Could not parse that subtitle file. This editor currently supports WebVTT and the aTrain/Whisper-style JSON sample format.'
        )
      })
    })

    this.downloadBtn.addEventListener('click', () => {
      this.saveTextOutput({
        defaultPath: 'adjusted-subtitles.vtt',
        filters: [{ name: 'WebVTT', extensions: ['vtt'] }],
        contents: this.buildVtt(this.cues),
        mimeType: 'text/vtt'
      }).then(targetPath => {
        if (targetPath && this.loadedTranscriptFormat === 'vtt') {
          this.markSavedToPath(targetPath)
        }
      })
    })

    this.saveBtn.addEventListener('click', () => {
      if (this.loadedTranscriptFormat !== 'atrain-json' || !this.loadedTranscript) return

      const json = this.buildAtrainJson(this.cues, this.loadedTranscript)
      this.saveTextOutput({
        defaultPath: 'transcription-edited.json',
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
        contents: this.buildPlainText(this.cues),
        mimeType: 'text/plain'
      })
    })

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

    this.autosaveToggle?.addEventListener('change', () => {
      this.autosaveEnabled = this.autosaveToggle.checked
      if (!this.autosaveEnabled) {
        this.cancelScheduledAutosave()
      } else if (this.hasUnsavedChanges) {
        this.scheduleAutosave()
      }
      this.updateAutosaveStatus()
    })

    this.previewTrack?.addEventListener('load', () => {
      this.ensurePreviewTrackShowing()
    })

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

    this.adjustFontSizeButtons.increase?.addEventListener('click', () => {
      this.adjustCueFontSize(0.1)
    })

    this.adjustFontSizeButtons.decrease?.addEventListener('click', () => {
      this.adjustCueFontSize(-0.1)
    })

    this.updateTransportUi()
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
      this.currentTimeLabel.textContent = this.formatTime(currentTime)
    }

    if (this.durationTimeLabel) {
      this.durationTimeLabel.textContent = this.formatTime(duration)
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
      this.mediaMuteBtn.textContent = this.video.muted || this.video.volume === 0 ? '▮×' : '▮))'
      this.mediaMuteBtn.setAttribute('aria-label', this.video.muted ? 'Unmute' : 'Mute')
    }

    if (this.mediaVolume) {
      this.mediaVolume.value = String(this.video.muted ? 0 : this.video.volume)
    }
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

  formatTime(seconds) {
    const s = Math.max(0, seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = (s % 60).toFixed(3)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
      sec
    ).padStart(6, '0')}`
  }

  parseTime(str) {
    const m = str.match(/(\d+):(\d+):(\d+\.\d+)/)
    if (!m) return 0
    return +m[1] * 3600 + +m[2] * 60 + +m[3]
  }

  // ---------- VTT parsing/building ----------

  parseSubtitleFile(text, fileName = '') {
    const trimmed = text.trimStart()
    const looksLikeJson =
      fileName.toLowerCase().endsWith('.json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')

    if (looksLikeJson) {
      try {
        return this.parseAtrainJson(text)
      } catch (err) {
        if (!trimmed.startsWith('WEBVTT')) throw err
      }
    }

    return {
      format: 'vtt',
      cues: this.parseVtt(text),
      sourceData: null
    }
  }

  parseAtrainJson(text) {
    const parsed = JSON.parse(text)
    const segments = Array.isArray(parsed) ? parsed : parsed?.segments

    if (!Array.isArray(segments)) {
      throw new Error('Expected a JSON array or an object with segments[]')
    }

    const cues = segments
      .filter(segment => this.isFiniteNumber(segment?.start) && this.isFiniteNumber(segment?.end))
      .map((segment, index) => {
        const rawText = typeof segment.text === 'string' ? segment.text : ''
        const speaker = this.getSegmentSpeaker(segment)
        return {
          id: segment.id ?? index + 1,
          start: Number(segment.start),
          end: Number(segment.end),
          text: rawText.trim(),
          speaker,
          sourceSegmentId: segment.id ?? index + 1,
          sourceSegmentIds: [segment.id ?? index + 1]
        }
      })

    return {
      format: 'atrain-json',
      cues,
      sourceData: parsed
    }
  }

  getSegmentSpeaker(segment) {
    if (typeof segment?.speaker === 'string' && segment.speaker.trim()) {
      return segment.speaker.trim()
    }

    if (Array.isArray(segment?.words)) {
      const firstWordSpeaker = segment.words.find(word =>
        typeof word?.speaker === 'string' && word.speaker.trim()
      )
      if (firstWordSpeaker) {
        return firstWordSpeaker.speaker.trim()
      }
    }

    return null
  }

  isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
  }

  parseVtt(text) {
    const lines = text.replace(/\r/g, '').split('\n')
    const cues = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i].trim()
      i++
      if (!line || line.startsWith('WEBVTT')) continue

      let id = null
      let timeLine = line
      if (!line.includes('-->')) {
        id = line
        timeLine = (lines[i++] || '').trim()
      }

      const m = timeLine.match(/([\d:.]+)\s*-->\s*([\d:.]+)/)
      if (!m) continue

      const start = this.parseTime(m[1])
      const end = this.parseTime(m[2])

      const textLines = []
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i++])
      }
      const cueText = textLines.join('\n')
      cues.push({ id: id ?? cues.length + 1, start, end, text: cueText })
    }
    return cues
  }

  buildVtt(cues) {
    const parts = ['WEBVTT\n']
    for (const cue of cues) {
      parts.push(String(cue.id))
      parts.push(
        `${this.formatTime(cue.start)} --> ${this.formatTime(cue.end)}`
      )
      parts.push(this.formatCueTextForExport(cue))
      parts.push('')
    }
    return parts.join('\n')
  }

  buildPlainText(cues) {
    const parts = []
    let previousSpeaker = null

    cues.forEach(cue => {
      const text = (cue.text || '').trim()
      if (!text) return

      const speaker = typeof cue.speaker === 'string' ? cue.speaker.trim() : ''
      const speakerChanged = speaker && speaker !== previousSpeaker
      const line = speakerChanged ? `[${speaker}] ${text}` : text

      parts.push(line)
      parts.push('')
      previousSpeaker = speaker
    })

    while (parts.length && parts.at(-1) === '') {
      parts.pop()
    }

    return parts.join('\n')
  }

  formatCueTextForExport(cue) {
    const text = (cue.text || '').trim()
    const speaker = typeof cue.speaker === 'string' ? cue.speaker.trim() : ''
    if (!speaker || !text) return text

    const speakerPrefix = `[${speaker}] `
    return text.startsWith(speakerPrefix) ? text : `${speakerPrefix}${text}`
  }

  buildAtrainJson(cues, sourceData) {
    const cloned = structuredClone(sourceData)
    const segments = Array.isArray(cloned) ? cloned : cloned?.segments
    if (!Array.isArray(segments)) return cloned

    const sourceSegmentById = new Map(
      segments.map((segment, index) => [segment.id ?? index + 1, segment])
    )

    const nextSegments = cues.map((cue, index) => {
      const sourceSegmentIds = this.getCueSourceSegmentIds(cue)
      const segment = structuredClone(
        sourceSegmentById.get(sourceSegmentIds[0] ?? cue.id) ?? {}
      )
      const speaker = typeof cue.speaker === 'string' ? cue.speaker.trim() : ''
      const text = (cue.text || '').trim()

      segment.id = index + 1
      segment.start = cue.start
      segment.end = cue.end

      if (speaker) segment.speaker = speaker
      else delete segment.speaker

      segment.text = text ? ` ${text}` : ''

      if (Array.isArray(segment.words)) {
        const sourceWords = sourceSegmentIds
          .flatMap(sourceSegmentId =>
            sourceSegmentById.get(sourceSegmentId)?.words ?? []
          )

        segment.words = sourceWords
          .filter(word =>
            this.isFiniteNumber(word?.start) &&
            this.isFiniteNumber(word?.end) &&
            word.start >= cue.start &&
            word.end <= cue.end
          )
          .map(word => {
            const nextWord = { ...word }
            if (speaker) nextWord.speaker = speaker
            else delete nextWord.speaker
            return nextWord
          })
      }

      return segment
    })

    if (Array.isArray(cloned)) {
      return nextSegments
    }

    cloned.segments = nextSegments
    return cloned
  }

  getCueSourceSegmentIds(cue) {
    if (Array.isArray(cue.sourceSegmentIds) && cue.sourceSegmentIds.length) {
      return cue.sourceSegmentIds
    }

    return [cue.sourceSegmentId ?? cue.id]
  }

  refreshPreviewTrack() {
    if (!this.previewTrack) return

    const vtt = this.buildVtt(this.cues)
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

  canAutosave() {
    return Boolean(
      this.loadedTranscriptPath &&
      window.__TAURI__?.fs?.writeTextFile &&
      ['atrain-json', 'vtt'].includes(this.loadedTranscriptFormat)
    )
  }

  async autosave() {
    if (!this.hasUnsavedChanges || !this.autosaveEnabled || !this.canAutosave()) {
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
      await window.__TAURI__.fs.writeTextFile(this.loadedTranscriptPath, contents)
      if (revision === this.changeRevision) {
        this.hasUnsavedChanges = false
      } else {
        this.hasUnsavedChanges = true
        this.autosaveQueued = true
      }
      this.lastAutosavedAt = new Date()
      this.updateAutosaveStatus()
    } finally {
      this.autosaveInFlight = false
    }

    if (this.autosaveQueued) {
      this.autosaveQueued = false
      this.scheduleAutosave()
    }
  }

  buildLoadedTranscriptContents() {
    if (this.loadedTranscriptFormat === 'atrain-json') {
      const json = this.buildAtrainJson(this.cues, this.loadedTranscript)
      return `${JSON.stringify(json, null, 2)}\n`
    }

    if (this.loadedTranscriptFormat === 'vtt') {
      return this.buildVtt(this.cues)
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

    if (!this.canAutosave()) {
      this.autosaveStatus.textContent = window.__TAURI__?.fs?.writeTextFile
        ? 'Autosave unavailable'
        : 'Autosave desktop only'
      this.autosaveStatus.dataset.state = 'idle'
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

  getFilePath(file) {
    return file?.path || file?.webkitRelativePath || null
  }

  markSavedToPath(targetPath) {
    this.loadedTranscriptPath = targetPath
    this.hasUnsavedChanges = false
    this.changeRevision = 0
    this.lastAutosavedAt = new Date()
    this.updateAutosaveStatus()
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

  setActiveCue(cue, element) {
    this.activeCue = cue
    if (this.activeCueElement && this.activeCueElement !== element) {
      this.activeCueElement.classList.remove('is-active')
    }
    this.activeCueElement = element
    if (element) element.classList.add('is-active')
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

    this.renderSpeakerEditor()
    this.renderCues()
    this.markDirty()
  }

  setCueSpeaker(cue, speaker) {
    const nextSpeaker = typeof speaker === 'string' ? speaker.trim() : ''
    cue.speaker = nextSpeaker || null
    this.renderSpeakerEditor()
    this.renderCues()
    this.markDirty()
  }

  splitCue(cue, selection = {}) {
    const index = this.cues.indexOf(cue)
    if (index === -1) return

    const splitTime = this.getCueSplitTime(cue)
    if (splitTime <= cue.start || splitTime >= cue.end) return

    const [beforeText, afterText] = this.splitCueText(
      cue.text || '',
      selection.selectionStart
    )
    const nextCue = {
      ...cue,
      id: this.createCueId(cue.id, 'b'),
      start: splitTime,
      end: cue.end,
      text: afterText,
      sourceSegmentIds: this.getCueSourceSegmentIds(cue)
    }

    cue.id = this.createCueId(cue.id, 'a')
    cue.end = splitTime
    cue.text = beforeText
    cue.sourceSegmentIds = this.getCueSourceSegmentIds(cue)

    this.cues.splice(index + 1, 0, nextCue)
    this.renderSpeakerEditor()
    this.renderCues()
    this.markDirty()
  }

  mergeCues(targetCue, mergedCue) {
    const mergedIndex = this.cues.indexOf(mergedCue)
    if (mergedIndex === -1) return

    targetCue.start = Math.min(targetCue.start, mergedCue.start)
    targetCue.end = Math.max(targetCue.end, mergedCue.end)
    targetCue.text = this.joinCueText(targetCue.text, mergedCue.text)
    targetCue.sourceSegmentIds = [
      ...new Set([
        ...this.getCueSourceSegmentIds(targetCue),
        ...this.getCueSourceSegmentIds(mergedCue)
      ])
    ]
    if (!targetCue.speaker && mergedCue.speaker) {
      targetCue.speaker = mergedCue.speaker
    }

    this.cues.splice(mergedIndex, 1)
    this.renderSpeakerEditor()
    this.renderCues()
    this.markDirty()
  }

  deleteCue(cue) {
    const index = this.cues.indexOf(cue)
    if (index === -1) return

    this.cues.splice(index, 1)
    if (this.activeCue === cue) {
      this.activeCue = null
      this.activeCueElement = null
    }

    this.renderSpeakerEditor()
    this.renderCues()
    this.markDirty()
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
      this.isFiniteNumber(currentTime) &&
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
    this.cueList.innerHTML = ''

    this.cues.forEach((cue, index) => {
      if (index > 0) {
        this.cueList.appendChild(this.createMergeCueRow(
          this.cues[index - 1],
          cue
        ))
      }

      const ce = document.createElement('cue-editor')
      ce.data = cue
      ce.video = this.video
      ce.formatTime = this.formatTime.bind(this)
      ce.speakerOptions = this.getUniqueSpeakers()

      // waveform props (will be null until analysis is ready)
      ce.envelope = this.envelope
      ce.frameDuration = this.frameDuration
      ce.contextWindow = 0.75

      // callbacks
      ce.onPlayCue = c => {
        this.playTimeRange(c.start, c.end)
      }

      ce.onSnapStartToNow = () => {
        cue.start = this.video.currentTime
        if (cue.start > cue.end) cue.start = cue.end
        this.renderCues()
        this.markDirty()
      }

      ce.onSnapEndToNow = () => {
        cue.end = this.video.currentTime
        if (cue.end < cue.start) cue.end = cue.start
        this.renderCues()
        this.markDirty()
      }

      ce.onExtendStartBackward = () => {
        cue.start = this.findPrevValleyTime(cue.start)
        this.renderCues()
        this.markDirty()
      }

      ce.onExtendEndForward = () => {
        cue.end = this.findNextValleyTime(cue.end)
        this.renderCues()
        this.markDirty()
      }

      ce.onSetSpeaker = nextSpeaker => {
        this.setCueSpeaker(cue, nextSpeaker)
      }

      ce.onSplitCue = selection => {
        this.splitCue(cue, selection)
      }

      ce.onDeleteCue = () => {
        this.deleteCue(cue)
      }

      ce.onWaveformSeek = time => {
        this.setActiveCue(cue, ce)
        this.video.currentTime = this.clamp(time, 0, this.getMediaDuration())
        this.updateTransportUi()
      }

      ce.onWaveformBoundaryChange = ({ edge, time }) => {
        this.setCueBoundary(cue, edge, time)
        ce.updateTimeLabels()
        ce.renderWaveform()
        this.updateTransportUi()
      }

      ce.onWaveformBoundaryCommit = ({ edge, time }) => {
        const nextEdge = this.setCueBoundary(cue, edge, time)
        ce.updateTimeLabels()
        ce.renderWaveform()
        this.playBoundaryPreview(cue, nextEdge)
        this.markDirty()
      }

      ce.addEventListener('focusin', () => {
        this.setActiveCue(cue, ce)
      })
      ce.addEventListener('click', () => {
        this.setActiveCue(cue, ce)
      })
      ce.addEventListener('cuechange', () => {
        this.markDirty()
      })

      this.cueList.appendChild(ce)
    })
  }

  createMergeCueRow(previousCue, nextCue) {
    const row = document.createElement('div')
    row.className = 'cue-merge-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cue-merge-button'
    button.textContent = 'Merge cues'
    button.title = 'Merge the cue above with the cue below'
    button.addEventListener('click', () => {
      this.mergeCues(previousCue, nextCue)
    })

    row.appendChild(button)
    return row
  }
}

customElements.define('subtitle-editor', SubtitleEditor)
export { SubtitleEditor }
