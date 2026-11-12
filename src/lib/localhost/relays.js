/**
 * Relays aceptables para un grupo.
 *
 * Una invitación o un código de vinculación traen su lista de relays, y quien
 * los fabrica puede poner lo que quiera. Sólo se aceptan servidores `wss://`
 * (cifrado de transporte) con nombre de dominio público: nada de IP, puertos
 * raros, `localhost` ni redes internas, que servirían para que el móvil se
 * conectara a donde elija quien manipuló la invitación.
 */
export const MAX_RELAYS = 8

const PRIVADOS = /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home|.*\.localhost)$/i

export function relayValido (url) {
  if (typeof url !== 'string' || url.length > 200) return false
  let u
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'wss:') return false
  if (u.username || u.password) return false
  if (u.port && u.port !== '443') return false
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || PRIVADOS.test(host)) return false
  // IPv4 o IPv6 literales: fuera.
  if (/^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) return false
  if (!/^[a-z0-9.-]+$/.test(host)) return false
  return true
}

/** Lista saneada (sin duplicados, como mucho MAX_RELAYS). Si no queda ninguno, `porDefecto`. */
export function relaysSeguros (lista, porDefecto) {
  const out = []
  for (const r of Array.isArray(lista) ? lista : []) {
    if (!relayValido(r)) continue
    const limpio = r.replace(/\/+$/, '')
    if (!out.includes(limpio)) out.push(limpio)
    if (out.length >= MAX_RELAYS) break
  }
  return out.length ? out : [...porDefecto]
}
