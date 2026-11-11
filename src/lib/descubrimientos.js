/**
 * Descubrimientos de artista: cálculo puro (sin Vue ni almacenamiento, para
 * poder probarlo con historiales sintéticos). Lo usan la tarjeta de Inicio
 * (`useDescubrimientos`) y el Wrapped mensual (`calcularWrapped`).
 *
 * Reglas (aprobadas por Iván):
 *  - Desbloqueo: el historial de la app tiene al menos 300 CANCIONES ÚNICAS
 *    (título + artista normalizados con `normalizarTexto`), sin anuncios ni
 *    emisiones de Spotify (`esExcluida`). Antes no se detecta nada.
 *  - Ventana: los últimos 30 días (`DIAS_WRAPPED`), la misma del Wrapped y de
 *    la variedad mensual de Inicio, para que las cifras coincidan.
 *  - Un artista es descubrimiento cuando, a la vez:
 *      · antes de la ventana apenas lo habías oído: ≤ 2 escuchas y ≤ 1 canción;
 *      · en la ventana: ≥ 4 canciones distintas y ≥ 6 escuchas;
 *      · repartidas en ≥ 2 días distintos (un atracón de una tarde no cuenta).
 *  - Artista principal: el primer nombre antes de la primera coma («Ana, Luis»
 *    cuenta para Ana), para que un colaborador suelto no salga como nuevo.
 *  - Si hay varios, gana el de más canciones distintas; luego más escuchas;
 *    luego más días activos (y, para que el orden sea estable, el más reciente
 *    y por último el nombre).
 *  - Las escuchas con fecha ilegible o en el futuro (más de 1 h, el mismo
 *    margen que el Wrapped) se ignoran por completo.
 */
import { DIAS_WRAPPED, esExcluida, normalizarTexto, numeroDiaLocal } from '@/lib/wrapped'

const MS_DIA = 86400000
const MS_HORA = 3600000

/** Canciones únicas que hacen falta para desbloquear los descubrimientos. */
export const UMBRAL_CANCIONES_UNICAS = 300
/** Antes de la ventana: como mucho estas escuchas del artista… */
export const PREVIO_MAX_ESCUCHAS = 2
/** …y como mucho estas canciones distintas suyas. */
export const PREVIO_MAX_CANCIONES = 1
/** En la ventana: al menos estas canciones distintas… */
export const MIN_CANCIONES = 4
/** …al menos estas escuchas… */
export const MIN_ESCUCHAS = 6
/** …en al menos estos días distintos. */
export const MIN_DIAS = 2

/** Nombre del artista principal tal cual viene (primer nombre antes de la coma). */
export function artistaPrincipalTexto (artista) {
  return String(artista ?? '').split(',')[0].replace(/\s+/g, ' ').trim()
}

/** Clave del artista principal (normalizada; vacía si no hay nombre). */
export function claveArtistaPrincipal (artista) {
  return normalizarTexto(artistaPrincipalTexto(artista))
}

function fechaValida (e, limite) {
  const t = new Date(e?.played_at).getTime()
  return Number.isFinite(t) && t <= limite ? t : null
}

/** Nº de canciones únicas (título + artista normalizados) de un historial. */
export function contarCancionesUnicas (eventos, ahoraMs = Date.now()) {
  const limite = ahoraMs + MS_HORA
  const claves = new Set()
  for (const e of Array.isArray(eventos) ? eventos : []) {
    if (!e || esExcluida(e) || fechaValida(e, limite) === null) continue
    const t = normalizarTexto(e.track)
    if (t) claves.add(`${t}\x00${normalizarTexto(e.artist)}`)
  }
  return claves.size
}

function compararCandidatos (a, b) {
  return b.cancionesDistintas - a.cancionesDistintas ||
    b.escuchas - a.escuchas ||
    b.diasActivos - a.diasActivos ||
    b.ultimaEscucha - a.ultimaEscucha ||
    a.clave.localeCompare(b.clave)
}

/**
 * Estado de los descubrimientos con el historial `eventos` a la hora `ahoraMs`.
 *
 * Devuelve `{ desbloqueado, cancionesUnicas, umbral, progreso (0-1),
 * descubrimiento, candidatos }`. `descubrimiento` es el principal (o null) con
 * `{ artista, cancionesNuevas, cancionesDistintas, escuchas, diasActivos,
 * primeraEscucha (ms), ultimaEscucha (ms), canciones: [top 3 { titulo, escuchas }],
 * previo: { escuchas, canciones } }`; `candidatos` son todos los que cumplen,
 * ya ordenados (el primero es el principal). Bloqueado, no hay candidatos.
 */
