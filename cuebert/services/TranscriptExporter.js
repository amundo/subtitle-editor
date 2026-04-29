
function buildVtt(cues) {
    const parts = ['WEBVTT\n']
    for (const cue of cues) {
        parts.push(String(cue.id))
        parts.push(
            `${formatTime(cue.start)} --> ${formatTime(cue.end)}`
        )
        parts.push(this.formatCueTextForExport(cue))
        parts.push('')
    }
    return parts.join('\n')
}

function
    buildPlainText(cues) {
    const parts = []
    let previousSpeaker = null

    cues.forEach(cue => {
        const text = (cue.text || '').trim()
        if (!text) return

        const speaker = typeof cue.speaker === 'string' ? cue.speaker.trim() : ''
        const speakerChanged = speaker && speaker !== previousSpeaker
        const line = speakerChanged ? `[${speaker}] ${text}` : text

        parts.push(line)
        parts.push('')
        previousSpeaker = speaker
    })

    while (parts.length && parts.at(-1) === '') {
        parts.pop()
    }

    return parts.join('\n')
}

function

    buildAtrainJson(cues, sourceData) {
    const sourceIsArray = Array.isArray(sourceData)
    const cloned = structuredClone(sourceData)
    const segments = sourceIsArray ? cloned : cloned?.segments
    if (!Array.isArray(segments)) return cloned

    const sourceSegmentById = new Map(
        segments.map((segment, index) => [segment.id ?? index + 1, segment])
    )

    const nextSegments = cues.map((cue, index) => {
        const sourceSegmentIds = this.getCueSourceSegmentIds(cue)
        const segment = structuredClone(
            sourceSegmentById.get(sourceSegmentIds[0] ?? cue.id) ?? {}
        )
        const speaker = typeof cue.speaker === 'string' ? cue.speaker.trim() : ''
        const text = (cue.text || '').trim()

        segment.id = index + 1
        segment.start = cue.start
        segment.end = cue.end

        if (speaker) segment.speaker = speaker
        else delete segment.speaker

        segment.text = text ? ` ${text}` : ''

        if (Array.isArray(segment.words)) {
            const sourceWords = sourceSegmentIds
                .flatMap(sourceSegmentId =>
                    sourceSegmentById.get(sourceSegmentId)?.words ?? []
                )

            segment.words = sourceWords
                .filter(word =>
                    this.isFiniteNumber(word?.start) &&
                    this.isFiniteNumber(word?.end) &&
                    word.start >= cue.start &&
                    word.end <= cue.end
                )
                .map(word => {
                    const nextWord = { ...word }
                    if (speaker) nextWord.speaker = speaker
                    else delete nextWord.speaker
                    return nextWord
                })
        }

        return segment
    })

    const metadata = sourceIsArray
        ? {}
        : structuredClone(cloned.metadata ?? {})

    metadata.media = this.mediaLoadedFromPath || metadata.media || null
    metadata.speakers = this.getUniqueSpeakers()

    if (!metadata.title) {
        metadata.title = this.getTranscriptTitle()
    }

    return {
        ...(sourceIsArray ? {} : cloned),
        metadata,
        segments: nextSegments
    }
}
