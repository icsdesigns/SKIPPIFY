/**
 * useAnalytics — computes KPIs and analytics from the events store.
 */
import { computed, ref } from 'vue'
import { useEventStore } from '@/stores/events'
import {
  REGISTER_DUPLICATE_PROGRESS_RATIO,
  REGISTER_NEW_SONG_PROGRESS_RATIO,
  REGISTER_LISTEN_TIME_PROGRESS_RATIO
} from '@/config/appThresholds'
import { calcularSesiones } from '@/lib/wrapped'

/**
 * Reloj compartido. `computed(() => new Date())` no tiene dependencias reactivas,
 * por lo que Vue lo cachea para siempre y los KPIs "de hoy" se quedaban congelados
 * en el día en que se abrió la app (no cambiaban al pasar la medianoche).
 */
const nowTick = ref(Date.now())

if (typeof window !== 'undefined') {
  setInterval(() => { nowTick.value = Date.now() }, 60_000)
  // Al volver del segundo plano el intervalo puede haberse ralentizado: refrescar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') nowTick.value = Date.now()
  })
}

function hasReachedDuplicateThreshold (event) {
  const dur = Number(event?.duration_ms || 0)
  const ms = Number(event?.ms_played || 0)
  if (!Number.isFinite(dur) || dur <= 0) return false
  if (!Number.isFinite(ms) || ms <= 0) return false
  return (ms / dur) >= REGISTER_DUPLICATE_PROGRESS_RATIO
}

/**
 * Avance realmente medido de una reproducción, en ms, o `null` si no se llegó a
 * medir. `ms_played` sólo se rellena a partir del 80 %; `resume_anchor_ms` guarda
 * el avance bruto con el que se cerró el evento, sea cual sea.
 */
function measuredProgressMs (event) {
  const played = Number(event?.ms_played)
  const anchor = Number(event?.resume_anchor_ms)
  const best = Math.max(
    Number.isFinite(played) ? played : 0,
    Number.isFinite(anchor) ? anchor : 0
  )
  return best > 0 ? best : null
}

