/**
 * Macros compartidas con los grupos (modo LocalHost).
 *
 * Cada miembro puede publicar en sus grupos la ESTRUCTURA de sus macros para
 * que los demás las vean y se las clonen. Viaja por la colección `macros` del
 * grupo (registros de sólo añadir, cifrados con la clave del grupo), un registro
 * por macro:
 *
 *   { v: 1, t: 'macro', mid, nombre, origen: { tipo, plays?, dias? },
 *     accion, destino, at }
 *
 * PRIVACIDAD (regla de este módulo, comprobada por las pruebas):
 *   · Sólo se publica con consentimiento (el conmutador «Compartir mis macros
 *     con mis grupos», apagado por defecto). Apagarlo retira lo publicado.
 *   · Sólo viajan los TIPOS de origen, acción y destino y los parámetros de
 *     «tras N escuchas». Nunca ids ni nombres de playlist, ni nada de la cuenta
 *     de Spotify, ni el id local de la macro, ni su historial o contadores.
 *   · El nombre de la macro es texto libre del usuario: si menciona alguna de
 *     sus playlists (el nombre por defecto lo hace) se sustituye por una
 *     descripción de la estructura. Recorte a 60 caracteres.
 *   · `mid` es un resumen (hash) del id local, estable para que cambiar o borrar
 *     la macro actualice o retire su copia, pero que no revela el original.
 *
 * Lo recibido NO se fía: se valida con el mismo validador que usa el asistente
 * («validateDraft») y se reconstruye sólo con los campos conocidos, así que
 * cualquier campo extra (un id de playlist colado, por ejemplo) se descarta. La
 * persona autora sale de la firma del evento, no del contenido.
 */
import { MACRO_SOURCES, MACRO_ACTIONS, MACRO_TARGETS, describeMacro, normalizeAfterPlays, validateDraft } from '@/composables/useMacros'

export const COLL_MACROS = 'macros'
const VERSION = 1
/** Macros por persona y grupo que se aceptan como máximo (frena un registro inflado). */
export const MAX_MACROS_POR_PERSONA = 40
export const MAX_NOMBRE = 60

const MID_RE = /^m[0-9a-f]{8,16}$/

