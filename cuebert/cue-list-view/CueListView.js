import '../cue-editor/CueEditor.js'

class CueListView extends HTMLElement {
  #data = {}

  constructor() {
    super()
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null
  }

  async fetch(url) {
    let response = await fetch(url)
    let data = await response.json()
    this.data = data
  }

  connectedCallback() {
    this.render()
  }

  static get observedAttributes() {
    return ['src']
  }

  attributeChangedCallback(attribute, oldValue, newValue) {
    if (attribute === 'src' && oldValue !== newValue) {
      this.fetch(newValue)
    }
  }

  set data(data) {
    this.#data = data ?? {}
    this.render()
  }

  get data() {
    return this.#data
  }

  render() {
    const {
      cues = [],
      allowMerge = true,
      video = null,
      activeCue = null,
      playbackCue = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      formatTime = seconds => seconds.toFixed(3),
      highlightedCues = [],
      handlers = {}
    } = this.#data
    const highlightedCueSet = new Set(highlightedCues)

    this.innerHTML = ''
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null

    cues.forEach((cue, index) => {
      if (allowMerge && index > 0) {
        this.appendChild(this.createMergeCueRow(cues[index - 1], cue, handlers))
      }

      const cueEditor = document.createElement('cue-editor')
      cueEditor.video = video
      cueEditor.formatTime = formatTime
      cueEditor.speakerOptions = speakers
      cueEditor.envelope = envelope
      cueEditor.frameDuration = frameDuration
      cueEditor.contextWindow = 0.75
      cueEditor.data = cue

      this.cueElementByCue.set(cue, cueEditor)

      if (activeCue === cue || playbackCue === cue) {
        cueEditor.classList.add('is-active')
        this.activeCueElement = cueEditor
      }

      if (playbackCue === cue) {
        cueEditor.classList.add('is-playback-active')
        this.playbackCueElement = cueEditor
      }

      if (highlightedCueSet.has(cue)) {
        cueEditor.classList.add('is-search-match')
      }

      cueEditor.onPlayCue = selectedCue => {
        handlers.onPlayCue?.(selectedCue, cueEditor)
      }

      cueEditor.onSnapStartToNow = () => {
        handlers.onSnapStartToNow?.(cue, cueEditor)
      }

      cueEditor.onSnapEndToNow = () => {
        handlers.onSnapEndToNow?.(cue, cueEditor)
      }

      cueEditor.onExtendStartBackward = () => {
        handlers.onExtendStartBackward?.(cue, cueEditor)
      }

      cueEditor.onExtendEndForward = () => {
        handlers.onExtendEndForward?.(cue, cueEditor)
      }

      cueEditor.onSetSpeaker = nextSpeaker => {
        handlers.onSetSpeaker?.(cue, nextSpeaker, cueEditor)
      }

      cueEditor.onSplitCue = selection => {
        handlers.onSplitCue?.(cue, selection, cueEditor)
      }

      cueEditor.onDeleteCue = () => {
        handlers.onDeleteCue?.(cue, cueEditor)
      }

      cueEditor.onWaveformSeek = time => {
        handlers.onWaveformSeek?.(cue, time, cueEditor)
      }

      cueEditor.onWaveformBoundaryChange = detail => {
        handlers.onWaveformBoundaryChange?.(cue, detail, cueEditor)
      }

      cueEditor.onWaveformBoundaryCommit = detail => {
        handlers.onWaveformBoundaryCommit?.(cue, detail, cueEditor)
      }

      cueEditor.addEventListener('focusin', () => {
        handlers.onFocusCue?.(cue, cueEditor)
      })
      cueEditor.addEventListener('click', () => {
        handlers.onFocusCue?.(cue, cueEditor)
      })
      cueEditor.addEventListener('cuechange', () => {
        handlers.onCueChange?.(cue, cueEditor)
      })

      this.appendChild(cueEditor)
    })
  }

  createMergeCueRow(previousCue, nextCue, handlers) {
    const row = document.createElement('div')
    row.className = 'cue-merge-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cue-merge-button'
    button.textContent = '▲ merge ▼'
    button.title = 'Merge the cue above with the cue below'
    button.addEventListener('click', () => {
      handlers.onMergeCues?.(previousCue, nextCue)
    })

    row.appendChild(button)
    return row
  }
}

customElements.define('cue-list-view', CueListView)
export { CueListView }
