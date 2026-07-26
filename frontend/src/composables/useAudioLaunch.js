import { ref } from 'vue'

// Pont léger entre CommandPalette (recherche globale de contenu de session) et AudioManager
// (lecteur réel, avec ses <audio> et son graphe Web Audio) : AudioManager peut être déjà monté
// et gardé en vie (<KeepAlive>, voir AdminView.vue) ou pas encore visité du tout dans la session
// — ce ref module-level survit dans les deux cas, contrairement à un event ponctuel qui serait
// perdu si personne n'écoute encore au moment de l'émission.
const pendingTrackId = ref(null)

export function requestAudioLaunch(trackId) {
  pendingTrackId.value = trackId
}

export function usePendingAudioLaunch() {
  return pendingTrackId
}
