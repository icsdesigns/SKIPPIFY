/**
 * Cálculos puros de Estadísticas y del Wrapped (sin Vue ni almacenamiento, para
 * poder probarlos con historiales sintéticos).
 *
 * Definiciones (las mismas en la pantalla y en la imagen para compartir):
 *  - El Wrapped es SÓLO mensual: «mes» = últimos 30 días (ventana móvil que
 *    acaba ahora), el mismo criterio que la variedad mensual de Inicio
 *    (`last30Events` + `useDuplicateStats().month`), para que las cifras
 *    coincidan. No es el mes natural en curso.
 *  - Se descartan anuncios y emisiones de Spotify (`esExcluida`) del tiempo,
 *    los tops y los recuentos de artistas y canciones.
 *  - Tiempo escuchado: suma de `ms_played`, o de `duration_ms` si aquél falta.
 *  - Sesión: la de la app (`calcularSesiones`, la usa también Inicio): un
 *    hueco de más de 30 min entre dos escuchas empieza otra; dura desde la
 *    primera escucha hasta la última. Se mide con todas las escuchas de la
 *    ventana, como en Inicio.
 *  - Este dispositivo = fuente `notification` / `notification_background` (o sin
 *    fuente). Otros dispositivos = `spotify_api`.
 */

const MS_DIA = 86400000
const MS_HORA = 3600000

/** Días de la ventana del Wrapped (y de la variedad mensual de Inicio). */
export const DIAS_WRAPPED = 30

/** Hueco que separa dos sesiones de escucha, en minutos. */
export const MINUTOS_ENTRE_SESIONES = 30

/** Días de la ventana del cartel «Este dispositivo vs otros». */
export const DIAS_DISPOSITIVOS = 30

