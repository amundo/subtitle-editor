import './cue-editor/CueEditor.js'

class SubtitleEditor extends HTMLElement {
  constructor() {
    super()
    this.cues = []
    this.previewEnd = null
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
      <div>
        <div class="controls">
          <label>Video:
            <input type="file" data-role="videoFile" accept="video/*">
          </label>
          <label>Subtitles (.vtt):
            <input type="file" data-role="vttFile" accept=".vtt">
          </label>
        </div>
        <video data-role="video" controls></video>
        <div style="margin-top:.5rem;">
          Current time:
          <span data-role="currentTime" class="time-label">00:00:00.000</span>
        </div>
      </div>

      <div>
        <div class="cue-panel-header">
          <strong>Cues</strong>
          <button data-role="downloadBtn" disabled>Download updated VTT</button>
        </div>
        <div data-role="cueList" class="cue-list"></div>
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
    }
  }

  // ---------- time helpers ----------

  formatTime(seconds) {
    const s = Math.max(0, seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = (s % 60).toFixed(3)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(6,'0')}`
  }

  parseTime(str) {
    const m = str.match(/(\d+):(\d+):(\d+\.\d+)/)
    if (!m) return 0
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
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

  renderCues() {
    this.cueList.innerHTML = ''

    this.cues.forEach(cue => {
      const ce = document.createElement('cue-editor')
      ce.data = cue
      ce.video = this.video
      ce.onCueChange = () => {
        // we already mutate the same cue object; nothing else needed now
      }
      ce.onPlayCue = (c) => {
        this.previewEnd = c.end
        this.video.currentTime = c.start
        this.video.play()
      }
      this.cueList.appendChild(ce)
    })
  }
}

customElements.define('subtitle-editor', SubtitleEditor)
export { SubtitleEditor }
