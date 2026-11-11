/**
 * useDuplicateStats — duplicadas detectadas y saltadas, por ventanas de tiempo.
 *
 * El motor nativo lleva sus propios contadores: es el único que sabe cuántas
 * duplicadas ha visto, porque las que salta no llegan a registrarse como
 * escucha y por tanto no existen en el historial de JavaScript.
 *
 * Hasta ahora sólo publicaba los contadores del día en curso, que se ponen a
 * cero cada medianoche. Aquí se acumula el histórico diario que expone el
 * plugin (`getDailyStatsHistory`) y se guarda una copia en localStorage: así el
 * dato semanal sobrevive a los reinicios y sigue estando disponible aunque el
 * puente nativo no responda en ese momento (o se abra la app en el navegador).
 */
import { computed, reactive } from 'vue'

const STORAGE_KEY = 'skippify-duplicate-daily'
/** Días que se conservan en la copia local. */
const LIMITE_DIAS = 400

const state = reactive({
  /** [{ day: 20260831, duplicates, skipped }] del más reciente al más antiguo. */
  days: cargar(),
  /** `true` en cuanto el motor nativo ha contestado alguna vez. */
  nativo: false
})

function cargar () {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(esDiaValido) : []
  } catch {
    return []
  }
}

function esDiaValido (d) {
  return !!d && Number.isFinite(Number(d.day)) && Number(d.day) > 19700101
}

function guardar () {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.days)) } catch { /* ignored */ }
}

/** AAAAMMDD → marca de tiempo del mediodía de ese día (inmune a cambios de hora). */
function selloAFecha (sello) {
  const n = Number(sello)
  const y = Math.floor(n / 10000)
  const m = Math.floor((n % 10000) / 100)
  const d = n % 100
  return new Date(y, m - 1, d, 12).getTime()
}

function selloDeHoy () {
  const n = new Date()
  return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate()
}

/**
 * Funde lo que devuelve el motor con lo ya guardado.
 *
 * El motor manda siempre la verdad de cada día que conoce, así que sus cifras
 * mandan sobre la copia local; los días que él ya no conserva se mantienen.
 */
function fusionar (entrantes) {
  const mapa = new Map()
  for (const dia of state.days) mapa.set(Number(dia.day), dia)
  for (const dia of entrantes) {
    if (!esDiaValido(dia)) continue
    mapa.set(Number(dia.day), {
      day: Number(dia.day),
      duplicates: Math.max(0, Number(dia.duplicates) || 0),
      skipped: Math.max(0, Number(dia.skipped) || 0)
    })
  }
  state.days = [...mapa.values()]
    .sort((a, b) => b.day - a.day)
    .slice(0, LIMITE_DIAS)
  guardar()
}

function plugin () {
  return (typeof window !== 'undefined' && window.Capacitor?.Plugins?.NotifListener) || null
}

/** Relee los contadores del motor nativo. Silencioso si no hay puente. */
async function refresh () {
  const NL = plugin()
  if (!NL) return false

  let entrantes = []
  try {
    if (NL.getDailyStatsHistory) {
      const res = await NL.getDailyStatsHistory()
      if (Array.isArray(res?.days)) entrantes = res.days
    }
  } catch { /* ignored */ }

  // Versiones del APK anteriores al histórico sólo publican el día en curso;
  // acumulándolo en cada apertura la serie se va formando igualmente.
  if (!entrantes.length && NL.getDailyStats) {
    try {
      const hoy = await NL.getDailyStats()
      if (hoy) entrantes = [{ day: selloDeHoy(), duplicates: hoy.duplicates, skipped: hoy.skipped }]
    } catch { /* ignored */ }
  }

  if (!entrantes.length) return false
  state.nativo = true
  fusionar(entrantes)
  return true
}

/** Suma de un tramo de días, ambos extremos en días atrás desde hoy. */
function sumar (desdeDiasAtras, hastaDiasAtras) {
  const ahora = Date.now()
  const desde = ahora - desdeDiasAtras * 86400000
  const hasta = ahora - hastaDiasAtras * 86400000
  let duplicates = 0
  let skipped = 0
  for (const dia of state.days) {
    const t = selloAFecha(dia.day)
    if (t >= desde && t < hasta) {
      duplicates += Number(dia.duplicates) || 0
      skipped += Number(dia.skipped) || 0
    }
  }
  return { duplicates, skipped }
}

/** Suma de los días con sello en [desdeMs, hastaMs) (marcas de tiempo absolutas). */
function sumarEntre (desdeMs, hastaMs) {
  let duplicates = 0
  let skipped = 0
  for (const dia of state.days) {
    const t = selloAFecha(dia.day)
    if (t >= desdeMs && t < hastaMs) {
      duplicates += Number(dia.duplicates) || 0
      skipped += Number(dia.skipped) || 0
    }
  }
  return { duplicates, skipped }
}

export function useDuplicateStats () {
  // El tramo se abre en «hace 7 días» y se cierra en mañana, para que el día en
  // curso entre completo aunque su sello sea de hoy al mediodía.
  const week = computed(() => sumar(7, -1))
  const previousWeek = computed(() => sumar(14, 7))

  /** Últimos 30 días (ventana móvil), con el día en curso incluido. */
  const month = computed(() => sumar(30, -1))
  const monthDuplicates = computed(() => month.value.duplicates)
  const monthSkipped = computed(() => month.value.skipped)

  const weekDuplicates = computed(() => week.value.duplicates)
  const weekSkipped = computed(() => week.value.skipped)

  /** `false` mientras no haya ningún dato: la interfaz muestra «—», no un 0. */
  const hasData = computed(() => state.nativo || state.days.length > 0)

  return {
    state,
    refresh,
    entre: sumarEntre,
    week,
    previousWeek,
    month,
    monthDuplicates,
    monthSkipped,
    weekDuplicates,
    weekSkipped,
    hasData
  }
}
