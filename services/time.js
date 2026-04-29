export function formatTime(seconds) {
    const s = Math.max(0, seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = (s % 60).toFixed(3)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
      sec
    ).padStart(6, '0')}`
  }

export function   parseTime(str) {
    const m = str.match(/(\d+):(\d+):(\d+\.\d+)/)
    if (!m) return 0
    return +m[1] * 3600 + +m[2] * 60 + +m[3]
  }