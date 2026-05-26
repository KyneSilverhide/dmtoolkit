import { reactive } from 'vue'
import { BACKEND_URL } from '@/config.js'

const STORAGE_KEY = 'rn-last-viewed'

function compareSemver(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

export const releaseNotesStore = reactive({
  notes: [],
  lastViewed: localStorage.getItem(STORAGE_KEY) || '0.0.0',
  isOpen: false,

  unreadFor(role) {
    return this.notes.filter(note => {
      if (compareSemver(note.version, this.lastViewed) <= 0) return false
      const relevant = note.changes.filter(c => c.role === 'all' || c.role === role)
      return relevant.length > 0
    }).map(note => ({
      ...note,
      changes: note.changes.filter(c => c.role === 'all' || c.role === role),
    }))
  },

  hasUnreadFor(role) {
    return this.unreadFor(role).length > 0
  },

  latestVersion() {
    if (!this.notes.length) return '0.0.0'
    return this.notes.reduce((latest, note) =>
      compareSemver(note.version, latest) > 0 ? note.version : latest,
      '0.0.0'
    )
  },

  markRead() {
    const v = this.latestVersion()
    this.lastViewed = v
    localStorage.setItem(STORAGE_KEY, v)
  },

  async load() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/release-notes`)
      if (res.ok) {
        const data = await res.json()
        this.notes = data.notes || []
      }
    } catch { /* silent */ }
  },
})
