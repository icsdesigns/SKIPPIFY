/**
 * Cálculos puros de Estadísticas y del Wrapped (sin Vue ni almacenamiento, para
 * poder probarlos con historiales sintéticos).
 *
 * Definiciones (las mismas en la pantalla y en la imagen para compartir):
 *  - El Wrapped es SÓLO mensual y enseña el ÚLTIMO MES: el mes natural completo
 *    anterior al primer día de referencia (el día 1 del mes que empieza o acaba
 *    de empezar). Se desbloquea desde 7 días antes hasta 7 días después de ese
 *    día 1 (ambos incluidos); fuera de esa ventana está bloqueado.
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

/** Días antes del día 1 en que se desbloquea el Wrapped. */
export const DIAS_ANTES_WRAPPED = 7

/** Días después del día 1 hasta los que sigue desbloqueado (el último, incluido). */
export const DIAS_DESPUES_WRAPPED = 7

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Medianoche local del día `dia` del mes `mes` (admite desbordes: día 0, mes 12…). */
function medianoche (anio, mes, dia) {
  return new Date(anio, mes, dia).getTime()
}

/**
 * Ventana de desbloqueo del Wrapped para el instante `ahoraMs`.
 *
 *  - `disponible`: hoy cae entre 7 días antes y 7 días después (ambos incluidos)
 *    de un día 1.
 *  - `desde` / `hasta`: el mes natural que enseña, de su día 1 a las 00:00 (incluido)
 *    al día 1 de referencia a las 00:00 (excluido). Si está bloqueado, es el
 *    último mes natural ya terminado.
 *  - `abre` / `cierra`: cuándo se desbloquea y se vuelve a bloquear la ventana
 *    actual (si está disponible) o la próxima (si no). `cierra` es excluyente.
 */
export function ventanaWrapped (ahoraMs = Date.now()) {
  const hoy = new Date(ahoraMs)
  const a = hoy.getFullYear()
  const m = hoy.getMonth()
  // Días 1 candidatos: el de este mes (cubre sus 7 primeros días) y el del
  // siguiente (cubre los 7 últimos de este).
  for (const ref of [medianoche(a, m, 1), medianoche(a, m + 1, 1)]) {
    const r = new Date(ref)
    const abre = medianoche(r.getFullYear(), r.getMonth(), 1 - DIAS_ANTES_WRAPPED)
    const cierra = medianoche(r.getFullYear(), r.getMonth(), 1 + DIAS_DESPUES_WRAPPED + 1)
    if (ahoraMs >= abre && ahoraMs < cierra) {
      return { disponible: true, desde: medianoche(r.getFullYear(), r.getMonth() - 1, 1), hasta: ref, abre, cierra }
    }
  }
  const s = new Date(medianoche(a, m + 1, 1))
  return {
    disponible: false,
    desde: medianoche(a, m - 1, 1),
    hasta: medianoche(a, m, 1),
    abre: medianoche(s.getFullYear(), s.getMonth(), 1 - DIAS_ANTES_WRAPPED),
    cierra: medianoche(s.getFullYear(), s.getMonth(), 1 + DIAS_DESPUES_WRAPPED + 1)
  }
}

/** «25 nov», «8 dic». */
export function fechaCorta (ms) {
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Periodo en que está desbloqueado: «del 25 nov al 8 dic». */
export function textoVentana (v) {
  return `del ${fechaCorta(v.abre)} al ${fechaCorta(v.cierra - MS_HORA * 12)}`
}

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

/** Anuncios, locuciones del DJ y emisiones de Spotify no cuentan en los rankings. */
export function esExcluida (evento) {
  const track = normalizarTexto(evento?.track)
  const artist = normalizarTexto(evento?.artist)
  const combined = `${track} ${artist}`.trim()
  if (!combined) return false
  if (combined.includes('publicidad')) return true
  if (combined.includes('anuncio')) return true
  if (combined.includes('spotify')) return true
  if (track.includes('dj x') || artist.includes('dj x')) return true
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

/** «1 oct – 31 oct» del mes natural [desde, hasta). */
export function rangoFechas (desdeMs, hastaMs) {
  return `${fechaCorta(desdeMs)} – ${fechaCorta(hastaMs - MS_HORA * 12)}`
}

/** «Octubre de 2026». */
export function nombreMes (desdeMs) {
  const d = new Date(desdeMs + MS_HORA * 12)
  const mes = MESES[d.getMonth()]
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${d.getFullYear()}`
}

/**
 * Datos del Wrapped mensual: SÓLO el último mes natural (ver `ventanaWrapped`).
 * `variedad` (0-100 o null) llega calculada desde fuera —con la misma fórmula
 * que Inicio— porque depende de las duplicadas, que no viven en el historial.
 * `ventana` ({ desde, hasta }) fija el mes a mano; por defecto sale de `ahoraMs`.
 *
 * Devuelve exactamente lo que enseña la imagen: tiempo de escucha, top 3
 * canciones, top 3 artistas, nº de artistas y de canciones distintas, % de
 * variedad y duración media de la sesión.
 */
export function calcularWrapped (eventos, ahoraMs = Date.now(), { variedad = null, ventana = null } = {}) {
  const { desde, hasta } = ventana || ventanaWrapped(ahoraMs)
  const ventanaEventos = (eventos || []).filter(e => {
    const t = new Date(e?.played_at).getTime()
    return Number.isFinite(t) && t >= desde && t < hasta
  })
  const lista = ventanaEventos.filter(e => !esExcluida(e))

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

  const ses = calcularSesiones(ventanaEventos)
  const v = Number.isFinite(variedad) ? Math.max(0, Math.min(100, Math.round(variedad))) : null

  return {
    titulo: 'Tu mes en música',
    rango: 'Último mes',
    mes: nombreMes(desde),
    fechas: rangoFechas(desde, hasta),
    desde,
    hasta,
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
