// SubtitleEditor.js
import './cue-editor/CueEditor.js'

class SubtitleEditor extends HTMLElement {
  constructor() {
    super()
    this.cues = []
    this.previewEnd = null

    // audio analysis
    this.audioBuffer = null
    this.envelope = null
    this.frameDuration = null
    this.valleys = null

    // active cue for keyboard shortcuts
    this.activeCue = null
    this.activeCueElement = null

    this._onKeyDown = this._onKeyDown.bind(this)
  }

  connectedCallback() {
    this.renderShell()
    this.cacheElements()
    this.bindEvents()
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._onKeyDown)
  }

  renderShell() {
    this.innerHTML = `
      <div class="subtitle-editor">
        <div class="media-column">
          <div class="controls">
            <label>Video:
              <input type="file" data-role="videoFile" accept="video/*">
            </label>
            <label>Subtitles (.vtt):
              <input type="file" data-role="vttFile" accept=".vtt">
            </label>
          </div>
          <video data-role="video" controls></video>
          <div class="current-time-row">
            Current time:
            <span data-role="currentTime" class="time-label">00:00:00.000</span>
          </div>
          <p class="hint">
            Esc: play/pause · [ set start to current time · ] set end to current time
          </p>
        </div>

        <div class="cues-column">
          <div class="cue-panel-header">
            <strong>Cues</strong>
            <button data-role="downloadBtn" disabled>Download updated VTT</button>
          </div>
          <div data-role="cueList" class="cue-list"></div>
        </div>
      </div>
    `
  }

  cacheElements() {
    this.video = this.querySelector('[data-role="video"]')
    this.currentTimeLabel = this.querySelector('[data-role="currentTime"]')
    this.videoFileInput = this.querySelector('[data-role="videoFile"]')
    this.vttFileInput = this.querySelector('[data-role="vttFile"]')
    this.cueList = this.querySelector('[data-role="cueList"]')
    this.downloadBtn = this.querySelector('[data-role="downloadBtn"]')
  }

  bindEvents() {
    this.video.addEventListener('timeupdate', () => {
      this.currentTimeLabel.textContent = this.formatTime(this.video.currentTime)
      if (this.previewEnd !== null && this.video.currentTime >= this.previewEnd) {
        this.video.pause()
        this.previewEnd = null
      }
    })

    this.videoFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      this.video.src = URL.createObjectURL(file)
      // kick off async audio analysis
      this.initAudioAnalysis(file).catch(err => {
        console.error('Audio analysis failed:', err)
      })
    })

    this.vttFileInput.addEventListener('change', e => {
      const file = e.target.files[0]
      if (!file) return
      file.text().then(text => {
        this.cues = this.parseVtt(text)
        this.renderCues()
        this.downloadBtn.disabled = false
      })
    })

    this.downloadBtn.addEventListener('click', () => {
      const vtt = this.buildVtt(this.cues)
      const blob = new Blob([vtt], { type: 'text/vtt' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'adjusted-subtitles.vtt'
      a.click()
      URL.revokeObjectURL(url)
    })

    window.addEventListener('keydown', this._onKeyDown)
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      if (this.video.paused) this.video.play()
      else this.video.pause()
      return
    }

    if (!this.activeCue) return

    if (e.key === '[') {
      // set start to current time
      this.activeCue.start = this.video.currentTime
      if (this.activeCue.start > this.activeCue.end) {
        this.activeCue.start = this.activeCue.end
      }
      this.renderCues()
    } else if (e.key === ']') {
      // set end to current time
      this.activeCue.end = this.video.currentTime
      if (this.activeCue.end < this.activeCue.start) {
        this.activeCue.end = this.activeCue.start
      }
      this.renderCues()
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
      parts.push(cue.text || '')
      parts.push('')
    }
    return parts.join('\n')
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

  renderCues() {
    this.cueList.innerHTML = ''

    this.cues.forEach(cue => {
      const ce = document.createElement('cue-editor')
      ce.data = cue
      ce.video = this.video
      ce.formatTime = this.formatTime.bind(this)

      // waveform props (will be null until analysis is ready)
      ce.envelope = this.envelope
      ce.frameDuration = this.frameDuration
      ce.contextWindow = 0.75

      // callbacks
      ce.onPlayCue = c => {
        this.previewEnd = c.end
        this.video.currentTime = c.start
        this.video.play()
      }

      ce.onSnapStartToNow = () => {
        cue.start = this.video.currentTime
        if (cue.start > cue.end) cue.start = cue.end
        this.renderCues()
      }

      ce.onSnapEndToNow = () => {
        cue.end = this.video.currentTime
        if (cue.end < cue.start) cue.end = cue.start
        this.renderCues()
      }

      ce.onExtendStartBackward = () => {
        cue.start = this.findPrevValleyTime(cue.start)
        this.renderCues()
      }

      ce.onExtendEndForward = () => {
        cue.end = this.findNextValleyTime(cue.end)
        this.renderCues()
      }

      ce.addEventListener('focusin', () => {
        this.setActiveCue(cue, ce)
      })
      ce.addEventListener('click', () => {
        this.setActiveCue(cue, ce)
      })

      this.cueList.appendChild(ce)
    })
  }
}

customElements.define('subtitle-editor', SubtitleEditor)
export { SubtitleEditor }
