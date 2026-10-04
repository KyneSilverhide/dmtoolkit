import { describe, it, expect } from 'vitest'
import { renderContentHtml } from './textLinker.js'

describe('renderContentHtml — nettoyage du HTML', () => {
  it('supprime les gestionnaires d\'événements et les scripts', () => {
    const html = renderContentHtml({ description_html: '<p>Ok</p><img src=x onerror="alert(1)"><script>alert(2)</script>' })
    expect(html).toContain('<p>Ok</p>')
    expect(html).not.toMatch(/onerror/i)
    expect(html).not.toMatch(/<script/i)
  })

  it('neutralise les URLs javascript:', () => {
    const html = renderContentHtml({ description_html: '<a href="javascript:alert(1)">x</a>' })
    expect(html).not.toMatch(/javascript:/i)
  })

  it('conserve les tableaux et les attributs data-* du surlignage', () => {
    const html = renderContentHtml({ description_html: '<table><tr><td>1</td></tr></table>' })
    expect(html).toContain('<table>')
    const withState = renderContentHtml({ description: 'La cible est aveuglée.' })
    expect(withState).toContain('data-condition-slug')
  })
})
