import { getCueSourceSegmentIds } from './TranscriptExporter.js'

function splitCue(cue, selection = {}) {
  const [beforeText, afterText] = this.splitCueText(
    cue.text || '',
    selection.selectionStart
  )
  const result = splitCueInList(this.cues, cue, {
    splitTime: this.getCueSplitTime(cue),
    beforeText,
    afterText,
    createCueId: (baseId, suffix) => this.createCueId(baseId, suffix)
  })
  if (!result) return

  this.afterCueChange()
}

function mergeCues(targetCue, mergedCue) {
  const result = mergeCuesInList(this.cues, targetCue, mergedCue, {
    joinCueText: (firstText, secondText) => this.joinCueText(firstText, secondText)
  })
  if (!result) return

  this.afterCueChange()
}

function deleteCue(cue) {
  const result = deleteCueFromList(this.cues, cue)
  if (!result) return

  if (this.activeCue === cue) {
    this.activeCue = result.nextCue
    this.activeCueElement = null
  }

  this.afterCueChange({ speakersChanged: false })
}

function splitCueInList(cues, cue, {
  splitTime,
  beforeText,
  afterText,
  createCueId = defaultCreateCueId
} = {}) {
  const index = cues.indexOf(cue)
  if (index === -1) return null

  const time = Number.isFinite(splitTime)
    ? splitTime
    : cue.start + (cue.end - cue.start) / 2
  if (time <= cue.start || time >= cue.end) return null

  const previousCue = { ...cue }
  const nextCue = {
    ...cue,
    id: createCueId(cue.id, 'b'),
    start: time,
    end: cue.end,
    text: afterText,
    sourceSegmentIds: getCueSourceSegmentIds(cue)
  }

  cue.id = createCueId(cue.id, 'a')
  cue.end = time
  cue.text = beforeText
  cue.sourceSegmentIds = getCueSourceSegmentIds(cue)

  cues.splice(index + 1, 0, nextCue)
  return {
    index,
    cue,
    insertedCue: nextCue,
    insertedIndex: index + 1,
    previousCue
  }
}

function mergeCuesInList(cues, targetCue, mergedCue, {
  joinCueText = defaultJoinCueText
} = {}) {
  const targetIndex = cues.indexOf(targetCue)
  const mergedIndex = cues.indexOf(mergedCue)
  if (targetIndex === -1 || mergedIndex === -1 || targetIndex === mergedIndex) {
    return null
  }

  const previousCue = { ...targetCue }

  targetCue.start = Math.min(targetCue.start, mergedCue.start)
  targetCue.end = Math.max(targetCue.end, mergedCue.end)
  targetCue.text = joinCueText(targetCue.text, mergedCue.text)
  targetCue.sourceSegmentIds = [
    ...new Set([
      ...getCueSourceSegmentIds(targetCue),
      ...getCueSourceSegmentIds(mergedCue)
    ])
  ]
  if (!targetCue.speaker && mergedCue.speaker) {
    targetCue.speaker = mergedCue.speaker
  }

  cues.splice(mergedIndex, 1)
  return {
    index: mergedIndex < targetIndex ? targetIndex - 1 : targetIndex,
    mergedIndex,
    cue: targetCue,
    previousCue,
    removedCue: mergedCue
  }
}

function deleteCueFromList(cues, cue) {
  const index = cues.indexOf(cue)
  if (index === -1) return null

  const nextCue = cues[index + 1] ?? cues[index - 1] ?? null
  cues.splice(index, 1)
  return {
    index,
    cue,
    nextCue
  }
}

function defaultJoinCueText(firstText = '', secondText = '') {
  return [firstText, secondText]
    .map(text => (text || '').trim())
    .filter(Boolean)
    .join('\n')
}

function defaultCreateCueId(baseId, suffix) {
  return `${baseId}-${suffix}`
}

export {
  splitCue,
  mergeCues,
  deleteCue,
  splitCueInList,
  mergeCuesInList,
  deleteCueFromList
}