export function useAnalytics () {
  const { events } = useEventStore()

  const now = computed(() => new Date(nowTick.value))

  const todayEvents = computed(() => {
    const start = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
    return events.value.filter(e => new Date(e.played_at) >= start)
  })

  const yesterdayEvents = computed(() => {
    const startToday = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
    const startYesterday = new Date(startToday)
    startYesterday.setDate(startYesterday.getDate() - 1)
    return events.value.filter(e => {
      const playedAt = new Date(e.played_at)
      return playedAt >= startYesterday && playedAt < startToday
    })
  })

  const weekEvents = computed(() => {
    const sevenAgo = new Date(nowTick.value - 7 * 86400000)
    return events.value.filter(e => new Date(e.played_at) >= sevenAgo)
  })

  /** Últimos 30 días (ventana móvil, no el mes natural): base de la variedad mensual. */
  const last30Events = computed(() => {
    const desde = nowTick.value - 30 * 86400000
    return events.value.filter(e => new Date(e.played_at).getTime() >= desde)
  })

  /** Los siete días ANTERIORES a la semana en curso: la base de comparación. */
  const previousWeekEvents = computed(() => {
    const desde = nowTick.value - 14 * 86400000
    const hasta = nowTick.value - 7 * 86400000
    return events.value.filter(e => {
      const t = new Date(e.played_at).getTime()
      return t >= desde && t < hasta
    })
  })

  const yearEvents = computed(() => {
    const unAnoAtras = new Date(nowTick.value - 365 * 86400000)
    return events.value.filter(e => new Date(e.played_at) >= unAnoAtras)
  })

  /**
   * Variación porcentual entre dos periodos.
   *
   * Sin base con la que comparar no existe un porcentaje honesto: se devuelve
   * `null` para que la interfaz no pinte un «+100 %» inventado la primera semana.
   */
  function variacion (actual, previo) {
    // Sin semana anterior no hay porcentaje que dar, ni siquiera 0 %: la
    // pastilla se oculta y la pista de debajo explica por qué.
    if (!previo) return null
    return Math.round(((actual - previo) * 100) / previo)
  }

  const kpiToday = computed(() => todayEvents.value.length)

  const kpiTodayChangePct = computed(() => {
    const today = todayEvents.value.length
    const yesterday = yesterdayEvents.value.length
    if (yesterday === 0) return today === 0 ? 0 : 100
    return Math.round(((today - yesterday) * 100) / yesterday)
  })

  const kpiArtists = computed(() => new Set(weekEvents.value.map(e => e.artist)).size)

  const kpiTracks = computed(() => new Set(weekEvents.value.map(e => e.track)).size)

  const kpiArtistsPrevWeek = computed(() => new Set(previousWeekEvents.value.map(e => e.artist)).size)
  const kpiTracksPrevWeek = computed(() => new Set(previousWeekEvents.value.map(e => e.track)).size)

  const kpiArtistsChangePct = computed(() => variacion(kpiArtists.value, kpiArtistsPrevWeek.value))
  const kpiTracksChangePct = computed(() => variacion(kpiTracks.value, kpiTracksPrevWeek.value))

  const monthEvents = computed(() => {
    const n = now.value
    const start = new Date(n.getFullYear(), n.getMonth(), 1)
    return events.value.filter(e => new Date(e.played_at) >= start)
  })

  const top5TracksMonth = computed(() => {
    const map = new Map()
    for (const e of monthEvents.value) map.set(e.track, (map.get(e.track) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([track, count]) => ({ track, count }))
  })

  const top5ArtistsMonth = computed(() => {
    const map = new Map()
    for (const e of monthEvents.value) map.set(e.artist, (map.get(e.artist) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, count]) => ({ artist, count }))
  })

  const quarterEvents = computed(() => {
    const ninetyAgo = new Date(nowTick.value - 90 * 86400000)
    return events.value.filter(e => new Date(e.played_at) >= ninetyAgo)
  })

  const top5TracksQuarter = computed(() => {
    const map = new Map()
    for (const e of quarterEvents.value) map.set(e.track, (map.get(e.track) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([track, count]) => ({ track, count }))
  })

  const duplicatesMonth = computed(() => {
    const eligibleEvents = monthEvents.value.filter(hasReachedDuplicateThreshold)
    const map = new Map()
    for (const e of eligibleEvents) {
      const key = `${e.track}\x00${e.artist}`
      map.set(key, (map.get(key) || 0) + 1)
    }
    let dupeEntries = 0
    let extraPlays = 0
    for (const count of map.values()) {
      if (count > 1) {
        dupeEntries++
        extraPlays += count - 1
      }
    }
    const total = eligibleEvents.length
    const duplicateRate = total ? Math.round((dupeEntries * 100) / total) : 0
    return { dupeEntries, extraPlays, total, duplicateRate }
  })

  /**
   * Escuchas incompletas: las que se quedaron entre el 25 % y el 80 % de la pista.
   *
   * El dato NO puede leerse de `ms_played` a secas: al cerrar una canción por
   * debajo del 80 % se guarda `ms_played = 0` (no computa como tiempo escuchado),
   * y una canción que la app dejó de seguir en segundo plano —desconexión del
   * servicio, proceso reciclado— también se queda en 0 sin haberse escuchado
   * poco. Contar esos ceros era lo que disparaba el porcentaje.
   *
   * `resume_anchor_ms` sí conserva el avance real medido al finalizar el evento,
   * así que es la única fuente fiable cuando `ms_played` viene a cero. Si no hay
   * ninguna de las dos, el evento se queda FUERA del cálculo (sin medida), en vez
   * de contarse como incompleto.
   */
  const incompletePlays = computed(() => {
    let incomplete = 0
    let tracked = 0
    let unmeasured = 0

    for (const item of events.value) {
      const dur = Number(item.duration_ms)
      if (!Number.isFinite(dur) || dur <= 0) continue

      const played = measuredProgressMs(item)
      if (played === null) { unmeasured++; continue }

      tracked++
      const ratio = played / dur
      if (
        ratio >= REGISTER_NEW_SONG_PROGRESS_RATIO &&
        ratio < REGISTER_LISTEN_TIME_PROGRESS_RATIO
      ) incomplete++
    }

    const rate = tracked ? Math.round((incomplete * 100) / tracked) : 0
    return { count: incomplete, tracked, rate, unmeasured }
  })

  // Sesiones: la definición compartida con el Wrapped (`lib/wrapped.js`).
  const sessions = computed(() => calcularSesiones(events.value))

  /** Sesiones del último año: es la ventana que muestran los paneles de Inicio. */
  const sessionsYear = computed(() => calcularSesiones(yearEvents.value))

  /** Top géneros del mes. Sin consumidor en la UI actual; se mantiene expuesto
   *  porque el desglose por género se usa desde los respaldos de Configuración. */
  const genres = computed(() => {
    const map = new Map()
    for (const e of monthEvents.value) {
      const list = Array.isArray(e.genres) ? e.genres : []
      for (const raw of list) {
        const genre = (raw || '').toString().trim()
        if (!genre) continue
        map.set(genre, (map.get(genre) || 0) + 1)
      }
    }
    return {
      top: [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, listens]) => ({ genre, listens }))
    }
  })

  const topArtists = computed(() => {
    const map = new Map()
    for (const e of weekEvents.value) map.set(e.artist, (map.get(e.artist) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, count]) => ({ artist, count }))
  })

  const chartData = computed(() => {
    // Un solo recorrido de los eventos (antes era O(7 × nEventos)).
    const counts = new Map()
    for (const e of weekEvents.value) {
      const x = new Date(e.played_at)
      if (Number.isNaN(x.getTime())) continue
      const key = `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    const labels = []
    const data = []
    const n = now.value
    for (let i = 6; i >= 0; i--) {
      // Se construye desde el mediodía para que los cambios de horario (DST)
      // no desplacen el día calculado.
      const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - i, 12)
      labels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }))
      data.push(counts.get(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`) || 0)
    }
    return { labels, data }
  })

  return {
    kpiToday,
    kpiTodayChangePct,
    kpiArtists,
    kpiTracks,
    kpiArtistsPrevWeek,
    kpiTracksPrevWeek,
    kpiArtistsChangePct,
    kpiTracksChangePct,
    sessionsYear,
    previousWeekEvents,
    yearEvents,
    incompletePlays,
    sessions,
    genres,
    topArtists,
    top5TracksMonth,
    top5ArtistsMonth,
    top5TracksQuarter,
    duplicatesMonth,
    chartData,
    todayEvents,
    weekEvents,
    last30Events,
    nowTick,
    monthEvents
  }
}