export function normalizarTexto (valor) {
  return (valor || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Títulos que Spotify pone en la notificación cuando NO suena una canción: los
 * avisos del DJ («A continuación», «Up next»…). Se comparan normalizados y sólo
 * cuando el título ES eso (o empieza por ello), para no descartar una canción
 * real que contenga esas palabras.
 */
const AVISOS_DE_SPOTIFY = ['a continuacion', 'up next', 'next up', 'coming up next']

function esAvisoDeSpotify (track) {
  return AVISOS_DE_SPOTIFY.some(a => track === a || track.startsWith(`${a} `))
}

/** Anuncios, locuciones y avisos del DJ y emisiones de Spotify no cuentan en los rankings. */
export function esExcluida (evento) {
  const track = normalizarTexto(evento?.track)
  const artist = normalizarTexto(evento?.artist)
  const combined = `${track} ${artist}`.trim()
  if (!combined) return false
  if (combined.includes('publicidad')) return true
  if (combined.includes('anuncio')) return true
  if (combined.includes('advertisement')) return true
  if (combined.includes('spotify')) return true
  if (track.includes('dj x') || artist.includes('dj x') || artist === 'dj') return true
  if (esAvisoDeSpotify(track)) return true
  return false
}

/** Milisegundos escuchados de un evento (0 si no hay medida). */
export function msDeEvento (evento) {
  const played = Number(evento?.ms_played)
  if (Number.isFinite(played) && played > 0) return played
  const dur = Number(evento?.duration_ms)
  if (Number.isFinite(dur) && dur > 0) return dur
  return 0
}

/** Nº de días desde 1970 en hora local (inmune a los cambios de horario). */
export function numeroDiaLocal (fecha) {
  return Math.floor(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / MS_DIA)
}

/**
 * Rachas de días consecutivos con escucha en la ventana indicada.
 * La racha actual sigue viva si hubo escucha hoy o ayer.
 * Garantiza `current <= best`.
 */
export function calcularRacha (eventos, ahoraMs = Date.now(), dias = 365) {
  const corte = ahoraMs - dias * MS_DIA
  const dayNumbers = new Set()
  for (const e of eventos || []) {
    const d = new Date(e?.played_at)
    if (Number.isNaN(d.getTime()) || d.getTime() < corte) continue
    dayNumbers.add(numeroDiaLocal(d))
  }
  const sorted = [...dayNumbers].sort((a, b) => a - b)
  if (!sorted.length) return { current: 0, best: 0, activeDays: 0 }

  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }

  const hoy = numeroDiaLocal(new Date(ahoraMs))
  let current = 0
  const ancla = dayNumbers.has(hoy) ? hoy : (dayNumbers.has(hoy - 1) ? hoy - 1 : null)
  if (ancla !== null) {
    current = 1
    let cursor = ancla - 1
    while (dayNumbers.has(cursor)) { current += 1; cursor -= 1 }
  }
  return { current: Math.min(current, best), best, activeDays: dayNumbers.size }
}

/** Esta escucha se registró en este dispositivo (cualquier fuente salvo la API). */
export function esEsteDispositivo (evento) {
  return String(evento?.source || '') !== 'spotify_api'
}

/**
 * Reparto de escuchas entre este dispositivo y otros (los que sólo ve la API).
 * Porcentajes enteros que siempre suman 100; sin datos devuelven 0/0 y
 * `vacio: true` (nunca NaN). Con `ms` a cero el reparto por tiempo es `null`.
 */
export function repartoDispositivos (eventos, ahoraMs = Date.now(), dias = DIAS_DISPOSITIVOS) {
  const corte = ahoraMs - dias * MS_DIA
  const este = { count: 0, ms: 0 }
  const otros = { count: 0, ms: 0 }
  for (const e of eventos || []) {
    const t = new Date(e?.played_at).getTime()
    if (!Number.isFinite(t) || t < corte || esExcluida(e)) continue
    const bolsa = esEsteDispositivo(e) ? este : otros
    bolsa.count += 1
    bolsa.ms += msDeEvento(e)
  }
  const total = este.count + otros.count
  const totalMs = este.ms + otros.ms
  const pctEste = total ? Math.round((este.count * 100) / total) : 0
  const pctEsteTiempo = totalMs ? Math.round((este.ms * 100) / totalMs) : null
  return {
    este,
    otros,
    total,
    vacio: total === 0,
    hayApi: otros.count > 0,
    pctEste,
    pctOtros: total ? 100 - pctEste : 0,
    pctEsteTiempo,
    pctOtrosTiempo: pctEsteTiempo === null ? null : 100 - pctEsteTiempo
  }
}

/** «12 h 30 min», «2 h», «45 min», «0 min». */
export function formatearDuracion (ms) {
  const minutos = Math.max(0, Math.round((Number(ms) || 0) / 60000))
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

/**
 * Agrupa escuchas en sesiones: un hueco de más de 30 minutos empieza una nueva,
 * y cada sesión dura de su primera escucha a la última. Es LA definición de
 * sesión de la app (Inicio la usa con el último año; el Wrapped, con el mes).
 */
export function calcularSesiones (lista) {
  const tiempos = (lista || [])
    .map(e => new Date(e?.played_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const durations = []
  let start = null
  let end = null
  for (const t of tiempos) {
    if (start === null) { start = t; end = t; continue }
    if ((t - end) / 60000 > MINUTOS_ENTRE_SESIONES) {
      durations.push((end - start) / 60000)
      start = t; end = t
    } else {
      end = t
    }
  }
  if (start !== null) durations.push((end - start) / 60000)
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  return { count: durations.length, averageMinutes: Math.round(avg) }
}

function top (eventos, claveDe, etiquetaDe, n) {
  const mapa = new Map()
  for (const e of eventos) {
    const clave = claveDe(e)
    if (!clave) continue
    const t = new Date(e.played_at).getTime() || 0
    const previo = mapa.get(clave)
    if (previo) {
      previo.count += 1
      if (t > previo.ultima) previo.ultima = t
    } else {
      mapa.set(clave, { ...etiquetaDe(e), count: 1, ultima: t })
    }
  }
  return [...mapa.values()]
    .sort((a, b) => b.count - a.count || b.ultima - a.ultima)
    .slice(0, n)
    .map(({ ultima, ...resto }) => resto)
}

/** Clave de canción (título + artista normalizados), vacía si no hay título. */
function claveCancion (e) {
  const t = normalizarTexto(e?.track)
  return t ? `${t}\x00${normalizarTexto(e?.artist)}` : ''
}

/** «11 oct – 10 nov» de la ventana que acaba en `ahoraMs`. */
export function rangoFechas (ahoraMs, dias = DIAS_WRAPPED) {
  const f = ms => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${f(ahoraMs - (dias - 1) * MS_DIA)} – ${f(ahoraMs)}`
}

/**
 * Datos del Wrapped mensual (últimos 30 días). `variedad` (0-100 o null) llega
 * calculada desde fuera —con la misma fórmula y ventana que Inicio— porque
 * depende de las duplicadas, que no viven en el historial.
 *
 * Devuelve exactamente lo que enseña la imagen: tiempo de escucha, top 3
 * canciones, top 3 artistas, nº de artistas y de canciones distintas, % de
 * variedad y duración media de la sesión.
 */
export function calcularWrapped (eventos, ahoraMs = Date.now(), { variedad = null } = {}) {
  const corte = ahoraMs - DIAS_WRAPPED * MS_DIA
  const ventana = (eventos || []).filter(e => {
    const t = new Date(e?.played_at).getTime()
    return Number.isFinite(t) && t >= corte && t <= ahoraMs + MS_HORA
  })
  const lista = ventana.filter(e => !esExcluida(e))

  let totalMs = 0
  for (const e of lista) totalMs += msDeEvento(e)

  const canciones = top(
    lista,
    claveCancion,
    e => ({ titulo: String(e.track).trim(), artista: String(e.artist ?? '').trim() }),
    3
  )
  const artistas = top(
    lista,
    e => normalizarTexto(e.artist),
    e => ({ nombre: String(e.artist).trim() }),
    3
  )

  const artistasDistintos = new Set(lista.map(e => normalizarTexto(e?.artist)).filter(Boolean)).size
  const cancionesDistintas = new Set(lista.map(claveCancion).filter(Boolean)).size

  const ses = calcularSesiones(ventana)
  const v = Number.isFinite(variedad) ? Math.max(0, Math.min(100, Math.round(variedad))) : null

  return {
    titulo: 'Tu mes en música',
    rango: 'Últimos 30 días',
    fechas: rangoFechas(ahoraMs),
    vacio: lista.length === 0,
    totalMs,
    tiempo: formatearDuracion(totalMs),
    canciones,
    artistas,
    artistasDistintos,
    cancionesDistintas,
    variedad: v,
    sesiones: ses.count,
    sesionMediaMin: ses.count ? ses.averageMinutes : null,
    sesionMedia: ses.count ? formatearDuracion(ses.averageMinutes * 60000) : null
  }
}
