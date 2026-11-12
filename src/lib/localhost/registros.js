/**
 * Vista de las colecciones de un grupo con dos reglas que el núcleo del kit no
 * aplica por su cuenta:
 *
 *   1. AUTORÍA POR FIRMA. Cada registro lleva la persona que lo firmó
 *      (`persona`, sacada del dispositivo autor del evento). Lo que diga el
 *      contenido —un campo `u`, por ejemplo— no cuenta: así un miembro no puede
 *      publicar escuchas ni cambiar el nombre a nombre de otro.
 *   2. BORRADO SÓLO DEL AUTOR O DE UN ADMIN. En el kit cualquier miembro puede
 *      retirar cualquier registro (`rec.remove` no mira quién lo firma). Aquí un
 *      borrado sólo vale si lo firma la misma persona que creó el registro o un
 *      administrador del grupo. Los demás se ignoran.
 *
 * Se calcula a partir de los eventos guardados (el mismo registro firmado que
 * usa el kit) y de su vista de miembros, así que no cambia nada del núcleo
 * (`src/vendor/localhost-core`, que es copia sin modificar del kit).
 *
 * Mismo desempate que el kit para dos altas del mismo id: gana la de menor
 * orden (hlc|autor).
 */

/** Tipos de evento de registros (las listas no se usan en Skippify). */
const ALTA = 'rec.add'
const BAJA = 'rec.remove'

/**
 * @param {Array<{type: string, coll?: string, author: string, hlc: string, body: any}>} eventos
 * @param {{ validAt: (e: any) => boolean, personOf: (d: string) => string | undefined, isAdmin: (p: string) => boolean }} vista
 * @returns {Map<string, Array<{ id: string, data: any, author: string, persona: string, hlc: string }>>}
 */
export function proyectarRegistros (eventos, vista) {
  const altas = new Map() // coll → Map(id → { id, data, author, persona, hlc, orden })
  const bajas = []
  for (const e of eventos || []) {
    if (!e || typeof e.coll !== 'string') continue
    if (e.type !== ALTA && e.type !== BAJA) continue
    const id = e.body?.id
    if (typeof id !== 'string' || !id) continue
    let valido = false
    try { valido = vista.validAt(e) } catch { valido = false }
    if (!valido) continue
    const persona = vista.personOf(e.author)
    if (!persona) continue
    if (e.type === BAJA) {
      bajas.push({ coll: e.coll, id, persona })
      continue
    }
    let porId = altas.get(e.coll)
    if (!porId) altas.set(e.coll, (porId = new Map()))
    const orden = `${e.hlc}|${e.author}`
    const previo = porId.get(id)
    if (!previo || orden < previo.orden) {
      porId.set(id, { id, data: e.body.data, author: e.author, persona, hlc: e.hlc, orden })
    }
  }
  const retirados = new Set()
  for (const b of bajas) {
    const alta = altas.get(b.coll)?.get(b.id)
    if (!alta) continue
    let admin = false
    try { admin = vista.isAdmin(b.persona) } catch { admin = false }
    if (b.persona === alta.persona || admin) retirados.add(`${b.coll}\u0000${b.id}`)
  }
  const out = new Map()
  for (const [coll, porId] of altas) {
    const lista = []
    for (const r of porId.values()) {
      if (retirados.has(`${coll}\u0000${r.id}`)) continue
      lista.push({ id: r.id, data: r.data, author: r.author, persona: r.persona, hlc: r.hlc })
    }
    lista.sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : 1))
    out.set(coll, lista)
  }
  return out
}

// ── Saneado de lo que escribe otro miembro ──────────────────────────────────

/** Nombres visibles de personas: sin controles, espacios colapsados, 24 caracteres. */
export const MAX_NOMBRE_PERSONA = 24
/** Nombres de grupo: 32 caracteres, como en la interfaz. */
export const MAX_NOMBRE_GRUPO = 32

export function limpiarTexto (valor, max) {
  if (typeof valor !== 'string') return ''
  return valor
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
