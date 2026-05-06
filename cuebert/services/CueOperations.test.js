import { deleteCue, mergeCues, splitCue } from './CueOperations.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

function createContext(cues) {
  let changeCount = 0

  return {
    cues,
    activeCue: null,
    activeCueElement: null,
    get changeCount() {
      return changeCount
    },
    getCueSplitTime(cue) {
      return cue.start + (cue.end - cue.start) / 2
    },
    splitCueText(text, selectionStart = null) {
      const index = Number.isInteger(selectionStart)
        ? selectionStart
        : Math.floor(text.length / 2)
      return [text.slice(0, index).trim(), text.slice(index).trim()]
    },
    createCueId(baseId, suffix) {
      return `${baseId}-${suffix}`
    },
    joinCueText(firstText = '', secondText = '') {
      return [firstText, secondText].filter(Boolean).join('\n')
    },
    afterCueChange() {
      changeCount++
    }
  }
}

Deno.test('splitCue inserts a second cue and preserves source segment ids', () => {
  const cue = {
    id: 10,
    start: 0,
    end: 4,
    text: 'hello world',
    speaker: 'Host',
    sourceSegmentIds: [10]
  }
  const context = createContext([cue])

  splitCue.call(context, cue, { selectionStart: 5 })

  assertEquals(context.cues, [
    {
      id: '10-a',
      start: 0,
      end: 2,
      text: 'hello',
      speaker: 'Host',
      sourceSegmentIds: [10]
    },
    {
      id: '10-b',
      start: 2,
      end: 4,
      text: 'world',
      speaker: 'Host',
      sourceSegmentIds: [10]
    }
  ])
  assertEquals(context.changeCount, 1)
})

Deno.test('mergeCues combines timing, text, speaker, and source ids', () => {
  const firstCue = {
    id: 1,
    start: 1,
    end: 2,
    text: 'first',
    sourceSegmentIds: [1]
  }
  const secondCue = {
    id: 2,
    start: 2,
    end: 5,
    text: 'second',
    speaker: 'Guest',
    sourceSegmentIds: [2]
  }
  const context = createContext([firstCue, secondCue])

  mergeCues.call(context, firstCue, secondCue)

  assertEquals(context.cues, [{
    id: 1,
    start: 1,
    end: 5,
    text: 'first\nsecond',
    sourceSegmentIds: [1, 2],
    speaker: 'Guest'
  }])
  assertEquals(context.changeCount, 1)
})

Deno.test('deleteCue removes the cue and clears active state', () => {
  const firstCue = { id: 1, start: 0, end: 1, text: 'first' }
  const secondCue = { id: 2, start: 1, end: 2, text: 'second' }
  const context = createContext([firstCue, secondCue])
  context.activeCue = secondCue
  context.activeCueElement = {}

  deleteCue.call(context, secondCue)

  assertEquals(context.cues, [firstCue])
  assertEquals(context.activeCue, null)
  assertEquals(context.activeCueElement, null)
  assertEquals(context.changeCount, 1)
})
