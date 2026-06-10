import { ref } from 'vue'
import { authStore } from '@/stores/auth.js'
import { sessionStore } from '@/stores/session.js'
import { BACKEND_URL } from '@/config.js'

export function useMapUpload() {
  const images = ref([])
  const uploading = ref(false)
  const uploadError = ref('')
  const uploadProgress = ref(0)
  const dragOver = ref(false)

  async function loadImages() {
    if (!sessionStore.activeSession) return
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images?type=map`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (res.ok) images.value = await res.json()
    } catch (err) { console.error(err) }
  }

  function uploadFiles(files) {
    if (!files.length || !sessionStore.activeSession) return
    uploading.value = true
    uploadError.value = ''
    uploadProgress.value = 0
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('session_id', sessionStore.activeSession.id)
    formData.append('type', 'map')
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        await loadImages()
      } else {
        try { uploadError.value = JSON.parse(xhr.responseText).error || 'Erreur.' }
        catch { uploadError.value = 'Erreur.' }
      }
      uploading.value = false
      uploadProgress.value = 0
    })
    xhr.addEventListener('error', () => {
      uploadError.value = 'Erreur de connexion.'
      uploading.value = false
      uploadProgress.value = 0
    })
    xhr.open('POST', `${BACKEND_URL}/api/uploads`)
    xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
    xhr.send(formData)
  }

  function handleFileUpload(event) {
    uploadFiles(Array.from(event.target.files || []))
    event.target.value = ''
  }

  function onDragOver(e) {
    if (uploading.value || !sessionStore.activeSession) return
    e.preventDefault()
    dragOver.value = true
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = false
  }

  function onDrop(e) {
    e.preventDefault()
    dragOver.value = false
    if (uploading.value || !sessionStore.activeSession) return
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length) uploadFiles(files)
  }

  async function deleteImage(img) {
    if (!sessionStore.activeSession) return false
    if (!confirm(`Supprimer "${img.original_name || img.url}" ?`)) return false
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionStore.activeSession.id}/images/${img.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` },
      })
      if (res.ok) {
        await loadImages()
        return true
      }
    } catch (err) { console.error(err) }
    return false
  }

  return {
    images, uploading, uploadError, uploadProgress, dragOver,
    loadImages, uploadFiles, handleFileUpload,
    onDragOver, onDragLeave, onDrop, deleteImage,
  }
}
