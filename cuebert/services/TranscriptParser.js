function parseSubtitleFile(text, fileName = '') {
    const trimmed = text.trimStart()
    const looksLikeJson =
        fileName.toLowerCase().endsWith('.json') ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('[')

    if (looksLikeJson) {
        try {
            return this.parseAtrainJson(text)
        } catch (err) {
            if (!trimmed.startsWith('WEBVTT')) throw err
        }
    }

    return {
        format: 'vtt',
        cues: this.parseVtt(text),
        sourceData: null
    }
}

function parseVtt(text) {
    const lines = text.replace(/\r/g, '').split('\n')
    const cues = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i].trim()
        i++
        if (!line || line.startsWith('WEBVTT')) continue

        let id = null
        let timeLine = line
        if (!line.includes('-->')) {
            id = line
            timeLine = (lines[i++] || '').trim()
        }

        const m = timeLine.match(/([\d:.]+)\s*-->\s*([\d:.]+)/)
        if (!m) continue

        const start = parseTime(m[1])
        const end = parseTime(m[2])

        const textLines = []
        while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i++])
        }
        const cueText = textLines.join('\n')
        cues.push({ id: id ?? cues.length + 1, start, end, text: cueText })
    }
    return cues
}

function parseAtrainJson(text) {
    const parsed = JSON.parse(text)
    const segments = Array.isArray(parsed) ? parsed : parsed?.segments

    if (!Array.isArray(segments)) {
        throw new Error('Expected a JSON array or an object with segments[]')
    }

    const cues = segments
        .filter(segment => this.isFiniteNumber(segment?.start) && this.isFiniteNumber(segment?.end))
        .map((segment, index) => {
            const rawText = typeof segment.text === 'string' ? segment.text : ''
            const speaker = this.getSegmentSpeaker(segment)
            return {
                id: segment.id ?? index + 1,
                start: Number(segment.start),
                end: Number(segment.end),
                text: rawText.trim(),
                speaker,
                sourceSegmentId: segment.id ?? index + 1,
                sourceSegmentIds: [segment.id ?? index + 1]
            }
        })

    return {
        format: 'atrain-json',
        cues,
        sourceData: parsed
    }
}

export {
    parseSubtitleFile,
    parseVtt,
    parseAtrainJson
}