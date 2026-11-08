/**
 * Cálculos puros de Estadísticas y del Wrapped (sin Vue ni almacenamiento, para
 * poder probarlos con historiales sintéticos).
 *
 * Definiciones (las mismas en la pantalla y en la imagen para compartir):
 *  - Periodos: ventanas móviles, como el resto de carteles de la app
 *    («semana» = últimos 7 días). Semana 7 d · Mes 30 d · Año 365 d.
 *  - Se descartan anuncios y emisiones de Spotify (`esExcluida`).
 *  - Tiempo escuchado: suma de `ms_played`, o de `duration_ms` si aquél falta.
 *  - Este dispositivo = fuente `notification` / `notification_background` (o sin
 *    fuente). Otros dispositivos = `spotify_api`.
 */

const MS_DIA = 86400000
const MS_HORA = 3600000

export const PERIODOS = [
  { clave: 'week', etiqueta: 'Esta semana', dias: 7, titulo: 'Tu semana en música', rango: 'Últimos 7 días' },
  { clave: 'month', etiqueta: 'Este mes', dias: 30, titulo: 'Tu mes en música', rango: 'Últimos 30 días' },
  { clave: 'year', etiqueta: 'Este año', dias: 365, titulo: 'Tu año en música', rango: 'Últimos 365 días' }
]

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

/**
 * Datos del Wrapped de un periodo. `variedad` (0-100 o null) llega calculada
 * desde fuera porque depende de las duplicadas, que no viven en el historial.
 */
export function calcularWrapped (eventos, clave = 'week', ahoraMs = Date.now(), { variedad = null } = {}) {
  const periodo = PERIODOS.find(p => p.clave === clave) || PERIODOS[0]
  const corte = ahoraMs - periodo.dias * MS_DIA
  const lista = (eventos || []).filter(e => {
    const t = new Date(e?.played_at).getTime()
    return Number.isFinite(t) && t >= corte && t <= ahoraMs + MS_HORA && !esExcluida(e)
  })

  let totalMs = 0
  const msPorHora = new Array(24).fill(0)
  const cuentaPorHora = new Array(24).fill(0)
  for (const e of lista) {
    const ms = msDeEvento(e)
    const hora = new Date(e.played_at).getHours()
    totalMs += ms
    msPorHora[hora] += ms
    cuentaPorHora[hora] += 1
  }

  let horaFavorita = null
  if (lista.length) {
    const pesos = totalMs > 0 ? msPorHora : cuentaPorHora
    let mejor = 0
    for (let h = 1; h < 24; h++) if (pesos[h] > pesos[mejor]) mejor = h
    horaFavorita = { hora: mejor, etiqueta: `${String(mejor).padStart(2, '0')}:00` }
  }

  const canciones = top(
    lista,
    e => (normalizarTexto(e.track) ? `${normalizarTexto(e.track)}\x00${normalizarTexto(e.artist)}` : ''),
    e => ({ titulo: String(e.track).trim(), artista: String(e.artist ?? '').trim() }),
    3
  )
  const artistas = top(
    lista,
    e => normalizarTexto(e.artist),
    e => ({ nombre: String(e.artist).trim() }),
    3
  )

  // Mejor racha DENTRO del periodo elegido (la imagen lo rotula «En este periodo»).
  // En «Este año» coincide con el cartel de Estadísticas, que usa 365 días.
  const racha = calcularRacha(lista, ahoraMs, periodo.dias)
  const v = Number.isFinite(variedad) ? Math.max(0, Math.min(100, Math.round(variedad))) : null

  return {
    periodo: periodo.clave,
    etiqueta: periodo.etiqueta,
    titulo: periodo.titulo,
    rango: periodo.rango,
    vacio: lista.length === 0,
    escuchas: lista.length,
    totalMs,
    tiempo: formatearDuracion(totalMs),
    cancionesDistintas: new Set(lista.map(e => `${normalizarTexto(e.track)}\x00${normalizarTexto(e.artist)}`)).size,
    canciones,
    artistas,
    horaFavorita,
    mejorRacha: racha.best,
    variedad: v
  }
}
