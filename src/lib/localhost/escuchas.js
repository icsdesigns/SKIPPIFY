/**
 * Escuchas del modo LocalHost: formato compacto, compresión y ranking.
 *
 * Una escucha viaja como tupla
 *   [eid, playedAtMs, track, artist, durationMs, msPlayed, measuredMs]
 * y se agrupa en lotes (un registro del grupo por lote). El `eid` es un hash
 * determinista, así que publicar dos veces la misma escucha no la cuenta dos
 * veces: al leer se deduplica por (persona, eid).
 *
 * La puntuación vive en `lib/puntuacion.js`.
 */
import { scoreMember } from '../puntuacion.js'

/** Un evento firmado cabe en una nota de 32 KB: lotes lejos de ese tope. */
const ESCUCHAS_POR_LOTE = 60
const VERSION = 1

export function partirEnLotes (tuplas, tamano = ESCUCHAS_POR_LOTE) {
  const lotes = []
  for (let i = 0; i < tuplas.length; i += tamano) lotes.push(tuplas.slice(i, i + tamano))
  return lotes
}

export function aBase64 (bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function deBase64 (b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i)
  return out
}

export async function pasar (bytes, stream) {
  const resp = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await resp.arrayBuffer())
}

/** Descomprime gzip sin pasar de `max` bytes: frena una «bomba» de compresión. */
export async function descomprimirAcotado (bytes, max) {
  const lector = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const partes = []
  let n = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    n += value.length
    if (n > max) {
      await lector.cancel().catch(() => {})
      throw new Error('registro demasiado grande')
    }
    partes.push(value)
  }
  const out = new Uint8Array(n)
  let pos = 0
  for (const p of partes) { out.set(p, pos); pos += p.length }
  return out
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

/** Escuchas por lote que se aceptan de otro miembro (se publican de 60 en 60). */
export const MAX_POR_LOTE = 200
/** Tope del JSON descomprimido de un lote: 200 escuchas caben de sobra en 256 KB. */
export const MAX_LOTE_BYTES = 256 * 1024
/** Lotes descomprimidos que se guardan en memoria. */
const MAX_CACHE = 2000
/** Longitud máxima de título y artista. */
export const MAX_TEXTO = 200
/** Ninguna canción dura más de un día: lo demás es basura o un intento de inflar. */
const MAX_DURACION_MS = 24 * 3600 * 1000

const cacheDecodificados = new Map()

function recordar (clave, valor) {
  if (cacheDecodificados.size >= MAX_CACHE) {
    // Fuera la más antigua (Map conserva el orden de inserción).
    cacheDecodificados.delete(cacheDecodificados.keys().next().value)
  }
  cacheDecodificados.set(clave, valor)
}

/** Inversa de encodeEscuchas. Devuelve { u, l } o null si el dato no es nuestro. */
export async function decodeEscuchas (data) {
  if (!data || data.v !== VERSION || typeof data.u !== 'string') return null
  if (Array.isArray(data.l)) return { u: data.u, l: limpiarLote(data.l) }
  if (typeof data.z !== 'string' || data.z.length > MAX_LOTE_BYTES) return null
  const hit = cacheDecodificados.get(data.z)
  if (hit) return { u: data.u, l: hit }
  try {
    const crudo = await descomprimirAcotado(deBase64(data.z), MAX_LOTE_BYTES)
    const lote = JSON.parse(new TextDecoder().decode(crudo))
    const limpio = limpiarLote(lote)
    recordar(data.z, limpio)
    return { u: data.u, l: limpio }
  } catch {
    return null
  }
}

function limpiarLote (lote) {
  return Array.isArray(lote) ? lote.slice(0, MAX_POR_LOTE).filter(esTupla) : []
}

const entero = (n, max) => Number.isFinite(n) && n >= 0 && n <= max

/** Un miembro puede equivocarse, ser de otra versión o hacer trampas: lo ilegible se descarta. */
export function esTupla (t) {
  return Array.isArray(t) && t.length >= 7 &&
    typeof t[0] === 'string' && t[0].length <= 32 &&
    Number.isFinite(t[1]) && t[1] > 0 &&
    typeof t[2] === 'string' && t[2].length <= MAX_TEXTO &&
    typeof t[3] === 'string' && t[3].length <= MAX_TEXTO &&
    entero(t[4], MAX_DURACION_MS) && entero(t[5], MAX_DURACION_MS) && entero(t[6], MAX_DURACION_MS)
}

/** Semanas que admite `ventanaSemana` (la pestaña sólo enseña la actual; las otras sirven al aviso semanal). */
export const SEMANAS = ['actual', 'pasada', 'hace2']

/**
 * Periodos que enseña la pestaña Grupos: la semana en curso y el mes en curso.
 * Ambos se calculan con la misma puntuación y se leen del mismo registro de escuchas.
 */
export const PERIODOS = ['semana', 'mes']

/** Días de escuchas que se publican: el mes natural más largo (31) más un margen. */
export const DIAS_PUBLICADOS = 40

/**
 * Ventana semanal, lunes a lunes en UTC, como el resto del ranking.
 *   · 'actual': desde el lunes de esta semana hasta ahora;
 *   · 'pasada': la última semana natural cerrada;
 *   · 'hace2': la anterior a esa.
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
  const atras = cual === 'hace2' ? 2 : 1
  const inicio = new Date(inicioActual)
  inicio.setUTCDate(inicio.getUTCDate() - 7 * atras)
  const fin = new Date(inicio)
  fin.setUTCDate(fin.getUTCDate() + 7)
  return {
    weekStartIso: inicio.toISOString(),
    weekEndIso: fin.toISOString(),
    weekKey: inicio.toISOString().slice(0, 10)
  }
}

/**
 * Ventana mensual: el mes natural en curso en UTC, del día 1 a las 00:00 hasta
 * ahora (como la semana, que va del lunes hasta ahora). Se eligió el mes natural
 * y no «los últimos 30 días» para que el periodo tenga nombre y se reinicie
 * solo, igual que la semana; consecuencia: el día 1 empieza casi vacío y las
 * cifras son provisionales todo el mes.
 */
export function ventanaMes (now = new Date()) {
  const inicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    weekStartIso: inicio.toISOString(),
    weekEndIso: new Date(now).toISOString(),
    weekKey: inicio.toISOString().slice(0, 7)
  }
}

/** Ventana de un periodo de la pestaña ('semana' | 'mes') o de una semana concreta ('actual' | 'pasada' | 'hace2'). */
export function ventanaPeriodo (cual, now = new Date()) {
  if (cual === 'mes') return ventanaMes(now)
  if (cual === 'semana') return ventanaSemana('actual', now)
  return ventanaSemana(cual, now)
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
