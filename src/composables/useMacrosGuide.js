/**
 * Estado de la guía animada de la pestaña Macros.
 *
 * Un único estado compartido: lo leen el panel (en la pestaña Macros) y la
 * cabecera de la app, que enseña un icono para reabrirla. Se guarda en el
 * navegador. La guía se abre sola la primera vez que se entra en Macros; al
 * cerrarla queda minimizada en el icono de la cabecera, que sólo se ve en esa
 * pestaña y se queda ahí para poder repasarla cuando se quiera.
 */
import { reactive, computed } from 'vue'

export const MACROS_GUIDE_STEPS = 3
export const MACROS_GUIDE_KEY = 'skippify.macros-guide.v1'

const state = reactive({
  /** Paso actual, base 0. */
  step: 0,
  /** Panel a la vista. */
  open: false,
  /** Ya se ha enseñado alguna vez: no vuelve a abrirse solo. */
  seen: false
})

function clamp (n) {
  const i = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0
  return Math.max(0, Math.min(MACROS_GUIDE_STEPS - 1, i))
}

function save () {
  try {
    localStorage.setItem(MACROS_GUIDE_KEY, JSON.stringify({ seen: state.seen, step: state.step }))
  } catch { /* sin almacenamiento: la guía funciona igual, sólo no recuerda */ }
}

/** Lee lo guardado. */
function load () {
  let raw = null
  try { raw = JSON.parse(localStorage.getItem(MACROS_GUIDE_KEY) || 'null') } catch { raw = null }
  if (!raw || typeof raw !== 'object') return
  state.seen = !!raw.seen
  state.step = clamp(raw.step)
}

// Se lee al cargar el módulo: la pestaña Macros puede ser la primera en montarse
// (la app se reabre en ella) y entonces nadie habría llamado aún a `load()`.
load()

/** Primera vez en la pestaña: abre la guía desde el primer paso. Una sola vez. */
function autoStart () {
  if (state.seen) return false
  state.seen = true
  state.step = 0
  state.open = true
  save()
  return true
}

/** Desde el icono de la cabecera: la abre en el paso en que se dejó. */
function open () {
  state.seen = true
  state.open = true
  save()
}

/** Cerrar sin terminar: se conserva el paso y queda el icono. */
function minimize () {
  state.open = false
  save()
}

/** Último paso: se cierra y la próxima vez empieza desde el principio. */
function finish () {
  state.open = false
  state.step = 0
  save()
}

function goTo (i) {
  state.step = clamp(i)
  save()
}

function next () { goTo(state.step + 1) }
function prev () { goTo(state.step - 1) }

/** Sólo para pruebas: deja el estado como recién instalado. */
function reset () {
  state.step = 0
  state.open = false
  state.seen = false
}

export function useMacrosGuide () {
  return {
    state,
    /** El icono de la cabecera: la guía ya se enseñó y el panel está cerrado. */
    showHeaderIcon: computed(() => state.seen && !state.open),
    load,
    autoStart,
    open,
    minimize,
    finish,
    goTo,
    next,
    prev,
    reset
  }
}
