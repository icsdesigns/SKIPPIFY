/**
 * Registros de funcionalidad compartidos en un grupo (modo LocalHost).
 *
 * Cada miembro puede subir a su grupo su «registro de funcionalidad» (las filas
 * del registro de reproducciones con la medición de fundido y las sesiones de
 * escucha con la respuesta del usuario) y, aparte, el número de versión de su
 * app. Viaja por la colección `funcionalidad` del grupo, igual que las escuchas
 * (registros de sólo añadir, cifrados con la clave del grupo en el transporte):
 *
 *   · meta    { v: 1, t: 'm', app, at }
 *     La versión de la app de ese miembro. Se publica SIEMPRE, se comparta o no
 *     el registro, y va en claro dentro del grupo: la ven todos sus miembros.
 *   · trozo   { v: 1, t: 'c', sid, i, n, filas, total, app, at, z }
 *     Un trozo de una subida. `sid` identifica la subida, `i` de `n` el orden y
 *     `z` es base64 de un trozo del JSON comprimido con gzip.
 *
 * Una subida es una INSTANTÁNEA completa (no un incremento): vale la última
 * subida de cada persona que tenga todos sus trozos. Para no engordar el
 * historial del grupo, al subir una nueva se retiran los trozos de la anterior.
 *
 * LÍMITES. Un evento firmado cabe en una nota de 32 KB (MAX_NOTE_BYTES del kit),
 * así que cada trozo lleva como mucho TROZO_CHARS caracteres. Y por el tamaño
 * total sólo se suben las TOPE_FILAS filas más recientes (si aun así pasan de
 * MAX_TROZOS trozos, se recortan más); lo anterior sigue en el móvil y en el
 * fichero exportado desde Ajustes.
 *
 * Quién es el autor de cada registro NO se toma de lo que diga el contenido,
 * sino de la firma del evento (quien llama pasa `persona`), para que un miembro
 * no pueda hacerse pasar por otro.
 */
import { aBase64, deBase64, descomprimirAcotado, pasar } from './escuchas.js'

export const COLL_FUNCIONALIDAD = 'funcionalidad'
const VERSION = 1
const FORMATO = 2

/** Filas más recientes que se suben como máximo. */
export const TOPE_FILAS = 1200
/** Caracteres base64 por trozo: deja holgura bajo los 32 KB de la nota (cifrado y envoltorio). */
export const TROZO_CHARS = 16000
/** Trozos máximos por subida (~190 KB). */
export const MAX_TROZOS = 12
/** Tamaño máximo del JSON al descomprimir: un registro normal ronda los 400 KB; esto frena una «bomba» gzip. */
export const MAX_DESCOMPRIMIDO = 8 * 1024 * 1024

/** Entre subidas completas pasa como mínimo esto... */
export const SUBIDA_CADA_MS = 6 * 3600 * 1000
/** ...salvo que haya una respuesta nueva a la pregunta de fundido: entonces, esto. */
export const SUBIDA_TRAS_RESPUESTA_MS = 30 * 60 * 1000
/** Tras un fallo se espera esto antes de reintentar (falla en silencio). */
export const REINTENTO_MS = 15 * 60 * 1000

// ── Filas ↔ tuplas ──────────────────────────────────────────────────────────

/** Una fila del registro nativo, en una tupla compacta (sin la calibración, que es enorme y repetida). */
export function filaATupla (r) {
  const f = r?.fundido || null
  return [
    r.startedAt, r.endedAt, r.track || '', r.artist || '',
    r.durationMs, r.playedMs, r.counted ? 1 : 0, r.decision || '', r.reason || '', r.source || '',
    r.positionAtDecisionMs,
    f ? f.detectado : null, f ? f.confianza : null, f ? f.solapeMs : null,
    f ? f.restanteAnteriorMs : null, f ? f.posicionPrimeraVistaMs : null,
    f ? f.motivo : null, f ? f.sesionEscuchaId : null
  ]
}

