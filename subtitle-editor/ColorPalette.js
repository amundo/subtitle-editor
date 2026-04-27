// color-palette.js
// Simple palette viewer for CSS variables defined in colors.css
// No Shadow DOM, just light DOM + classes.

class ColorPalette extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    // If you've already populated it, don't stomp on it
    if (this._initialized) return
    this._initialized = true

    this.classList.add('color-palette-root')

    // Optionally allow a "mode" attribute later, but for now: fixed groups
    const groups = [
      {
        title: 'Primary',
        vars: [
          '--primary-10',
          '--primary-20',
          '--primary-30',
          '--primary-40',
          '--primary-50',
          '--primary-60',
          '--primary-70',
          '--primary-80',
          '--primary-90',
        ],
      },
      {
        title: 'Secondary',
        vars: [
          '--secondary-10',
          '--secondary-20',
          '--secondary-30',
          '--secondary-40',
          '--secondary-50',
          '--secondary-60',
          '--secondary-70',
          '--secondary-80',
          '--secondary-90',
        ],
      },
      {
        title: 'Accent',
        vars: [
          '--accent-10',
          '--accent-20',
          '--accent-30',
          '--accent-40',
          '--accent-50',
          '--accent-60',
          '--accent-70',
          '--accent-80',
          '--accent-90',
        ],
      },
      {
        title: 'Neutrals',
        vars: [
          '--neutral-0',
          '--neutral-50',
          '--neutral-100',
          '--neutral-200',
          '--neutral-300',
          '--neutral-400',
          '--neutral-500',
          '--neutral-600',
          '--neutral-700',
          '--neutral-800',
          '--neutral-900',
        ],
      },
      {
        title: 'Semantic surfaces',
        vars: [
          '--color-bg',
          '--color-bg-muted',
          '--color-bg-subtle',
          '--surface-1',
          '--surface-2',
          '--surface-3',
        ],
      },
      {
        title: 'Semantic text',
        vars: [
          '--color-text',
          '--color-text-muted',
          '--color-text-soft',
          '--color-primary',
          '--color-secondary',
          '--color-accent',
        ],
      },
    ]

    const rootStyle = getComputedStyle(document.documentElement)

    const container = document.createElement('div')
    container.className = 'palette-grid stack-md'

    for (const group of groups) {
      const section = document.createElement('section')
      section.className = 'palette-group'

      const heading = document.createElement('h2')
      heading.className = 'palette-heading'
      heading.textContent = group.title
      section.appendChild(heading)

      const swatchRow = document.createElement('div')
      swatchRow.className = 'palette-swatch-row'

      for (const variableName of group.vars) {
        const value = rootStyle.getPropertyValue(variableName).trim()
        if (!value) continue // skip undefined vars

        const swatch = document.createElement('div')
        swatch.className = 'palette-swatch card'

        const colorBox = document.createElement('div')
        colorBox.className = 'palette-swatch-box'
        colorBox.style.backgroundColor = `var(${variableName})`

        const meta = document.createElement('div')
        meta.className = 'palette-swatch-meta'

        const nameEl = document.createElement('div')
        nameEl.className = 'palette-swatch-name text-muted'
        nameEl.textContent = variableName

        const valueEl = document.createElement('div')
        valueEl.className = 'palette-swatch-value'
        valueEl.textContent = value

        meta.appendChild(nameEl)
        meta.appendChild(valueEl)

        swatch.appendChild(colorBox)
        swatch.appendChild(meta)

        swatchRow.appendChild(swatch)
      }

      section.appendChild(swatchRow)
      container.appendChild(section)
    }

    this.appendChild(container)
  }
}

customElements.define('color-palette', ColorPalette)
export { ColorPalette }
