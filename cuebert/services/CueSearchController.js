class CueSearchController {
  constructor({
    segmenter = typeof Intl?.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'word' })
      : null
  } = {}) {
    this.segmenter = segmenter
  }

  getMatchedCues({
    cues = [],
    query = '',
    matchCase = false,
    wholeWords = false
  } = {}) {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return cues

    return cues.filter(cue =>
      this.matchesCue(cue, trimmedQuery, { matchCase, wholeWords })
    )
  }

  matchesCue(cue, query, { matchCase = false, wholeWords = false } = {}) {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return true

    const searchableText = this.getSearchableCueText(cue)
    if (!wholeWords) {
      return this.normalize(searchableText, matchCase)
        .includes(this.normalize(trimmedQuery, matchCase))
    }

    const queryWords = this.getWordSegments(trimmedQuery, { matchCase })
    if (!queryWords.length) return false

    const textWords = this.getWordSegments(searchableText, { matchCase })
    return textWords.some((_, index) =>
      queryWords.every((queryWord, offset) =>
        textWords[index + offset] === queryWord
      )
    )
  }

  getSearchableCueText(cue) {
    return [cue?.text, cue?.speaker]
      .filter(Boolean)
      .join('\n')
  }

  getWordSegments(value, { matchCase = false } = {}) {
    const text = this.normalize(value, matchCase)
    if (!this.segmenter) {
      return text.match(/\p{L}[\p{L}\p{N}_'-]*/gu) ?? []
    }

    return Array.from(this.segmenter.segment(text))
      .filter(segment => segment.isWordLike)
      .map(segment => segment.segment)
  }

  normalize(value, matchCase = false) {
    const text = String(value ?? '')
    return matchCase ? text : text.toLocaleLowerCase()
  }
}

export { CueSearchController }
