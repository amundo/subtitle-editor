import {WaveForm} from '../wave-form/WaveForm.js'
// cue-editor/CueEditor.js
class CueEditor extends HTMLElement {
  #data = null
  constructor() {
    super()
    this.#data = null
    this.video = null
    this.formatTime = seconds => seconds.toFixed(3)
    this.speakerOptions = []

    // waveform props
    this.envelope = null
    this.frameDuration = null
    this.contextWindow = 0.75 // seconds

    // callbacks wired by SubtitleEditor
    this.onPlayCue = null
    this.onSnapStartToNow = null
    this.onSnapEndToNow = null
    this.onExtendStartBackward = null
    this.onExtendEndForward = null
    this.onSetSpeaker = null
    this.onSplitCue = null
    this.onDeleteCue = null
  }

  connectedCallback() {
    this.render()
  }

  set data(cue) {
    this.#data = cue
    this.render()
  }

  get data() {
    return this.#data
  }

  render() {
    if (!this.#data) {
      this.innerHTML = ''
      return
    }

    const { text, speaker } = this.#data
    const speakerLabelMarkup = speaker
      ? this.escapeHtml(speaker)
      : 'No speaker'
    const speakerClassName = speaker
      ? 'speaker-pill'
      : 'speaker-pill is-empty'

    this.innerHTML = `
        <wave-form data-role="waveform"></wave-form>

        <div class="cue-meta-row">
          <button class="${speakerClassName}" data-role="speakerPill" type="button"
                  title="Cycle to the next speaker">
            ${speakerLabelMarkup}
          </button>

          <span class="cue-meta-spacer"></span>

          <button class="cue-action-button" data-role="splitCue" type="button"
                  title="Split this cue at the text cursor; timing splits at the playhead or midpoint">
            Split at cursor
          </button>
          <button class="cue-action-button danger" data-role="deleteCue" type="button"
                  title="Delete this cue">
            Delete
          </button>
        </div>

        <div class="cue-time-row">
          <button type="button" class="time-button"
                  data-role="extendStart"
                  title="Extend start backward one lump">
            ◂
          </button>

          <button type="button" class="time-button"
                  data-role="jumpStart"
                  title="Jump video to start time">
            start: <span data-role="startLabel"></span>
          </button>

          <button type="button" class="time-button"
                  data-role="snapStart"
                  title="Set start to current video time">
            🎯
          </button>

          <span class="time-row-spacer"></span>

          <button type="button" class="time-button"
                  data-role="snapEnd"
                  title="Set end to current video time">
            🎯
          </button>

          <button type="button" class="time-button"
                  data-role="jumpEnd"
                  title="Jump video to end time">
            end: <span data-role="endLabel"></span>
          </button>

          <button type="button" class="time-button"
                  data-role="extendEnd"
                  title="Extend end forward one lump">
            +
          </button>

          <button type="button" class="time-button play-button"
                  data-role="playCue"
                  title="Play this cue">
            ▶
          </button>
        </div>

        <textarea class="cue-text" data-role="text">${text ?? ''}</textarea>
    `

    this.cacheEls()
    this.updateTimeLabels()
    this.bindEvents()
    this.renderWaveform()
  }

  cacheEls() {
    this.waveForm = this.querySelector('[data-role="waveform"]')
    this.startLabel = this.querySelector('[data-role="startLabel"]')
    this.endLabel = this.querySelector('[data-role="endLabel"]')
    this.textarea = this.querySelector('[data-role="text"]')
    this.speakerPill = this.querySelector('[data-role="speakerPill"]')
  }

  bindEvents() {
    this.querySelector('[data-role="jumpStart"]').addEventListener('click', () => {
      if (!this.video) return
      this.video.currentTime = this.#data.start
      this.video.play()
    })

    this.querySelector('[data-role="jumpEnd"]').addEventListener('click', () => {
      if (!this.video) return
      this.video.currentTime = this.#data.end
      this.video.play()
    })

    const snapStartBtn = this.querySelector('[data-role="snapStart"]')
    if (snapStartBtn) {
      snapStartBtn.addEventListener('click', () => {
        if (this.onSnapStartToNow) this.onSnapStartToNow()
      })
    }

    const snapEndBtn = this.querySelector('[data-role="snapEnd"]')
    if (snapEndBtn) {
      snapEndBtn.addEventListener('click', () => {
        if (this.onSnapEndToNow) this.onSnapEndToNow()
      })
    }

    const extendStartBtn = this.querySelector('[data-role="extendStart"]')
    if (extendStartBtn) {
      extendStartBtn.addEventListener('click', () => {
        if (this.onExtendStartBackward) this.onExtendStartBackward()
      })
    }

    const extendEndBtn = this.querySelector('[data-role="extendEnd"]')
    if (extendEndBtn) {
      extendEndBtn.addEventListener('click', () => {
        if (this.onExtendEndForward) this.onExtendEndForward()
      })
    }

    const playBtn = this.querySelector('[data-role="playCue"]')
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.onPlayCue) this.onPlayCue(this.#data)
      })
    }

    this.textarea.addEventListener('input', () => {
      this.#data.text = this.textarea.value
      this.dispatchEvent(new CustomEvent('cuechange'))
    })

    if (this.speakerPill) {
      this.speakerPill.addEventListener('click', () => {
        if (this.onSetSpeaker) this.onSetSpeaker(this.getNextSpeaker())
      })
    }

    this.querySelector('[data-role="splitCue"]')?.addEventListener('click', () => {
      if (this.onSplitCue) {
        this.onSplitCue({
          selectionStart: this.textarea.selectionStart,
          selectionEnd: this.textarea.selectionEnd
        })
      }
    })

    this.querySelector('[data-role="deleteCue"]')?.addEventListener('click', () => {
      if (!window.confirm('Delete this cue? This cannot be undone.')) return
      if (this.onDeleteCue) this.onDeleteCue()
    })
  }

  updateTimeLabels() {
    if (!this.#data) return
    if (this.startLabel) {
      this.startLabel.textContent = this.formatTime(this.#data.start)
    }
    if (this.endLabel) {
      this.endLabel.textContent = this.formatTime(this.#data.end)
    }
  }

  renderWaveform() {
    if (!this.waveForm || !this.#data) return

    this.waveForm.data = {
      envelope: this.envelope,
      frameDuration: this.frameDuration,
      start: this.#data.start,
      end: this.#data.end,
      contextWindow: this.contextWindow
    }
  }

  getNextSpeaker() {
    const currentSpeaker =
      typeof this.#data?.speaker === 'string' ? this.#data.speaker.trim() : ''
    const options = [...new Set(this.speakerOptions.filter(Boolean))]
    const cycle = currentSpeaker && !options.includes(currentSpeaker)
      ? [currentSpeaker, ...options]
      : options

    if (!cycle.length) return ''

    const currentIndex = cycle.indexOf(currentSpeaker)
    if (currentIndex === -1) {
      return cycle[0]
    }

    return cycle[(currentIndex + 1) % cycle.length]
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }
}

customElements.define('cue-editor', CueEditor)
export { CueEditor }
