/**
 * Cálculos puros de los carteles de Inicio (sin Vue ni almacenamiento, para
 * poder probarlos con datos sintéticos).
 */

import { esExcluida } from './wrapped.js'

/** Clave comparable de un nombre: sin tildes, sin mayúsculas y sin espacios sobrantes. */
export function normalizar (texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Elemento más repetido de una lista de escuchas. En empate gana el que se
 * escuchó por última vez más tarde (el más reciente), para que el resultado sea
 * estable y no dependa del orden en que lleguen los eventos.
 */
function masRepetido (eventos, clave, etiqueta) {
  const mapa = new Map()
  for (const e of eventos) {
    const k = clave(e)
    if (!k) continue
    const t = new Date(e?.played_at).getTime() || 0
    const previo = mapa.get(k)
    if (previo) {
      previo.count += 1
      if (t > previo.ultima) previo.ultima = t
    } else {
      mapa.set(k, { ...etiqueta(e), count: 1, ultima: t })
    }
  }
  let mejor = null
  for (const item of mapa.values()) {
    if (!mejor || item.count > mejor.count || (item.count === mejor.count && item.ultima > mejor.ultima)) mejor = item
  }
  if (!mejor) return null
  const { ultima, ...resto } = mejor
  return resto
}

/**
 * Canción más escuchada: misma canción + mismo artista (normalizados). No cuentan
 * los anuncios ni los avisos de Spotify («A continuación», «Up next» del DJ…).
 */
export function cancionTop (eventos) {
  return masRepetido(
    (eventos || []).filter(e => !esExcluida(e)),
    e => (normalizar(e?.track) ? `${normalizar(e.track)}\x00${normalizar(e.artist)}` : ''),
    e => ({ track: String(e.track), artist: String(e.artist ?? '') })
  )
}

/** Artista más escuchado, por nombre normalizado. */
export function artistaTop (eventos) {
  return masRepetido(
    (eventos || []).filter(e => !esExcluida(e)),
    e => normalizar(e?.artist),
    e => ({ artist: String(e.artist) })
  )
}

/**
 * % de variedad: parte de las canciones iniciadas que NO eran duplicadas.
 *
 *   iniciadas  = escuchas registradas + duplicadas saltadas
 *                (las saltadas no llegan a registrarse, así que se suman)
 *   variedad % = (iniciadas − duplicadas detectadas) / iniciadas × 100
 *
 * Devuelve `null` si no hay iniciadas (nada que medir) para no inventar un %.
 */
export function calcularVariedad (escuchas, duplicadas, saltadas) {
  const e = Math.max(0, Number(escuchas) || 0)
  const d = Math.max(0, Number(duplicadas) || 0)
  const s = Math.max(0, Number(saltadas) || 0)
  const iniciadas = e + s
  if (!iniciadas) return null
  const noDuplicadas = Math.min(iniciadas, Math.max(0, iniciadas - d))
  return Math.round((noDuplicadas * 100) / iniciadas)
}

/**
 * Índice de exclusividad: % de duplicadas detectadas que se saltaron.
 *   exclusividad % = saltadas / duplicadas × 100   (tope 100)
 * `null` si no hubo duplicadas.
 */
export function calcularExclusividad (duplicadas, saltadas) {
  const d = Math.max(0, Number(duplicadas) || 0)
  const s = Math.max(0, Number(saltadas) || 0)
  if (!d) return null
  return Math.min(100, Math.round((s * 100) / d))
}
