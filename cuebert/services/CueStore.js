import { CueSearchController } from './CueSearchController.js'
import {
  deleteCueFromList,
  mergeCuesInList,
  splitCueInList
} from './CueOperations.js'

class CueStore extends EventTarget {
  constructor(cues = [], {
    searchController = new CueSearchController()
  } = {}) {
    super()
    this.cues = Array.from(cues)
    this.searchController = searchController
    this.rebuildIndexById()
  }

  get length() {
    return this.cues.length
  }

  getCueCount() {
    return this.cues.length
  }

  setCues(cues = []) {
    const previousCues = this.cues
    this.cues = Array.from(cues)
    this.rebuildIndexById()
    this.emit({
      type: 'reset',
      cues: this.cues,
      previousCues
    })
  }

  toArray() {
    return [...this.cues]
  }

  onChange(listener) {
    const handler = event => listener(event.detail)
    this.addEventListener('change', handler)
    return () => this.removeEventListener('change', handler)
  }

  getById(id) {
    const index = this.indexOfId(id)
    return index === -1 ? null : this.cues[index]
  }

  getByIndex(index) {
    return this.cues[index] ?? null
  }

  indexOfId(id) {
    return this.indexById.get(id) ?? -1
  }

  getCueAtIndex(index) {
    return this.getByIndex(index)
  }

  getCueIndex(cueId) {
    return this.indexOfId(cueId)
  }

  getCueRange(startIndex = 0, endIndex = this.cues.length) {
    return this.cues.slice(
      this.clampIndex(startIndex),
      this.clampIndex(endIndex)
    )
  }

  update(id, patchOrUpdater = {}) {
    const index = this.indexOfId(id)
    if (index === -1) return null

    const previousCue = this.cues[index]
    const patch = typeof patchOrUpdater === 'function'
      ? patchOrUpdater(previousCue)
      : patchOrUpdater
    if (!patch || typeof patch !== 'object') return previousCue

    const cue = {
      ...previousCue,
      ...patch
    }
    this.cues[index] = cue
    this.rebuildIndexById()

    this.emit({
      type: 'update',
      id,
      index,
      cue,
      previousCue,
      changes: this.getChangedKeys(previousCue, cue)
    })
    return cue
  }

  insert(cue, index = this.cues.length) {
    const safeIndex = this.clampIndex(index)
    this.cues.splice(safeIndex, 0, cue)
    this.rebuildIndexById()

    this.emit({
      type: 'insert',
      id: cue?.id,
      index: safeIndex,
      cue
    })
    return cue
  }

  remove(id) {
    const index = this.indexOfId(id)
    if (index === -1) return null

    const result = deleteCueFromList(this.cues, this.cues[index])
    if (!result) return null

    this.rebuildIndexById()
    this.emit({
      type: 'remove',
      id,
      index: result.index,
      cue: result.cue,
      nextCue: result.nextCue
    })
    return result.cue
  }

  merge(targetId, mergedId, { joinCueText = defaultJoinCueText } = {}) {
    const targetIndex = this.indexOfId(targetId)
    const mergedIndex = this.indexOfId(mergedId)
    if (targetIndex === -1 || mergedIndex === -1) return null

    const result = mergeCuesInList(
      this.cues,
      this.cues[targetIndex],
      this.cues[mergedIndex],
      { joinCueText }
    )
    if (!result) return null
    this.rebuildIndexById()

    this.emit({
      type: 'merge',
      id: targetId,
      mergedId,
      index: result.index,
      mergedIndex: result.mergedIndex,
      cue: result.cue,
      previousCue: result.previousCue,
      removedCue: result.removedCue,
      changes: this.getChangedKeys(result.previousCue, result.cue)
    })
    return result.cue
  }

  split(id, {
    splitTime,
    beforeText,
    afterText,
    createCueId = (baseId, suffix) => this.createCueId(baseId, suffix)
  } = {}) {
    const index = this.indexOfId(id)
    if (index === -1) return null

    const [defaultBeforeText, defaultAfterText] = defaultSplitCueText(this.cues[index].text)
    const result = splitCueInList(this.cues, this.cues[index], {
      splitTime,
      beforeText: beforeText ?? defaultBeforeText,
      afterText: afterText ?? defaultAfterText,
      createCueId
    })
    if (!result) return null
    this.rebuildIndexById()

    this.emit({
      type: 'split',
      id,
      index: result.index,
      cue: result.cue,
      insertedCue: result.insertedCue,
      insertedIndex: result.insertedIndex,
      previousCue: result.previousCue
    })
    return [result.cue, result.insertedCue]
  }

  search(query, options = {}) {
    return this.searchController.getMatchedCues({
      cues: this.cues,
      query,
      ...options
    })
  }

  getSearchMatchedCueCount(query, options = {}) {
    return this.getSearchMatchedCues(query, options).length
  }

  getSearchMatchedCues(query, options = {}) {
    return this.search(query, options)
  }

  getSearchMatchedCueAtIndex(index, query, options = {}) {
    return this.getSearchMatchedCues(query, options)[index] ?? null
  }

  getSearchMatchedCueIndex(cueId, query, options = {}) {
    return this.getSearchMatchedCues(query, options)
      .findIndex(cue => cue?.id === cueId)
  }

  getSearchMatchedCueRange(startIndex = 0, endIndex = this.cues.length, query, options = {}) {
    const matchedCues = this.getSearchMatchedCues(query, options)
    return matchedCues.slice(
      this.clampRangeIndex(startIndex, matchedCues.length),
      this.clampRangeIndex(endIndex, matchedCues.length)
    )
  }

  filter(predicate) {
    return this.cues.filter(predicate)
  }

  rebuildIndexById() {
    this.indexById = new Map()
    this.cues.forEach((cue, index) => {
      if (cue?.id !== undefined && cue?.id !== null) {
        this.indexById.set(cue.id, index)
      }
    })
  }

  clampIndex(index) {
    if (!Number.isInteger(index)) return this.cues.length
    return Math.min(this.cues.length, Math.max(0, index))
  }

  clampRangeIndex(index, length) {
    if (!Number.isInteger(index)) return length
    return Math.min(length, Math.max(0, index))
  }

  getChangedKeys(previousCue, cue) {
    return [...new Set([
      ...Object.keys(previousCue ?? {}),
      ...Object.keys(cue ?? {})
    ])].filter(key => previousCue?.[key] !== cue?.[key])
  }

  emit(change) {
    this.dispatchEvent(new CustomEvent('change', { detail: change }))
    if (change?.type) {
      this.dispatchEvent(new CustomEvent(change.type, { detail: change }))
    }
  }

  createCueId(baseId, suffix) {
    const nextId = `${baseId}-${suffix}`
    return this.indexOfId(nextId) === -1
      ? nextId
      : `${nextId}-${Date.now()}`
  }
}

function defaultJoinCueText(firstText = '', secondText = '') {
  return [firstText, secondText]
    .map(text => (text || '').trim())
    .filter(Boolean)
    .join('\n')
}

function defaultSplitCueText(text = '') {
  const midpoint = Math.floor(text.length / 2)
  return [
    text.slice(0, midpoint).trim(),
    text.slice(midpoint).trim()
  ]
}

export { CueStore }
