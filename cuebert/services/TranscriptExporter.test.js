import { buildVtt } from './TranscriptExporter.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

Deno.test('buildVtt keeps generated empty gap cues parseable', () => {
  const vtt = buildVtt([{
    id: '1-gap-1',
    start: 3.04,
    end: 8.28,
    text: '',
    generatedFromAudioGap: true
  }])

  assertEquals(
    vtt,
    'WEBVTT\n\n1-gap-1\n00:00:03.040 --> 00:00:08.280\n\u200B\n'
  )
})
