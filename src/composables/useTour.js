/**
 * Estado del tour de la app.
 *
 * Un único estado compartido (lo leen la cabecera, el panel del tour y
 * Configuración). Se guarda en el navegador para que recargar la página no
 * pierda el paso en el que se estaba; al terminar el tour el progreso se borra
 * y sólo queda la marca de «ya visto», que evita que vuelva a abrirse solo.
 */
import { reactive, computed } from 'vue'

export const TOUR_STEPS = 6
export const TOUR_KEY = 'skippify.tour.v2'

const state = reactive({
  /** Paso actual, base 0. */
  step: 0,
  /** Panel del tour a la vista. */
  open: false,
  /** Cerrado sin terminar: la cabecera muestra el icono para retomarlo. */
  minimized: false,
  /** Terminado alguna vez. */
  finished: false,
  /** Hay algo guardado de una sesión anterior (o se ha empezado ya). */
  started: false
})

function clamp (n) {
  const i = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0
  return Math.max(0, Math.min(TOUR_STEPS - 1, i))
}

function save () {
  try {
    if (state.finished) {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ finished: true }))
    } else {
      localStorage.setItem(TOUR_KEY, JSON.stringify({
        step: state.step,
        open: state.open,
        minimized: state.minimized
      }))
    }
  } catch { /* sin almacenamiento: el tour funciona igual, sólo no recuerda */ }
}

/** Lee lo guardado. Se llama una vez al arrancar la app. */
function load () {
  let raw = null
  try { raw = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null') } catch { raw = null }
  if (!raw || typeof raw !== 'object') return
  state.started = true
  if (raw.finished) {
    state.finished = true
    return
  }
  state.step = clamp(raw.step)
  state.open = !!raw.open
  // Sin panel a la vista y sin terminar, la cabecera tiene que ofrecer retomarlo.
  state.minimized = !!raw.minimized || !state.open
}

/** Primera vez: abre el tour desde el primer paso. No hace nada si ya se empezó. */
function autoStart () {
  if (state.started) return
  state.started = true
  state.step = 0
  state.open = true
  state.minimized = false
  save()
}

/** Desde Configuración: retoma el paso pendiente o empieza de cero si ya se terminó. */
function start () {
  if (state.finished) {
    state.finished = false
    state.step = 0
  }
  state.started = true
  state.open = true
  state.minimized = false
  save()
}

/** Cerrar sin terminar: el progreso se conserva y la cabecera enseña el icono. */
function minimize () {
  if (state.finished) return
  state.open = false
  state.minimized = true
  save()
}

function resume () {
  if (state.finished) return
  state.open = true
  state.minimized = false
  save()
}

function finish () {
  state.finished = true
  state.started = true
  state.open = false
  state.minimized = false
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
  state.minimized = false
  state.finished = false
  state.started = false
}

export function useTour () {
  return {
    state,
    /** El icono de la cabecera: hay un tour a medias y el panel está cerrado. */
    showHeaderIcon: computed(() => state.minimized && !state.open && !state.finished),
    load,
    autoStart,
    start,
    minimize,
    resume,
    finish,
    goTo,
    next,
    prev,
    reset
  }
}
