import { describe, it, expect } from 'vitest'
import { filterByView, countByView, eventInView, JOURNAL_VIEWS } from './journalViews.js'

const events = [
  { event_type: 'damage' },
  { eventType: 'hexcrawl_step' },
  { event_type: 'purchase_accepted' },
  { event_type: 'join' },
  { event_type: 'type_inconnu' },
]

describe('journalViews', () => {
  it('la vue « all » garde tout, y compris les types inconnus', () => {
    expect(filterByView(events, 'all')).toHaveLength(5)
  })

  it('filtre par catégorie, snake_case ou camelCase', () => {
    expect(filterByView(events, 'combat')).toHaveLength(1)
    expect(filterByView(events, 'exploration')).toHaveLength(1)
    expect(filterByView(events, 'marchands')).toHaveLength(1)
  })

  it('un type inconnu n\'apparaît dans aucune vue filtrée', () => {
    const unknown = { event_type: 'type_inconnu' }
    expect(eventInView(unknown, 'all')).toBe(true)
    for (const v of JOURNAL_VIEWS.filter(v => v.key !== 'all')) {
      expect(eventInView(unknown, v.key)).toBe(false)
    }
  })

  it('compte les événements par vue', () => {
    const c = countByView(events)
    expect(c.all).toBe(5)
    expect(c.table).toBe(1)
    expect(c.rythme).toBe(0)
  })
})
