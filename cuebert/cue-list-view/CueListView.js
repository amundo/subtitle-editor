import '../cue-editor/CueEditor.js'

class CueListView extends HTMLElement {
  #data = {}

  constructor() {
    super()
    this.cueElementByCue = new Map()
    this.cueElementById = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null
    this.progressiveWaveformRaf = null
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
    this.cancelProgressiveWaveformRender()
  }

  set data(data) {
    const previousData = this.#data
    this.#data = data ?? {}
    if (this.canPatchCueRows(previousData, this.#data)) {
      this.patchCueRows(previousData)
      return
    }

    this.render()
  }

  get data() {
    return this.#data
  }

  updateSharedProps(data = {}) {
    this.#data = { ...this.#data, ...data }

    this.getRenderedCueEditors().forEach(cueEditor => {
      this.updateCueEditorSharedProps(cueEditor)
    })
  }

  updatePlaybackState({ activeCue = this.#data.activeCue, playbackCue = this.#data.playbackCue, playheadTime = this.#data.playheadTime } = {}) {
    this.#data = {
      ...this.#data,
      activeCue,
      playbackCue,
      playheadTime
    }
    this.activeCueElement = null
    this.playbackCueElement = null

    this.getRenderedCueEditors().forEach(cueEditor => {
      const cue = cueEditor.data
      cueEditor.playheadTime = playheadTime
      cueEditor.classList.toggle('is-playback-active', this.isSameCue(playbackCue, cue))
      if (this.isSameCue(activeCue, cue)) this.activeCueElement = cueEditor
      if (this.isSameCue(playbackCue, cue)) this.playbackCueElement = cueEditor
    })
  }

  updateCueRow(cue) {
    const cueEditor = this.getCueEditorForCue(cue)
    if (!cueEditor) return false

    const previousCue = cueEditor.data
    if (previousCue) this.cueElementByCue.delete(previousCue)

    this.configureCueEditor(cueEditor, cue)
    this.cueElementByCue.set(cue, cueEditor)

    const cueId = this.getCueId(cue)
    if (cueId !== undefined && cueId !== null) {
      this.cueElementById.set(cueId, cueEditor)
    }

    cueEditor.classList.toggle('is-playback-active', this.isSameCue(this.#data.playbackCue, cue))
    if (this.isSameCue(this.#data.activeCue, cue)) this.activeCueElement = cueEditor
    if (this.isSameCue(this.#data.playbackCue, cue)) this.playbackCueElement = cueEditor

    return true
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

    this.cancelProgressiveWaveformRender()
    this.cueElementByCue = new Map()
    this.cueElementById = new Map()
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

  canPatchCueRows(previousData = {}, nextData = {}) {
    const previousCues = previousData.cues ?? []
    const nextCues = nextData.cues ?? []
    if (!previousCues.length || previousCues.length !== nextCues.length) return false
    if (previousData.allowMerge !== nextData.allowMerge) return false

    return nextCues.every((cue, index) => {
      const cueId = this.getCueId(cue)
      return (
        cueId !== undefined &&
        cueId !== null &&
        cueId === this.getCueId(previousCues[index]) &&
        this.cueElementById.has(cueId)
      )
    })
  }

  patchCueRows(previousData = {}) {
    const { cues = [], activeCue = null, playbackCue = null } = this.#data
    const previousCues = previousData.cues ?? []

    this.cueElementByCue = new Map()
    this.activeCueElement = null
    this.playbackCueElement = null

    cues.forEach((cue, index) => {
      const cueEditor = this.cueElementById.get(this.getCueId(cue))
      if (!cueEditor) return

      this.updateCueEditorSharedProps(cueEditor)
      if (cue !== previousCues[index]) {
        this.configureCueEditor(cueEditor, cue)
      }
      this.cueElementByCue.set(cue, cueEditor)

      cueEditor.classList.toggle('is-playback-active', this.isSameCue(playbackCue, cue))
      if (this.isSameCue(activeCue, cue)) this.activeCueElement = cueEditor
      if (this.isSameCue(playbackCue, cue)) this.playbackCueElement = cueEditor
    })

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
    const { allowMerge = true, activeCue = null, playbackCue = null } = this.#data
    const cue = cues[index]
    if (!cue) return

    if (allowMerge && index > 0) {
      parent.appendChild(this.createMergeCueRow(cues[index - 1], cue))
    }

    const cueEditor = document.createElement('cue-editor')
    this.configureCueEditor(cueEditor, cue)

    this.cueElementByCue.set(cue, cueEditor)
    if (this.getCueId(cue) !== undefined && this.getCueId(cue) !== null) {
      this.cueElementById.set(this.getCueId(cue), cueEditor)
    }

    if (this.isSameCue(activeCue, cue)) {
      this.activeCueElement = cueEditor
    }

    if (this.isSameCue(playbackCue, cue)) {
      cueEditor.classList.add('is-playback-active')
      this.playbackCueElement = cueEditor
    }

    parent.appendChild(cueEditor)
  }

  configureCueEditor(cueEditor, cue) {
    const { handlers = {} } = this.#data

    this.updateCueEditorSharedProps(cueEditor)
    cueEditor.data = cue

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
  }

  updateCueEditorSharedProps(cueEditor) {
    const {
      video = null,
      speakers = [],
      envelope = null,
      frameDuration = null,
      playheadTime = null,
      formatTime = seconds => seconds.toFixed(3)
    } = this.#data

    const waveformInputsChanged = (
      cueEditor.envelope !== envelope ||
      cueEditor.frameDuration !== frameDuration
    )

    cueEditor.video = video
    cueEditor.formatTime = formatTime
    cueEditor.speakerOptions = speakers
    cueEditor.envelope = envelope
    cueEditor.frameDuration = frameDuration
    cueEditor.playheadTime = playheadTime
    cueEditor.contextWindow = 0.75

    if (waveformInputsChanged) {
      cueEditor.renderWaveform?.()
    }
  }

  getRenderedCueEditors() {
    return Array.from(new Set(this.cueElementByCue.values()))
  }

  renderInitialWaveforms(limit = 12) {
    let renderedCount = 0

    for (const element of this.children) {
      if (element.localName !== 'cue-editor') continue
      if (!element.waveForm?.lazyRenderPending) continue

      element.renderWaveform?.({ force: true })
      renderedCount += 1
      if (renderedCount >= limit) break
    }
  }

  scheduleProgressiveWaveformRender({ startIndex = 0, batchSize = 8 } = {}) {
    this.cancelProgressiveWaveformRender()

    let childIndex = Math.max(0, startIndex)
    const renderBatch = () => {
      let renderedCount = 0

      while (childIndex < this.children.length && renderedCount < batchSize) {
        const element = this.children[childIndex]
        childIndex += 1
        if (element.localName !== 'cue-editor') continue
        if (!element.waveForm?.lazyRenderPending) continue

        element.renderWaveform?.({ force: true })
        renderedCount += 1
      }

      if (childIndex < this.children.length) {
        this.progressiveWaveformRaf = requestAnimationFrame(renderBatch)
      } else {
        this.progressiveWaveformRaf = null
      }
    }

    this.progressiveWaveformRaf = requestAnimationFrame(renderBatch)
  }

  cancelProgressiveWaveformRender() {
    if (this.progressiveWaveformRaf === null || this.progressiveWaveformRaf === undefined) {
      this.progressiveWaveformRaf = null
      return
    }

    cancelAnimationFrame(this.progressiveWaveformRaf)
    this.progressiveWaveformRaf = null
  }

  getCueEditorForCue(cue) {
    const cueId = this.getCueId(cue)
    return this.cueElementByCue.get(cue) ??
      this.cueElementById.get(cueId) ??
      null
  }

  ensureCueRendered(cue, { scroll = false } = {}) {
    const { cues = [] } = this.#data
    const cueId = this.getCueId(cue)
    const index = cues.findIndex(candidate => this.isSameCue(candidate, cue))
    if (index === -1) return null

    const cueEditor = this.cueElementByCue.get(cues[index]) ??
      this.cueElementById.get(cueId) ??
      null
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

  getCueId(cue) {
    return cue?.id
  }

  isSameCue(firstCue, secondCue) {
    if (!firstCue || !secondCue) return firstCue === secondCue
    const firstId = this.getCueId(firstCue)
    const secondId = this.getCueId(secondCue)
    if (firstId === undefined || firstId === null) return firstCue === secondCue
    return firstId === secondId
  }
}

customElements.define('cue-list-view', CueListView)
export { CueListView }