/** Inversa de filaATupla, en la forma del fichero exportado (la respuesta se une luego por sesión). */
export function tuplaAFila (t, respuestas = new Map()) {
  const idSesion = t[17] ?? null
  const r = respuestas.get(idSesion)
  const fila = {
    startedAt: t[0],
    endedAt: t[1],
    track: t[2],
    artist: t[3],
    durationMs: t[4],
    playedMs: t[5],
    counted: t[6] === 1,
    decision: t[7],
    reason: t[8],
    source: t[9],
    positionAtDecisionMs: t[10],
    fundido: t[11] === null || t[11] === undefined
      ? null
      : {
          detectado: t[11],
          confianza: t[12],
          solapeMs: t[13],
          restanteAnteriorMs: t[14],
          posicionPrimeraVistaMs: t[15],
          motivo: t[16],
          sesionEscuchaId: idSesion,
          respuestaUsuario: r === 'si' ? true : r === 'no' ? false : null
        }
  }
  return fila
}

function sesionATupla (s) {
  return [s.id, s.inicio, s.fin ?? null, s.escuchaActivaMs ?? 0, s.canciones ?? 0, s.respuesta ?? null, s.respuestaEn ?? null]
}

function tuplaASesion (t) {
  return {
    id: t[0], inicio: t[1], fin: t[2], escuchaActivaMs: t[3], canciones: t[4],
    respuesta: t[5], respuestaEn: t[6]
  }
}

// ── Empaquetado ─────────────────────────────────────────────────────────────

