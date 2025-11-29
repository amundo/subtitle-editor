
  // ---------- time helpers ----------

const  formatTime = (seconds) => {
    const s = Math.max(0, seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = (s % 60).toFixed(3)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(6, '0')}`
  }

const parseTime = (str) => {
    const m = str.match(/(\d+):(\d+):(\d+\.\d+)/)
    if (!m) return 0
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  }


const  parseVtt = (text) => {
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

const buildVtt = (cues) => {
  const parts = ['WEBVTT\n']
  for (const cue of cues) {
    parts.push(String(cue.id))
    parts.push(`${formatTime(cue.start)} --> ${formatTime(cue.end)}`)
    parts.push(cue.text || '')
    parts.push('') // blank line
  }
  return parts.join('\n')
}


export {
    parseVtt,
    buildVtt,
    formatTime
}