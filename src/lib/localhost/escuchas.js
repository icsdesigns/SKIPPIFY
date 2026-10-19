/**
 * Escuchas del modo LocalHost: formato compacto, compresión y ranking.
 *
 * Una escucha viaja como tupla
 *   [eid, playedAtMs, track, artist, durationMs, msPlayed, measuredMs]
 * y se agrupa en lotes (un registro del grupo por lote). El `eid` es un hash
 * determinista, así que publicar dos veces la misma escucha no la cuenta dos
 * veces: al leer se deduplica por (persona, eid).
 *
 * La puntuación es la misma que la de Firebase (`firebase/functions/scoring.js`),
 * importada tal cual: ambos modos dan las mismas cifras con los mismos datos.
 */
import { scoreMember } from '../../../firebase/functions/scoring.js'

/** Un evento firmado cabe en una nota de 32 KB: lotes lejos de ese tope. */
const ESCUCHAS_POR_LOTE = 60
const VERSION = 1

export function partirEnLotes (tuplas, tamano = ESCUCHAS_POR_LOTE) {
  const lotes = []
  for (let i = 0; i < tuplas.length; i += tamano) lotes.push(tuplas.slice(i, i + tamano))
  return lotes
}

function aBase64 (bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function deBase64 (b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i)
  return out
}

async function pasar (bytes, stream) {
  const resp = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await resp.arrayBuffer())
}

/** Datos del registro para un lote: comprimidos si el motor sabe, en claro si no. */
export async function encodeEscuchas (persona, lote) {
  const base = { v: VERSION, u: persona }
  if (typeof CompressionStream !== 'undefined') {
    try {
      const crudo = new TextEncoder().encode(JSON.stringify(lote))
      return { ...base, z: aBase64(await pasar(crudo, new CompressionStream('gzip'))) }
    } catch { /* se queda en claro */ }
  }
  return { ...base, l: lote }
}

const cacheDecodificados = new Map()

/** Inversa de encodeEscuchas. Devuelve { u, l } o null si el dato no es nuestro. */
export async function decodeEscuchas (data) {
  if (!data || data.v !== VERSION || typeof data.u !== 'string') return null
  if (Array.isArray(data.l)) return { u: data.u, l: data.l.filter(esTupla) }
  if (typeof data.z !== 'string') return null
  const hit = cacheDecodificados.get(data.z)
  if (hit) return { u: data.u, l: hit }
  try {
    const crudo = await pasar(deBase64(data.z), new DecompressionStream('gzip'))
    const lote = JSON.parse(new TextDecoder().decode(crudo))
    const limpio = Array.isArray(lote) ? lote.filter(esTupla) : []
    cacheDecodificados.set(data.z, limpio)
    return { u: data.u, l: limpio }
  } catch {
    return null
  }
}

/** Un miembro puede equivocarse o ser de otra versión: lo ilegible se descarta. */
function esTupla (t) {
  return Array.isArray(t) && t.length >= 7 &&
    typeof t[0] === 'string' && Number.isFinite(t[1]) &&
    Number.isFinite(t[4]) && Number.isFinite(t[5]) && Number.isFinite(t[6])
}

/**
 * Ventana semanal, lunes a lunes en UTC, como la función programada de Firebase.
 *   · 'pasada': la última semana natural cerrada;
 *   · 'actual': desde el lunes de esta semana hasta ahora.
 */
export function ventanaSemana (cual, now = new Date()) {
  const inicioActual = new Date(now)
  inicioActual.setUTCDate(inicioActual.getUTCDate() - ((inicioActual.getUTCDay() + 6) % 7))
  inicioActual.setUTCHours(0, 0, 0, 0)
  if (cual === 'actual') {
    return {
      weekStartIso: inicioActual.toISOString(),
      weekEndIso: new Date(now).toISOString(),
      weekKey: inicioActual.toISOString().slice(0, 10)
    }
  }
  const inicioPasada = new Date(inicioActual)
  inicioPasada.setUTCDate(inicioPasada.getUTCDate() - 7)
  return {
    weekStartIso: inicioPasada.toISOString(),
    weekEndIso: inicioActual.toISOString(),
    weekKey: inicioPasada.toISOString().slice(0, 10)
  }
}

/** Convierte una tupla al evento que espera scoreMember (igual que useLeague.js al subir). */
export function tuplaAEvento (t) {
  const [, playedAt, track, artist, durationMs, msPlayed, measuredMs] = t
  const ratio = durationMs > 0 ? measuredMs / durationMs : 0
  return {
    playedAt: new Date(playedAt).toISOString(),
    track,
    artist,
    durationMs,
    msPlayed,
    measuredMs,
    countedForRegister: ratio >= 0.25
  }
}

export function puntuarSemana (uid, displayName, tuplas, ventana) {
  const desde = Date.parse(ventana.weekStartIso)
  const hasta = Date.parse(ventana.weekEndIso)
  const eventos = tuplas
    .filter(t => t[1] >= desde && t[1] < hasta)
    .map(tuplaAEvento)
  return { uid, displayName: displayName || uid, ...scoreMember(eventos) }
}
