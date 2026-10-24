/**
 * Lo que el árbol de Comunidad necesita saber de los grupos sin servidor, sin
 * cargar el modo sin servidor.
 *
 * useLocalLeague importa el núcleo criptográfico (libsodium en WASM) de forma
 * estática, así que importarlo desde la pestaña haría pagar ese peso a quien
 * sólo usa el modo con servidor. Este módulo no importa nada pesado:
 *   · Mientras el panel sin servidor no se ha abierto, la lista sale de la caché
 *     que el propio composable guarda en localStorage (nombre, papel y grupo
 *     activo; no hay estado de entrada ni cifras, que viven en memoria).
 *   · En cuanto el panel se carga, se conecta aquí con sus objetos reactivos y
 *     el árbol pasa a leerlos en vivo, también al volver al modo con servidor:
 *     el composable sigue sincronizando aunque el panel se desmonte.
 */
import { computed, ref, shallowRef } from 'vue'

const STATE_KEY = 'skippify-localhost-state'

/** { state, statuses, members, leaderboards } de useLocalLeague, o null. */
const vivo = shallowRef(null)
const copia = ref(leerCopia())

/**
 * Grupo pedido desde el árbol. El panel lo atiende al montarse (o al momento si
 * ya está montado) y lo vacía; antes de eso no hay a quién decírselo.
 */
export const grupoLocalPedido = ref('')

function leerCopia () {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STATE_KEY) : null
    const parsed = raw ? JSON.parse(raw) : null
    return {
      groups: Array.isArray(parsed?.groups) ? parsed.groups.filter(g => g?.groupId) : [],
      activeGroupId: (parsed?.activeGroupId || '').toString()
    }
  } catch {
    return { groups: [], activeGroupId: '' }
  }
}

/** Vuelve a leer la caché: el servicio en segundo plano pudo escribirla con la app cerrada. */
export function releerCopiaLocal () {
  if (!vivo.value) copia.value = leerCopia()
}

export function conectarLocal (fuentes) {
  vivo.value = fuentes
}

export function pedirGrupoLocal (groupId) {
  grupoLocalPedido.value = groupId
  if (!vivo.value) copia.value = { ...copia.value, activeGroupId: groupId }
}

/** Grupos sin servidor en el formato del árbol: `{ id, nombre, estado, miembros, minutos }`. */
export const gruposLocales = computed(() => {
  const v = vivo.value
  const lista = v ? v.state.value.groups : copia.value.groups
  return lista.map(g => {
    const lb = v?.leaderboards[g.groupId]
    return {
      id: g.groupId,
      nombre: g.name || 'Grupo',
      estado: v ? (v.statuses[g.groupId] || 'ready') : '',
      miembros: v ? (v.members[g.groupId] || []).length : 0,
      minutos: (lb?.members || []).reduce((s, m) => s + (Number(m.totalMinutes) || 0), 0)
    }
  })
})

export const grupoLocalActivo = computed(() =>
  vivo.value ? vivo.value.state.value.activeGroupId : copia.value.activeGroupId)
