import '../cue-editor/CueEditor.js'

class CueListView extends HTMLElement {
  #data = {}

  constructor() {
    super()
    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null
    this.handleCueEditorFocus = event => {
      const cueEditor = this.getCueEditorFromEvent(event)
      if (!cueEditor) return

      this.#data.handlers?.onFocusCue?.(cueEditor.data, cueEditor)
    }
    this.handleCueEditorClick = event => {
      const mergeButton = event.target?.closest?.('.cue-merge-button')
      if (mergeButton && this.contains(mergeButton)) {
        this.handleMergeCueClick(mergeButton)
        return
      }

      const cueEditor = this.getCueEditorFromEvent(event)
      if (!cueEditor) return

      this.#data.handlers?.onFocusCue?.(cueEditor.data, cueEditor)
    }
    this.handleCueEditorChange = event => {
      const cueEditor = this.getCueEditorFromEvent(event)
      if (!cueEditor) return

      this.#data.handlers?.onCueChange?.(cueEditor.data, cueEditor)
    }
  }

  connectedCallback() {
    this.addEventListener('focusin', this.handleCueEditorFocus)
    this.addEventListener('click', this.handleCueEditorClick)
    this.addEventListener('cuechange', this.handleCueEditorChange)
    this.render()
  }

  disconnectedCallback() {
    this.removeEventListener('focusin', this.handleCueEditorFocus)
    this.removeEventListener('click', this.handleCueEditorClick)
    this.removeEventListener('cuechange', this.handleCueEditorChange)
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
      activeCue = null,
      video = null,
      playbackCue = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      playheadTime = null,
      formatTime = seconds => seconds.toFixed(3),
      handlers = {}
    } = this.#data

    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null
    const fragment = document.createDocumentFragment()

    cues.forEach((cue, index) => {
      this.appendCueBlock(fragment, cues, index)
    })
    this.replaceChildren(fragment)

    if (activeCue && !this.activeCueElement) {
      this.activeCueElement = this.cueElementByCue.get(activeCue) ?? null
    }
    this.dispatchRenderEvent()
  }

  dispatchRenderEvent() {
    this.dispatchEvent(new CustomEvent('cuelistrender', { bubbles: true }))
  }

  getCueEditorFromEvent(event) {
    const cueEditor = event.target?.closest?.('cue-editor')
    return cueEditor && this.contains(cueEditor) ? cueEditor : null
  }

  appendCueBlock(parent, cues, index) {
    const {
      allowMerge = true,
      activeCue = null,
      video = null,
      playbackCue = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      playheadTime = null,
      formatTime = seconds => seconds.toFixed(3),
      handlers = {}
    } = this.#data
    const cue = cues[index]
    if (!cue) return

    if (allowMerge && index > 0) {
      parent.appendChild(this.createMergeCueRow(cues[index - 1], cue))
    }

    const cueEditor = document.createElement('cue-editor')
    cueEditor.video = video
    cueEditor.formatTime = formatTime
    cueEditor.speakerOptions = speakers
    cueEditor.envelope = envelope
    cueEditor.frameDuration = frameDuration
    cueEditor.playheadTime = playheadTime
    cueEditor.contextWindow = 0.75
    cueEditor.data = cue

    this.cueElementByCue.set(cue, cueEditor)

    if (activeCue === cue) {
      this.activeCueElement = cueEditor
    }

    if (playbackCue === cue) {
      cueEditor.classList.add('is-playback-active')
      this.playbackCueElement = cueEditor
    }

    cueEditor.onPlayCue = selectedCue => {
      handlers.onPlayCue?.(selectedCue, cueEditor)
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

    cueEditor.onNavigateCue = direction => {
      handlers.onNavigateCue?.(cue, direction, cueEditor)
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

    parent.appendChild(cueEditor)
  }

  ensureCueRendered(cue, { scroll = false } = {}) {
    const { cues = [] } = this.#data
    const index = cues.indexOf(cue)
    if (index === -1) return null

    const cueEditor = this.cueElementByCue.get(cue) ?? null
    if (scroll && cueEditor) {
      cueEditor.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    return cueEditor
  }

  createMergeCueRow(previousCue, nextCue) {
    const row = document.createElement('div')
    row.className = 'cue-merge-row'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cue-merge-button'
    button.dataset.previousCueIndex = String(this.#data.cues.indexOf(previousCue))
    button.dataset.nextCueIndex = String(this.#data.cues.indexOf(nextCue))
    button.textContent = '▲ merge ▼'
    button.title = 'Merge the cue above with the cue below'

    row.appendChild(button)
    return row
  }

  handleMergeCueClick(button) {
    const { cues = [], handlers = {} } = this.#data
    const previousIndex = Number(button.dataset.previousCueIndex)
    const nextIndex = Number(button.dataset.nextCueIndex)
    const previousCue = cues[previousIndex]
    const nextCue = cues[nextIndex]
    if (!previousCue || !nextCue) return

    handlers.onMergeCues?.(previousCue, nextCue)
  }
}

customElements.define('cue-list-view', CueListView)
export { CueListView }
