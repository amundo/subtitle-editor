import { CueSearchController } from './CueSearchController.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

Deno.test('CueSearchController matches text and speaker case-insensitively by default', () => {
  const controller = new CueSearchController()
  const cues = [
    { text: 'Hello there', speaker: 'Host' },
    { text: 'Goodbye', speaker: 'Guest' }
  ]

  assertEquals(controller.getMatchedCues({ cues, query: 'host' }), [cues[0]])
  assertEquals(controller.getMatchedCues({ cues, query: 'HELLO' }), [cues[0]])
})

Deno.test('CueSearchController honors match case', () => {
  const controller = new CueSearchController()
  const cues = [
    { text: 'Apple' },
    { text: 'apple' }
  ]

  assertEquals(
    controller.getMatchedCues({ cues, query: 'Apple', matchCase: true }),
    [cues[0]]
  )
})

Deno.test('CueSearchController matches whole words with Intl.Segmenter', () => {
  const controller = new CueSearchController()
  const cues = [
    { text: 'cat' },
    { text: 'concatenate' },
    { text: 'cat nap' }
  ]

  assertEquals(
    controller.getMatchedCues({ cues, query: 'cat', wholeWords: true }),
    [cues[0], cues[2]]
  )
  assertEquals(
    controller.getMatchedCues({ cues, query: 'cat nap', wholeWords: true }),
    [cues[2]]
  )
})
