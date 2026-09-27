/**
 * useSleepTimer — temporizador de escucha.
 *
 * La cuenta atrás y el cierre viven en el motor nativo (SleepTimer.java): con
 * la pantalla apagada la WebView no corre, así que aquí sólo se refleja el
 * estado y se mandan las órdenes. Al agotarse el tiempo el motor espera a que
 * acabe la canción, pausa y hace sonar el aviso si se pidió.
 *
 * En el navegador no hay motor nativo: la cuenta atrás se simula en memoria
 * para poder probar la pantalla, y al terminar sólo suena el aviso.
 */
import { computed, reactive } from 'vue'

const OPTIONS_KEY = 'skippify-sleep-timer'

/** Presets de la pantalla, en minutos. */
export const PRESETS_MINUTOS = [15, 30, 45, 60, 90]

/** Tope de la duración: 23 h 59 min, lo que cabe en hh:mm. */
export const MAX_MINUTOS = 23 * 60 + 59

/**
 * Convierte horas y minutos escritos a mano en milisegundos. Devuelve 0 si no
 * es una duración válida (vacía, negativa o por encima de 23:59).
 */
export function duracionMs (horas, minutos) {
  const h = Number.parseInt(horas || 0, 10)
  const m = Number.parseInt(minutos || 0, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m > 59) return 0
  const total = h * 60 + m
  if (total < 1 || total > MAX_MINUTOS) return 0
  return total * 60_000
}

/** «1:05:09» o «4:07»: lo que queda, con las horas sólo si hacen falta. */
export function formatoCuenta (ms) {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dos = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`
}

/** «23:45»: la hora de reloj a la que termina. */
export function horaDeReloj (epochMs) {
  const d = new Date(epochMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** «1 h 30 min», «45 min». */
export function formatoDuracion (minutos) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h && m) return `${h} h ${m} min`
  if (h) return `${h} h`
  return `${m} min`
}

function loadOptions () {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}')
    return {
      sound: !!raw.sound,
      ultimaDuracion: Number(raw.ultimaDuracion) > 0 ? Number(raw.ultimaDuracion) : 30
    }
  } catch {
    return { sound: false, ultimaDuracion: 30 }
  }
}

function saveOptions () {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify({
      sound: state.sound,
      ultimaDuracion: state.ultimaDuracion
    }))
  } catch { /* ignored */ }
}

const opciones = typeof localStorage === 'undefined'
  ? { sound: false, ultimaDuracion: 30 }
  : loadOptions()

const state = reactive({
  /** idle · counting · waiting (esperando fin de canción) · finishing */
  phase: 'idle',
  endAt: 0,
  sound: opciones.sound,
  /** Última duración usada, en minutos: se propone la próxima vez. */
  ultimaDuracion: opciones.ultimaDuracion,
  lastResult: '',
  lastFinishedAt: 0,
  /** Reloj local para la cuenta atrás; se mueve cada segundo con la vista abierta. */
  now: Date.now(),
  nativo: false
})

function plugin () {
  if (typeof window === 'undefined') return null
  return window.Capacitor?.Plugins?.NotifListener || null
}

function aplicar (s) {
  if (!s) return
  state.phase = s.phase || 'idle'
  state.endAt = Number(s.endAt) || 0
  if (typeof s.sound === 'boolean') state.sound = s.sound
  state.lastResult = s.lastResult || ''
  state.lastFinishedAt = Number(s.lastFinishedAt) || 0
}

let iniciado = false
let simulacion = null

async function init () {
  const NL = plugin()
  state.nativo = !!NL?.getSleepTimer
  if (!state.nativo) return
  if (!iniciado) {
    iniciado = true
    try {
      await NL.addListener('sleepTimerChanged', aplicar)
    } catch { /* ignored */ }
  }
  await refrescar()
}

async function refrescar () {
  const NL = plugin()
  if (!NL?.getSleepTimer) return
  try { aplicar(await NL.getSleepTimer()) } catch { /* ignored */ }
}

async function iniciar (minutos) {
  const ms = Math.round(minutos) * 60_000
  if (!(ms >= 60_000)) return
  state.ultimaDuracion = Math.round(minutos)
  saveOptions()

  const NL = plugin()
  if (NL?.startSleepTimer) {
    aplicar(await NL.startSleepTimer({ durationMs: ms, sound: state.sound }))
    return
  }

  // Navegador: simulación en memoria.
  clearTimeout(simulacion)
  state.phase = 'counting'
  state.endAt = Date.now() + ms
  simulacion = setTimeout(terminarSimulacion, ms)
}

function terminarSimulacion () {
  if (state.sound) sonarAvisoWeb()
  state.phase = 'idle'
  state.endAt = 0
  state.lastResult = 'not_playing'
  state.lastFinishedAt = Date.now()
}

async function alargar (minutos) {
  const deltaMs = minutos * 60_000
  const NL = plugin()
  if (NL?.extendSleepTimer) {
    aplicar(await NL.extendSleepTimer({ deltaMs }))
    return
  }
  if (state.phase !== 'counting') return
  state.endAt = Math.max(Date.now() + 60_000, state.endAt + deltaMs)
  clearTimeout(simulacion)
  simulacion = setTimeout(terminarSimulacion, state.endAt - Date.now())
}

async function cancelar () {
  const NL = plugin()
  if (NL?.cancelSleepTimer) {
    aplicar(await NL.cancelSleepTimer())
    return
  }
  clearTimeout(simulacion)
  state.phase = 'idle'
  state.endAt = 0
}

async function setOpciones ({ sound = state.sound } = {}) {
  state.sound = !!sound
  saveOptions()
  const NL = plugin()
  if (NL?.setSleepTimerOptions) {
    try {
      aplicar(await NL.setSleepTimerOptions({ sound: state.sound }))
    } catch { /* ignored */ }
  }
}

async function probarSonido () {
  const NL = plugin()
  if (NL?.testSleepTimerSound) {
    try { await NL.testSleepTimerSound() } catch { /* ignored */ }
    return
  }
  sonarAvisoWeb()
}

/** El mismo aviso que el nativo (la – mi), para el navegador. */
function sonarAvisoWeb () {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[440, 659.25].forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.55
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.56)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1600)
  } catch { /* ignored */ }
}

const restanteMs = computed(() => Math.max(0, state.endAt - state.now))
const activo = computed(() => state.phase !== 'idle')

export function useSleepTimer () {
  return {
    state,
    restanteMs,
    activo,
    init,
    refrescar,
    iniciar,
    alargar,
    cancelar,
    setOpciones,
    probarSonido
  }
}
