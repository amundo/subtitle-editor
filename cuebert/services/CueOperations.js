import { getCueSourceSegmentIds } from './TranscriptExporter.js'

function splitCue(cue, selection = {}) {
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
    sourceSegmentIds: getCueSourceSegmentIds(cue)
  }

  cue.id = this.createCueId(cue.id, 'a')
  cue.end = splitTime
  cue.text = beforeText
  cue.sourceSegmentIds = getCueSourceSegmentIds(cue)

  this.cues.splice(index + 1, 0, nextCue)
  this.afterCueChange()
}

function mergeCues(targetCue, mergedCue) {
  const mergedIndex = this.cues.indexOf(mergedCue)
  if (mergedIndex === -1) return

  targetCue.start = Math.min(targetCue.start, mergedCue.start)
  targetCue.end = Math.max(targetCue.end, mergedCue.end)
  targetCue.text = this.joinCueText(targetCue.text, mergedCue.text)
  targetCue.sourceSegmentIds = [
    ...new Set([
      ...getCueSourceSegmentIds(targetCue),
      ...getCueSourceSegmentIds(mergedCue)
    ])
  ]
  if (!targetCue.speaker && mergedCue.speaker) {
    targetCue.speaker = mergedCue.speaker
  }

  this.cues.splice(mergedIndex, 1)
  this.afterCueChange()
}

function deleteCue(cue) {
  const index = this.cues.indexOf(cue)
  if (index === -1) return

  this.cues.splice(index, 1)
  if (this.activeCue === cue) {
    this.activeCue = null
    this.activeCueElement = null
  }

  this.afterCueChange()
}

export { splitCue, mergeCues, deleteCue }