export function estadoDescubrimientos (eventos, ahoraMs = Date.now()) {
  const ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now()
  const lista = Array.isArray(eventos) ? eventos : []
  const cancionesUnicas = contarCancionesUnicas(lista, ahora)
  const umbral = UMBRAL_CANCIONES_UNICAS
  const desbloqueado = cancionesUnicas >= umbral
  const base = {
    desbloqueado,
    cancionesUnicas,
    umbral,
    progreso: Math.max(0, Math.min(1, cancionesUnicas / umbral)),
    descubrimiento: null,
    candidatos: []
  }
  if (!desbloqueado) return base

  const corte = ahora - DIAS_WRAPPED * MS_DIA
  const limite = ahora + MS_HORA
  /** clave de artista → { previo, ventana } */
  const artistas = new Map()
  const datosDe = clave => {
    let d = artistas.get(clave)
    if (!d) {
      d = {
        previoEscuchas: 0,
        previoCanciones: new Set(),
        escuchas: 0,
        canciones: new Map(),
        dias: new Set(),
        primera: Infinity,
        ultima: -Infinity,
        nombre: '',
        tNombre: -Infinity
      }
      artistas.set(clave, d)
    }
    return d
  }

  for (const e of lista) {
    if (!e || esExcluida(e)) continue
    const t = fechaValida(e, limite)
    if (t === null) continue
    const clave = claveArtistaPrincipal(e.artist)
    if (!clave) continue
    const d = datosDe(clave)
    const cancion = normalizarTexto(e.track)
    if (t < corte) {
      d.previoEscuchas += 1
      if (cancion) d.previoCanciones.add(cancion)
      continue
    }
    d.escuchas += 1
    d.dias.add(numeroDiaLocal(new Date(t)))
    if (t < d.primera) d.primera = t
    if (t > d.ultima) d.ultima = t
    // El nombre que se enseña es el de la escucha más reciente.
    if (t >= d.tNombre) { d.nombre = artistaPrincipalTexto(e.artist); d.tNombre = t }
    if (cancion) {
      const c = d.canciones.get(cancion)
      if (c) {
        c.escuchas += 1
        if (t >= c.ultima) { c.ultima = t; c.titulo = String(e.track).replace(/\s+/g, ' ').trim() }
      } else {
        d.canciones.set(cancion, { titulo: String(e.track).replace(/\s+/g, ' ').trim(), escuchas: 1, ultima: t })
      }
    }
  }

  const candidatos = []
  for (const [clave, d] of artistas) {
    if (d.previoEscuchas > PREVIO_MAX_ESCUCHAS || d.previoCanciones.size > PREVIO_MAX_CANCIONES) continue
    if (d.canciones.size < MIN_CANCIONES || d.escuchas < MIN_ESCUCHAS || d.dias.size < MIN_DIAS) continue
    let nuevas = 0
    for (const c of d.canciones.keys()) if (!d.previoCanciones.has(c)) nuevas += 1
    const canciones = [...d.canciones.values()]
      .sort((a, b) => b.escuchas - a.escuchas || b.ultima - a.ultima || a.titulo.localeCompare(b.titulo))
      .slice(0, 3)
      .map(({ titulo, escuchas }) => ({ titulo, escuchas }))
    candidatos.push({
      clave,
      artista: d.nombre,
      cancionesNuevas: nuevas,
      cancionesDistintas: d.canciones.size,
      escuchas: d.escuchas,
      diasActivos: d.dias.size,
      primeraEscucha: d.primera,
      ultimaEscucha: d.ultima,
      canciones,
      previo: { escuchas: d.previoEscuchas, canciones: d.previoCanciones.size }
    })
  }
  candidatos.sort(compararCandidatos)
  return { ...base, descubrimiento: candidatos[0] || null, candidatos }
}

/** «hoy», «desde ayer», «desde hace 12 días» (desde la primera escucha en la ventana). */
export function desdeCuando (primeraMs, ahoraMs = Date.now()) {
  if (!Number.isFinite(primeraMs)) return ''
  const dias = numeroDiaLocal(new Date(ahoraMs)) - numeroDiaLocal(new Date(primeraMs))
  if (dias <= 0) return 'desde hoy'
  if (dias === 1) return 'desde ayer'
  return `desde hace ${dias} días`
}

/** «1 canción nueva» / «5 canciones nuevas». */
export function textoCancionesNuevas (n) {
  return n === 1 ? '1 canción nueva' : `${n} canciones nuevas`
}

/** «1 escucha» / «12 escuchas». */
export function textoEscuchas (n) {
  return n === 1 ? '1 escucha' : `${n} escuchas`
}
