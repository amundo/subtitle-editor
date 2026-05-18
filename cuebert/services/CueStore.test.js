import { CueStore } from './CueStore.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

function assert(condition, message = 'Expected condition to be true') {
  if (!condition) throw new Error(message)
}

Deno.test('CueStore reads cues by id and index', () => {
  const firstCue = { id: 1, start: 0, end: 1, text: 'first' }
  const secondCue = { id: 2, start: 1, end: 2, text: 'second' }
  const store = new CueStore([firstCue, secondCue])

  assertEquals(store.length, 2)
  assertEquals(store.getById(2), secondCue)
  assertEquals(store.getByIndex(0), firstCue)
  assertEquals(store.indexOfId(1), 0)
  assertEquals(store.getById(3), null)
})

Deno.test('CueStore toArray returns a snapshot of the cue list', () => {
  const store = new CueStore([{ id: 1, start: 0, end: 1, text: 'first' }])
  const cuesCopy = store.toArray()

  cuesCopy.push({ id: 2, start: 1, end: 2, text: 'second' })

  assertEquals(store.length, 1)
  assertEquals(store.getById(2), null)
})

Deno.test('CueStore updates by id and emits changed keys', () => {
  const changes = []
  const store = new CueStore([{ id: 1, start: 0, end: 1, text: 'old' }])
  store.addEventListener('change', event => changes.push(event.detail))

  const cue = store.update(1, { text: 'new', speaker: 'Host' })

  assertEquals(cue, { id: 1, start: 0, end: 1, text: 'new', speaker: 'Host' })
  assertEquals(changes.length, 1)
  assertEquals(changes[0].type, 'update')
  assertEquals(changes[0].id, 1)
  assertEquals(changes[0].index, 0)
  assertEquals(changes[0].changes, ['text', 'speaker'])
  assertEquals(changes[0].previousCue.text, 'old')
})

Deno.test('CueStore emits typed events with the same change payload', () => {
  const events = []
  const store = new CueStore([{ id: 1, start: 0, end: 1, text: 'old' }])
  store.addEventListener('change', event => events.push(['change', event.detail]))
  store.addEventListener('update', event => events.push(['update', event.detail]))

  store.update(1, { text: 'new' })

  assertEquals(events.map(([type]) => type), ['change', 'update'])
  assert(events[0][1] === events[1][1], 'Expected typed event to reuse the change payload')
  assertEquals(events[1][1].type, 'update')
})

Deno.test('CueStore inserts and removes cues with indexes', () => {
  const changes = []
  const store = new CueStore([
    { id: 1, start: 0, end: 1, text: 'first' },
    { id: 3, start: 3, end: 4, text: 'third' }
  ])
  store.addEventListener('change', event => changes.push(event.detail))

  const insertedCue = { id: 2, start: 1, end: 2, text: 'second' }
  store.insert(insertedCue, 1)
  const removedCue = store.remove(1)

  assertEquals(store.toArray(), [
    insertedCue,
    { id: 3, start: 3, end: 4, text: 'third' }
  ])
  assertEquals(removedCue.id, 1)
  assertEquals(changes.map(change => change.type), ['insert', 'remove'])
  assertEquals(changes[0].index, 1)
  assertEquals(changes[1].index, 0)
})

Deno.test('CueStore merges cues and emits removed cue detail', () => {
  const changes = []
  const store = new CueStore([
    { id: 1, start: 1, end: 2, text: 'first', sourceSegmentIds: [1] },
    { id: 2, start: 2, end: 5, text: 'second', speaker: 'Guest', sourceSegmentIds: [2] }
  ])
  store.addEventListener('change', event => changes.push(event.detail))

  const cue = store.merge(1, 2)

  assertEquals(cue, {
    id: 1,
    start: 1,
    end: 5,
    text: 'first\nsecond',
    sourceSegmentIds: [1, 2],
    speaker: 'Guest'
  })
  assertEquals(store.toArray(), [cue])
  assertEquals(changes[0].type, 'merge')
  assertEquals(changes[0].id, 1)
  assertEquals(changes[0].mergedId, 2)
  assertEquals(changes[0].removedCue.id, 2)
  assertEquals(changes[0].changes, ['end', 'text', 'sourceSegmentIds', 'speaker'])
})

Deno.test('CueStore merge event reports the target index after removal', () => {
  const changes = []
  const store = new CueStore([
    { id: 1, start: 0, end: 1, text: 'first' },
    { id: 2, start: 1, end: 2, text: 'second' }
  ])
  store.addEventListener('change', event => changes.push(event.detail))

  store.merge(2, 1)

  assertEquals(store.getByIndex(0).id, 2)
  assertEquals(changes[0].index, 0)
  assertEquals(changes[0].mergedIndex, 0)
})

Deno.test('CueStore splits cues and preserves source segment ids', () => {
  const changes = []
  const store = new CueStore([
    { id: 10, start: 0, end: 4, text: 'hello world', sourceSegmentIds: [10] }
  ])
  store.addEventListener('change', event => changes.push(event.detail))

  const result = store.split(10, {
    splitTime: 2,
    beforeText: 'hello',
    afterText: 'world'
  })

  assertEquals(result, [
    { id: '10-a', start: 0, end: 2, text: 'hello', sourceSegmentIds: [10] },
    { id: '10-b', start: 2, end: 4, text: 'world', sourceSegmentIds: [10] }
  ])
  assertEquals(store.toArray(), result)
  assertEquals(changes[0].type, 'split')
  assertEquals(changes[0].index, 0)
  assertEquals(changes[0].insertedIndex, 1)
})

Deno.test('CueStore searches and filters cues', () => {
  const store = new CueStore([
    { id: 1, start: 0, end: 1, text: 'Opening line', speaker: 'Host' },
    { id: 2, start: 1, end: 2, text: 'closing', speaker: 'Guest' }
  ])

  assertEquals(store.search('host').map(cue => cue.id), [1])
  assertEquals(store.search('line', { wholeWords: true }).map(cue => cue.id), [1])
  assertEquals(store.filter(cue => cue.end > 1).map(cue => cue.id), [2])
})

Deno.test('CueStore supports onChange as a convenience wrapper', () => {
  let changeCount = 0
  const store = new CueStore([{ id: 1, start: 0, end: 1, text: 'first' }])
  const unsubscribe = store.onChange(() => changeCount++)

  store.update(1, { text: 'second' })
  unsubscribe()
  store.update(1, { text: 'third' })

  assert(changeCount === 1, `Expected one change, got ${changeCount}`)
})