function normalizarTexto (valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resumen FNV-1a de 32 bits dos veces (con dos semillas): 16 hex. No reversible a la práctica. */
function resumen (texto) {
  let a = 0x811c9dc5
  let b = 0x1b873593
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i)
    a ^= c
    a = Math.imul(a, 0x01000193)
    b ^= c + i
    b = Math.imul(b, 0x85ebca6b)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

/** Id compartido y estable de una macro local. */
export function idCompartido (macroId) {
  return `m${resumen(`skippify-macro|${macroId}`)}`
}

function limpiarNombre (nombre) {
  return String(nombre || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOMBRE)
}

/** Estructura (sin nombres) a partir de una macro o de un registro ya validado. */
function estructura (origen, accion, destino) {
  return {
    source: origen,
    action: { type: accion },
    target: destino ? { type: destino } : null
  }
}

/** Una macro de ejemplo con ids de relleno, para pasar por el validador del asistente. */
function borradorDeRelleno (origen, accion, destino) {
  const src = MACRO_SOURCES.find(s => s.type === origen?.type)
  const tgt = MACRO_TARGETS.find(t => t.type === destino)
  return {
    source: {
      ...origen,
      playlistId: src?.needsPlaylist ? 'origen' : '',
      playlistWritable: null
    },
    action: { type: accion },
    target: destino
      ? {
          type: destino,
          playlistId: tgt?.needsPlaylist ? 'destino' : '',
          newPlaylistName: tgt?.needsName ? 'nueva' : '',
          playlistWritable: null
        }
      : null
  }
}

/** ¿Es la estructura una macro que el asistente aceptaría? */
function estructuraValida (origen, accion, destino) {
  if (!MACRO_SOURCES.some(s => s.type === origen?.type)) return false
  if (!MACRO_ACTIONS.some(a => a.type === accion)) return false
  if (destino && !MACRO_TARGETS.some(t => t.type === destino)) return false
  return validateDraft(borradorDeRelleno(origen, accion, destino)) === ''
}

/** Origen reducido a lo compartible: el tipo y los ajustes de «tras N escuchas». */
function origenCompartible (source) {
  if (source?.type === 'after_plays') {
    const { plays, windowDays } = normalizeAfterPlays(source)
    return { type: 'after_plays', plays, windowDays }
  }
  return { type: source?.type }
}

/**
 * Nombre que se publica. El de la macro, salvo que contenga el nombre de alguna
 * de sus playlists (el nombre por defecto es la descripción completa, con ellas):
 * entonces, una descripción de la estructura sin nombres.
 */
export function nombrePublico (macro) {
  const propio = limpiarNombre(macro?.name)
  const prohibidos = [
    macro?.source?.playlistName,
    macro?.target?.playlistName,
    macro?.target?.newPlaylistName
  ].map(normalizarTexto).filter(n => n.length >= 2)
  const norm = normalizarTexto(propio)
  const sinNombres = estructura(
    origenCompartible(macro?.source),
    macro?.action?.type,
    macro?.target?.type || null
  )
  if (!propio || prohibidos.some(n => norm.includes(n))) {
    return limpiarNombre(describeMacro(sinNombres))
  }
  return propio
}

/**
 * Lo que se publicaría de una macro local, o null si no es compartible.
 * Es la ÚNICA puerta de salida: construye el registro campo a campo, de modo
 * que nada más puede colarse.
 */
export function macroCompartible (macro, ahora = Date.now()) {
  if (!macro || typeof macro.id !== 'string') return null
  const origen = origenCompartible(macro.source)
  const accion = macro.action?.type
  const needsTarget = MACRO_ACTIONS.find(a => a.type === accion)?.needsTarget
  const destino = needsTarget ? (macro.target?.type || null) : null
  if (!estructuraValida(origen, accion, destino)) return null

  const origenOut = { tipo: origen.type }
  if (origen.type === 'after_plays') {
    origenOut.plays = origen.plays
    origenOut.dias = origen.windowDays
  }
  return {
    v: VERSION,
    t: 'macro',
    mid: idCompartido(macro.id),
    nombre: nombrePublico(macro),
    origen: origenOut,
    accion,
    destino,
    at: ahora
  }
}

/** Las macros compartibles de una lista local (descarta las que no lo son). */
export function macrosCompartibles (macros, ahora = Date.now()) {
  const out = []
  for (const m of Array.isArray(macros) ? macros : []) {
    const c = macroCompartible(m, ahora)
    if (c) out.push(c)
  }
  return out
}

/** Huella del contenido (sin la marca de tiempo), para saber si cambió. */
export function huella (dato) {
  return JSON.stringify([dato?.nombre, dato?.origen, dato?.accion, dato?.destino])
}

/**
 * Valida un registro recibido y lo reconstruye con los campos conocidos.
 * Devuelve `{ mid, nombre, source, action, target, at }` o null si está mal formado.
 */
export function validarMacroCompartida (dato) {
  if (!dato || typeof dato !== 'object' || Array.isArray(dato)) return null
  if (dato.v !== VERSION || dato.t !== 'macro') return null
  if (typeof dato.mid !== 'string' || !MID_RE.test(dato.mid)) return null
  if (!dato.origen || typeof dato.origen !== 'object') return null
  if (typeof dato.origen.tipo !== 'string' || typeof dato.accion !== 'string') return null
  if (dato.destino != null && typeof dato.destino !== 'string') return null

  const tipo = dato.origen.tipo
  const origen = tipo === 'after_plays'
    ? { type: tipo, ...normalizeAfterPlays({ plays: dato.origen.plays, windowDays: dato.origen.dias }) }
    : { type: tipo }
  const destino = dato.destino || null
  if (!estructuraValida(origen, dato.accion, destino)) return null

  const completa = estructura(origen, dato.accion, destino)
  const nombre = limpiarNombre(typeof dato.nombre === 'string' ? dato.nombre : '') || limpiarNombre(describeMacro(completa))
  return {
    mid: dato.mid,
    nombre,
    source: origen,
    action: completa.action,
    target: completa.target,
    at: Number.isFinite(dato.at) ? dato.at : 0
  }
}

/**
 * Macros de los miembros de UN grupo.
 *
 * @param {{ id: string, persona: string, hlc: string, data: any }[]} entradas
 *        registros de la colección; `persona` viene de la firma del evento.
 * @param {Map<string,string>} nombres persona → nombre visible
 * @param {string} yo persona propia (sus macros no se listan)
 */
export function leerMacrosDelGrupo (entradas, nombres, yo = '') {
  const porClave = new Map()
  for (const e of Array.isArray(entradas) ? entradas : []) {
    if (!e?.persona || e.persona === yo) continue
    const m = validarMacroCompartida(e.data)
    if (!m) continue
    const clave = `${e.persona}|${m.mid}`
    const previo = porClave.get(clave)
    if (!previo || String(e.hlc) > String(previo.hlc)) porClave.set(clave, { ...m, persona: e.persona, hlc: e.hlc })
  }

  const porPersona = new Map()
  for (const m of [...porClave.values()].sort((a, b) => (a.hlc < b.hlc ? 1 : -1))) {
    const lista = porPersona.get(m.persona) || []
    if (lista.length >= MAX_MACROS_POR_PERSONA) continue
    lista.push(m)
    porPersona.set(m.persona, lista)
  }

  const out = []
  for (const [persona, lista] of porPersona) {
    const autor = nombres?.get?.(persona) || 'Un miembro'
    for (const m of lista) {
      out.push({
        persona,
        autor,
        mid: m.mid,
        nombre: m.nombre,
        source: m.source,
        action: m.action,
        target: m.target,
        descripcion: describeMacro(m),
        at: m.at
      })
    }
  }
  return out
}

/**
 * Junta las de todos los grupos. La misma macro de la misma persona en varios
 * grupos sale una sola vez, con la lista de grupos en que está.
 * @param {{ grupo: string, macros: ReturnType<typeof leerMacrosDelGrupo> }[]} porGrupo
 */
export function fusionarGrupos (porGrupo) {
  const mapa = new Map()
  for (const { grupo, macros } of Array.isArray(porGrupo) ? porGrupo : []) {
    for (const m of macros || []) {
      const clave = `${normalizarTexto(m.autor)}|${m.mid}`
      const previo = mapa.get(clave)
      if (previo) {
        if (!previo.grupos.includes(grupo)) previo.grupos.push(grupo)
      } else {
        mapa.set(clave, { ...m, clave, grupos: [grupo] })
      }
    }
  }
  return [...mapa.values()].sort((a, b) => a.autor.localeCompare(b.autor, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Qué hay que publicar y retirar para que lo publicado por mí coincida con mis
 * macros (o con nada, si no se comparte).
 *
 * @param {{ compartir: boolean, mias: ReturnType<typeof macrosCompartibles>,
 *           publicadas: { id: string, hlc: string, data: any }[] }} p
 * @returns {{ anadir: object[], retirar: string[] }}
 */
export function planDePublicacion ({ compartir, mias, publicadas }) {
  const anadir = []
  const retirar = []
  const vigentes = new Map() // mid → { id, hlc, huella } la más reciente válida

  for (const p of Array.isArray(publicadas) ? publicadas : []) {
    const m = validarMacroCompartida(p.data)
    if (!m) { retirar.push(p.id); continue }
    const previo = vigentes.get(m.mid)
    const h = huella({ nombre: m.nombre, origen: p.data.origen, accion: m.action.type, destino: m.target?.type || null })
    if (!previo) {
      vigentes.set(m.mid, { id: p.id, hlc: p.hlc, huella: h })
    } else if (String(p.hlc) > String(previo.hlc)) {
      retirar.push(previo.id)
      vigentes.set(m.mid, { id: p.id, hlc: p.hlc, huella: h })
    } else {
      retirar.push(p.id)
    }
  }

  if (!compartir) {
    for (const v of vigentes.values()) retirar.push(v.id)
    return { anadir, retirar }
  }

  const deseadas = new Set()
  for (const m of Array.isArray(mias) ? mias : []) {
    deseadas.add(m.mid)
    const hay = vigentes.get(m.mid)
    if (hay && hay.huella === huella(m)) continue
    anadir.push(m)
    if (hay) retirar.push(hay.id)
  }
  for (const [mid, v] of vigentes) {
    if (!deseadas.has(mid)) retirar.push(v.id)
  }
  return { anadir, retirar }
}

/**
 * Borrador para clonar una macro de otro miembro: la estructura es la suya,
 * pero SIN playlists (los ids de otra cuenta no valen) y con el nombre listo
 * para personalizar.
 */
export function borradorDesdeCompartida (m) {
  const src = MACRO_SOURCES.find(s => s.type === m?.source?.type)
  const tgt = MACRO_TARGETS.find(t => t.type === m?.target?.type)
  return {
    name: limpiarNombre(m?.nombre),
    source: {
      type: m?.source?.type || '',
      playlistId: '',
      playlistName: '',
      playlistWritable: null,
      ...(src?.afterPlays ? normalizeAfterPlays(m.source) : {})
    },
    action: { type: m?.action?.type || '' },
    target: tgt
      ? { type: tgt.type, playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
      : (m?.target ? { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null } : null)
  }
}
