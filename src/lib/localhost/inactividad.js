/**
 * Autoexpulsión por inactividad en los grupos sin servidor (LocalHost).
 *
 * Un dispositivo que no envía nada en 30 días sale del grupo. «Enviar» es
 * cualquier evento firmado por alguno de los dispositivos de esa persona: sus
 * escuchas, su latido diario de presencia (`presencia`) o su alta. Las funciones
 * de aquí son puras —reciben los eventos y los miembros— para poder probarlas
 * con un reloj simulado; quien las usa (useLocalLeague) es el que escribe la
 * expulsión.
 *
 * Por qué 30 días: es lo que los móviles escuchan la etiqueta de la época
 * anterior (PREV_EPOCH_LISTEN_MS) y la mitad de lo que un relay guarda una nota.
 * Pasado ese tiempo un dispositivo ya no puede recibir con fiabilidad las
 * llaves nuevas, así que mantenerlo no aporta nada.
 */

export const INACTIVIDAD_MS = 30 * 24 * 3600 * 1000
/** Un móvil con la app en marcha anota que sigue vivo como mucho una vez al día. */
export const LATIDO_MS = 24 * 3600 * 1000
/** Cada cuánto un administrador revisa quién lleva demasiado callado. */
export const REVISION_MS = 6 * 3600 * 1000

/** Milisegundos de un HLC "<15 dígitos>:<5 dígitos>". */
export function hlcMs (hlc) {
  const n = Number(String(hlc || '').slice(0, 15))
  return Number.isFinite(n) ? n : 0
}

/**
 * Última señal de vida de cada persona.
 *
 * @param {Array<{author: string, hlc: string, type: string, body?: any}>} eventos
 * @param {(device: string) => string | undefined} personaDe
 * @param {number} ahora
 * @returns {Map<string, number>} persona → milisegundos de su última señal
 */
export function actividadPorPersona (eventos, personaDe, ahora) {
  const out = new Map()
  const anota = (persona, ms) => {
    if (!persona || !Number.isFinite(ms)) return
    // Un reloj adelantado no puede dar más vida que «ahora».
    const tope = Math.min(ms, ahora)
    if (tope > (out.get(persona) || 0)) out.set(persona, tope)
  }
  for (const ev of eventos) {
    const ms = hlcMs(ev.hlc)
    anota(personaDe(ev.author), ms)
    // Entrar al grupo también cuenta: quien acaba de unirse tiene 30 días de margen.
    if ((ev.type === 'member.add' || ev.type === 'device.link') && typeof ev.body?.person === 'string') {
      anota(ev.body.person, ms)
    }
  }
  return out
}

/**
 * A quién expulsa ESTE dispositivo ahora mismo (lista de personas, normalmente vacía).
 *
 * Sólo actúa el primer administrador que sigue activo, para que dos
 * administradores no escriban la misma expulsión a la vez; todos calculan lo
 * mismo con los mismos datos. Y por seguridad no expulsa nunca a «todos los
 * demás» en un grupo de más de dos: si todo el mundo parece inactivo, lo más
 * probable es que sea esta vista la que va atrasada.
 */
export function elegirExpulsados ({ miembros, actividad, ahora, yo, limite = INACTIVIDAD_MS }) {
  const vivos = miembros.filter(m => !m.removed)
  const callado = (m) => ahora - (actividad.get(m.person) || 0) >= limite
  const ejecutor = vivos.find(m => m.admin && !callado(m))
  if (!ejecutor || ejecutor.person !== yo) return []
  const candidatos = vivos.filter(m => m.person !== yo && callado(m))
  if (vivos.length > 2 && candidatos.length === vivos.length - 1) return []
  return candidatos.map(m => m.person)
}
