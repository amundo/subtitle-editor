class SpeakerController {
  getUniqueSpeakers({ manualSpeakers = [], cues = [] } = {}) {
    return [...new Set([
      ...manualSpeakers.map(speaker => this.normalizeSpeaker(speaker)).filter(Boolean),
      ...cues
        .map(cue => this.normalizeSpeaker(cue?.speaker))
        .filter(Boolean)
    ])]
  }

  addSpeaker({ manualSpeakers = [], cues = [], speaker }) {
    const nextSpeaker = this.normalizeSpeaker(speaker)
    if (!nextSpeaker) {
      return {
        manualSpeakers,
        changed: false
      }
    }

    if (this.getUniqueSpeakers({ manualSpeakers, cues }).includes(nextSpeaker)) {
      return {
        manualSpeakers,
        changed: false
      }
    }

    return {
      manualSpeakers: [...manualSpeakers, nextSpeaker],
      changed: true
    }
  }

  renameSpeaker({ manualSpeakers = [], cues = [], fromSpeaker, toSpeaker }) {
    const from = this.normalizeSpeaker(fromSpeaker)
    const to = this.normalizeSpeaker(toSpeaker)
    if (!from || !to || from === to) {
      return {
        manualSpeakers,
        changed: false
      }
    }

    let changed = false
    const nextManualSpeakers = manualSpeakers.map(speaker => {
      if (speaker !== from) return speaker
      changed = true
      return to
    })

    cues.forEach(cue => {
      if (cue?.speaker === from) {
        cue.speaker = to
        changed = true
      }
    })

    return {
      manualSpeakers: [...new Set(nextManualSpeakers)],
      changed
    }
  }

  setCueSpeaker(cue, speaker) {
    if (!cue) return false

    const nextSpeaker = this.normalizeSpeaker(speaker) || null
    if (cue.speaker === nextSpeaker) return false

    cue.speaker = nextSpeaker
    return true
  }

  normalizeSpeaker(speaker) {
    return typeof speaker === 'string' ? speaker.trim() : ''
  }
}

export { SpeakerController }
