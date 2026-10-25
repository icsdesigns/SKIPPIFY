/**
 * Ajustes de Comunidad que afectan a lo que se ve.
 *
 * `gruposConServidor`: si la pestaña Comunidad enseña los grupos con servidor
 * (Firebase). Por defecto está apagado: sólo se ven los grupos sin servidor, y
 * quien quiera los otros los enciende en Ajustes. Apagarlo oculta la sección,
 * no borra nada: los grupos y sus datos siguen donde estaban.
 */
import { ref, watch } from 'vue'

const KEY = 'skippify-community-firebase-groups'

function leer () {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

const gruposConServidor = ref(leer())

watch(gruposConServidor, (v) => {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* sin almacenamiento */ }
})

export function useAjustesComunidad () {
  return { gruposConServidor }
}
