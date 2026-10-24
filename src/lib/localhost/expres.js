/**
 * Invitación exprés de LocalHost: un código corto (8 caracteres) en vez de la
 * invitación completa.
 *
 * La invitación del kit (`lh1:…`) lleva una clave de 256 bits y no cabe en un
 * código que se pueda dictar. Esta capa no toca el kit: el móvil del admin deja
 * en los relays la invitación larga cifrada con una clave derivada del código, y
 * quien recibe el código la localiza, la descifra y entra por el flujo de
 * siempre. Sin el código, la nota publicada es ruido.
 *
 *   · 8 caracteres de un alfabeto de 32 símbolos = 40 bits.
 *   · La clave y la etiqueta de búsqueda salen de Argon2id sobre el código: cada
 *     intento de adivinarlo cuesta memoria y tiempo, no un simple hash.
 *   · Caduca a los 30 minutos (dentro de la nota, así que no se puede alargar) y
 *     se usa una vez: la invitación de debajo ya es de un solo uso en el kit.
 *
 * Sólo vale para grupos que usan los relays por defecto, porque quien recibe el
 * código no sabe todavía en qué relays buscar.
 */
import {
  aeadDecrypt, aeadEncrypt, deriveKey, passwordKey, ready, sha256, b64
} from '@/vendor/localhost-core/crypto.ts'

export const EXPRES_TTL_MS = 30 * 60 * 1000
export const EXPRES_LONGITUD = 8
/** Base32 de Crockford: sin I, L, O ni U, que se confunden al dictar o leer. */
const SIMBOLOS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const enc = new TextEncoder()
const dec = new TextDecoder()
const AD = enc.encode('skippify/express/v1')
/** Argon2id pide 16 bytes de sal; es fija porque el código es lo único que se conoce. */
const SAL = enc.encode('skippify-expres-')

/** Quita separadores y corrige las confusiones típicas (O→0, I/L→1). */
export function normalizarCodigo (texto) {
  return (texto || '')
    .toString()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** ¿Tiene pinta de código exprés (y no de una invitación larga)? */
export function esCodigoExpres (texto) {
  const limpio = normalizarCodigo(texto)
  if (limpio.length !== EXPRES_LONGITUD) return false
  return [...limpio].every(c => SIMBOLOS.includes(c))
}

/** «K7QM4TXD» → «K7QM-4TXD». */
export function formatearCodigo (texto) {
  const c = normalizarCodigo(texto)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** Código aleatorio. Se descartan los valores que sesgarían el reparto (32 divide a 256: no hay). */
export function generarCodigo () {
  const bytes = new Uint8Array(EXPRES_LONGITUD)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => SIMBOLOS[b & 31]).join('')
}

/** Clave de cifrado y etiqueta de búsqueda del código. Cuesta ~0,1–1 s: es a propósito. */
async function derivar (codigo) {
  await ready()
  const maestra = passwordKey(normalizarCodigo(codigo), SAL)
  return {
    clave: deriveKey(maestra, 'skippify/express/key'),
    etiqueta: b64(deriveKey(maestra, 'skippify/express/tag'))
  }
}

/**
 * Nota lista para publicar con la invitación larga dentro.
 * @param {string} invitacion  código `lh1:…` del kit
 * @param {string} codigo      código exprés (8 caracteres)
 * @param {number} ahora       ms
 */
export async function sellarInvitacion (invitacion, codigo, ahora = Date.now()) {
  const { clave, etiqueta } = await derivar(codigo)
  const cuerpo = enc.encode(JSON.stringify({ i: invitacion, e: ahora + EXPRES_TTL_MS }))
  const content = aeadEncrypt(cuerpo, clave, AD)
  return { id: sha256(enc.encode(content)), tags: [etiqueta], createdAt: ahora, content }
}

/** Invitación larga de una nota, o null si no es de este código o ya caducó. */
export function abrirNota (nota, clave, ahora = Date.now()) {
  const plano = aeadDecrypt(nota.content, clave, AD)
  if (!plano) return null
  try {
    const v = JSON.parse(dec.decode(plano))
    if (typeof v?.i !== 'string' || typeof v?.e !== 'number' || v.e <= ahora) return null
    return { invitacion: v.i, caduca: v.e }
  } catch {
    return null
  }
}

/** Publica la invitación en los relays. Lanza si ninguno la acepta. */
export async function publicarExpres (transport, invitacion, codigo, ahora = Date.now()) {
  const nota = await sellarInvitacion(invitacion, codigo, ahora)
  const resultado = await transport.publish(nota)
  if (!resultado.some(r => r.ok)) throw new Error('ningún relay aceptó la invitación')
  return { caduca: ahora + EXPRES_TTL_MS }
}

/**
 * Busca el código en los relays. Devuelve la invitación larga o null si no hay
 * nada vigente. Si dos notas coinciden gana la más reciente.
 */
export async function resolverExpres (transport, codigo, ahora = Date.now()) {
  const { clave, etiqueta } = await derivar(codigo)
  const { notes } = await transport.fetch([etiqueta], ahora - EXPRES_TTL_MS - 60_000)
  let mejor = null
  for (const n of [...notes].sort((a, b) => b.createdAt - a.createdAt)) {
    mejor = abrirNota(n, clave, ahora)
    if (mejor) break
  }
  return mejor
}