/** ¿Puede este motor comprimir? Sin compresión no se sube registro (sí la versión). */
export function puedeComprimir () {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

/**
 * Empaqueta filas y sesiones en trozos de texto. Si no caben en MAX_TROZOS se
 * recortan las filas más antiguas hasta que caben.
 *
 * @param {{ filas: object[], sesiones: object[], total?: number }} registro
 *        `filas` de la más antigua a la más reciente.
 * @returns {Promise<{ piezas: string[], filas: number } | null>}
 */
export async function empaquetarRegistro ({ filas, sesiones, total }, ahora = Date.now()) {
  if (!puedeComprimir()) return null
  let lista = filas.slice(-TOPE_FILAS)
  for (;;) {
    const ids = new Set(lista.map(f => f.fundido?.sesionEscuchaId).filter(id => id !== null && id !== undefined))
    // Sólo viajan las sesiones a las que alguna de las filas subidas hace referencia.
    const ses = (sesiones || []).filter(s => ids.has(s.id))
    const json = JSON.stringify({ f: FORMATO, g: ahora, n: total ?? filas.length, filas: lista.map(filaATupla), ses: ses.map(sesionATupla) })
    const z = aBase64(await pasar(new TextEncoder().encode(json), new CompressionStream('gzip')))
    const piezas = []
    for (let i = 0; i < z.length; i += TROZO_CHARS) piezas.push(z.slice(i, i + TROZO_CHARS))
    if (piezas.length <= MAX_TROZOS || lista.length <= 50) return { piezas, filas: lista.length }
    lista = lista.slice(Math.ceil(lista.length * 0.25))
  }
}

/** Inversa de empaquetarRegistro: { filas, sesiones, total, generado } o null si no se puede leer. */
export async function desempaquetarRegistro (piezas) {
  if (!puedeComprimir() || !Array.isArray(piezas) || !piezas.length) return null
  try {
    const crudo = await descomprimirAcotado(deBase64(piezas.join('')), MAX_DESCOMPRIMIDO)
    const dato = JSON.parse(new TextDecoder().decode(crudo))
    if (!dato || dato.f !== FORMATO || !Array.isArray(dato.filas)) return null
    const sesiones = (Array.isArray(dato.ses) ? dato.ses : []).map(tuplaASesion)
    const respuestas = new Map(sesiones.map(s => [s.id, s.respuesta]))
    return {
      filas: dato.filas.filter(Array.isArray).map(t => tuplaAFila(t, respuestas)),
      sesiones,
      total: Number(dato.n) || dato.filas.length,
      generado: Number(dato.g) || 0
    }
  } catch {
    return null
  }
}

/** Los registros que escribe un miembro al subir: la versión... */
export function registroMeta (app, ahora = Date.now()) {
  return { v: VERSION, t: 'm', app: String(app || ''), at: ahora }
}

/** ...y los trozos de una subida. */
export function registrosDeSubida (piezas, { app, filas, total }, ahora = Date.now()) {
  const sid = ahora.toString(36)
  return piezas.map((z, i) => ({ v: VERSION, t: 'c', sid, i, n: piezas.length, filas, total, app: String(app || ''), at: ahora, z }))
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Resume lo que cada persona ha publicado.
 *
 * @param {Array<{ id: string, persona: string, hlc: string, data: any }>} entradas
 *        Registros de la colección, con la persona sacada de la firma.
 * @returns {Map<string, { version: string, versionAt: number, subidaEn: number, filas: number,
 *                         total: number, completa: boolean, piezas: string[]|null,
 *                         ids: { meta: string[], trozos: string[] } }>}
 */
export function resumirFuncionalidad (entradas) {
  const por = new Map()
  const de = (p) => {
    if (!por.has(p)) {
      por.set(p, { version: '', versionAt: 0, subidaEn: 0, filas: 0, total: 0, completa: false, piezas: null, ids: { meta: [], trozos: [] }, _subidas: new Map() })
    }
    return por.get(p)
  }

  for (const e of entradas || []) {
    const d = e?.data
    if (!d || d.v !== VERSION || typeof e.persona !== 'string' || !e.persona) continue
    const at = Number(d.at)
    if (!Number.isFinite(at)) continue
    const p = de(e.persona)
    if (d.t === 'm' && typeof d.app === 'string') {
      p.ids.meta.push(e.id)
      if (at >= p.versionAt) { p.version = d.app.slice(0, 40); p.versionAt = at }
    } else if (d.t === 'c' && typeof d.sid === 'string' && typeof d.z === 'string' &&
      Number.isInteger(d.i) && Number.isInteger(d.n) && d.n > 0 && d.n <= MAX_TROZOS && d.i >= 0 && d.i < d.n) {
      p.ids.trozos.push(e.id)
      let s = p._subidas.get(d.sid)
      if (!s) {
        s = { sid: d.sid, at, n: d.n, filas: Number(d.filas) || 0, total: Number(d.total) || 0, app: typeof d.app === 'string' ? d.app.slice(0, 40) : '', trozos: new Map() }
        p._subidas.set(d.sid, s)
      }
      s.trozos.set(d.i, d.z)
    }
  }

  for (const p of por.values()) {
    // Última subida con todos sus trozos; si la más nueva está a medias se
    // sigue enseñando la anterior hasta que termine de llegar.
    const subidas = [...p._subidas.values()].sort((a, b) => b.at - a.at)
    const entera = subidas.find(s => s.trozos.size === s.n)
    if (entera) {
      p.completa = true
      p.subidaEn = entera.at
      p.filas = entera.filas
      p.total = entera.total
      p.piezas = Array.from({ length: entera.n }, (_, i) => entera.trozos.get(i))
      // La versión de la meta más reciente manda; la de la subida sirve si no hay meta.
      if (!p.version && entera.app) { p.version = entera.app; p.versionAt = entera.at }
    } else if (subidas.length) {
      p.subidaEn = subidas[0].at
    }
    delete p._subidas
  }
  return por
}

// ── Cuándo subir ────────────────────────────────────────────────────────────

/**
 * ¿Toca subir el registro ahora?
 *
 * @param {{ at?: number, respuestaAt?: number, fallo?: number }|undefined} previo
 *        Lo último que se hizo con este grupo (se guarda en localStorage).
 * @param {{ filas: number, respuestaMasReciente: number }} local
 *        Cuántas filas hay y la marca de la respuesta más reciente del usuario.
 */
export function tocaSubir (previo, local, ahora = Date.now()) {
  if (!local || !(local.filas > 0)) return false
  const p = previo || {}
  if (p.fallo && ahora - p.fallo < REINTENTO_MS) return false
  if (!p.at) return true
  if (ahora - p.at >= SUBIDA_CADA_MS) return true
  return (local.respuestaMasReciente || 0) > (p.respuestaAt || 0) && ahora - p.at >= SUBIDA_TRAS_RESPUESTA_MS
}
