import { SpeakerController } from './SpeakerController.js'

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return

  throw new Error(
    `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
  )
}

Deno.test('SpeakerController returns unique trimmed speakers', () => {
  const controller = new SpeakerController()

  assertEquals(
    controller.getUniqueSpeakers({
      manualSpeakers: [' Host ', 'Guest'],
      cues: [
        { speaker: 'Host' },
        { speaker: ' Narrator ' },
        { speaker: '' },
        { speaker: null }
      ]
    }),
    ['Host', 'Guest', 'Narrator']
  )
})

Deno.test('SpeakerController adds manual speaker only when new', () => {
  const controller = new SpeakerController()
  const cues = [{ speaker: 'Host' }]

  assertEquals(
    controller.addSpeaker({
      manualSpeakers: ['Guest'],
      cues,
      speaker: ' Narrator '
    }),
    {
      manualSpeakers: ['Guest', 'Narrator'],
      changed: true
    }
  )

  assertEquals(
    controller.addSpeaker({
      manualSpeakers: ['Guest'],
      cues,
      speaker: ' Host '
    }),
    {
      manualSpeakers: ['Guest'],
      changed: false
    }
  )
})

Deno.test('SpeakerController renames manual speakers and cue speakers', () => {
  const controller = new SpeakerController()
  const cues = [
    { speaker: 'Host' },
    { speaker: 'Guest' },
    { speaker: 'Host' }
  ]

  const result = controller.renameSpeaker({
    manualSpeakers: ['Host', 'Guest'],
    cues,
    fromSpeaker: ' Host ',
    toSpeaker: 'Narrator'
  })

  assertEquals(result, {
    manualSpeakers: ['Narrator', 'Guest'],
    changed: true
  })
  assertEquals(cues, [
    { speaker: 'Narrator' },
    { speaker: 'Guest' },
    { speaker: 'Narrator' }
  ])
})

Deno.test('SpeakerController sets and clears cue speaker', () => {
  const controller = new SpeakerController()
  const cue = { speaker: 'Host' }

  assertEquals(controller.setCueSpeaker(cue, ' Guest '), true)
  assertEquals(cue, { speaker: 'Guest' })

  assertEquals(controller.setCueSpeaker(cue, ''), true)
  assertEquals(cue, { speaker: null })

  assertEquals(controller.setCueSpeaker(cue, ' '), false)
})
