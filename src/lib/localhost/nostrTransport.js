/**
 * Transporte de LocalHost sobre relays de Nostr (NIP-01).
 *
 * Cada `Note` del kit viaja como un evento de Nostr firmado con una clave
 * desechable (el relay no sabe quién publica):
 *   · una etiqueta `h` por cada etiqueta de la nota (así se filtra);
 *   · una etiqueta `i` con el id de la nota, que Nostr no conserva por su cuenta;
 *   · NIP-40 `expiration` a 60 días, para que el relay pueda limpiar.
 *
 * Se abre una conexión por relay y llamada, y se cierra al terminar: el ciclo
 * del kit es conectar, sincronizar y desconectar.
 */
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure'

/** Rango «regular» de Nostr (los relays lo almacenan). */
export const LH_KIND = 4247
const EXPIRATION_SECONDS = 60 * 24 * 3600
const TAGS_PER_REQ = 20
const CONNECT_TIMEOUT_MS = 8000
const REPLY_TIMEOUT_MS = 10000

/**
 * Relays públicos de partida. Que sigan aceptando el tipo de nota, sin pago y
 * con la retención esperada se comprueba con `scripts/probar-relays.mjs`.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub'
]

function openSocket (url, WS) {
  return new Promise((resolve, reject) => {
    let ws
    try {
      ws = new WS(url)
    } catch (err) {
      reject(err)
      return
    }
    const timer = setTimeout(() => {
      try { ws.close() } catch { /* nada */ }
      reject(new Error('tiempo de conexión agotado'))
    }, CONNECT_TIMEOUT_MS)
    ws.onopen = () => { clearTimeout(timer); resolve(ws) }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('no se pudo conectar')) }
  })
}

function noteToEvent (note) {
  const sec = Math.floor(note.createdAt / 1000)
  const tags = [
    ...note.tags.map(t => ['h', t]),
    ['i', note.id],
    ['expiration', String(sec + EXPIRATION_SECONDS)]
  ]
  return finalizeEvent({ kind: LH_KIND, created_at: sec, tags, content: note.content }, generateSecretKey())
}

function eventToNote (ev) {
  const id = ev.tags.find(t => t[0] === 'i')?.[1]
  if (!id || typeof ev.content !== 'string') return null
  return {
    id,
    tags: ev.tags.filter(t => t[0] === 'h').map(t => t[1]),
    createdAt: ev.created_at * 1000,
    content: ev.content
  }
}

async function publishTo (url, event, WS) {
  let ws
  try {
    ws = await openSocket(url, WS)
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), REPLY_TIMEOUT_MS)
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data[0] === 'OK' && data[1] === event.id) {
            clearTimeout(timer)
            resolve(data[2] === true)
          }
        } catch { /* mensaje ajeno */ }
      }
      ws.onerror = ws.onclose = () => { clearTimeout(timer); resolve(false) }
      ws.send(JSON.stringify(['EVENT', event]))
    })
  } catch {
    return false
  } finally {
    try { ws?.close() } catch { /* nada */ }
  }
}

async function fetchFrom (url, filters, WS) {
  let ws
  try {
    ws = await openSocket(url, WS)
    return await new Promise((resolve, reject) => {
      const found = []
      const subs = new Set(filters.map((_, i) => `lh${i}`))
      const timer = setTimeout(() => reject(new Error('el relay no terminó de responder')), REPLY_TIMEOUT_MS)
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data[0] === 'EVENT' && subs.has(data[1])) found.push(data[2])
          else if (data[0] === 'EOSE' || data[0] === 'CLOSED') {
            subs.delete(data[1])
            if (!subs.size) { clearTimeout(timer); resolve(found) }
          }
        } catch { /* mensaje ajeno */ }
      }
      ws.onerror = ws.onclose = () => { clearTimeout(timer); reject(new Error('conexión cerrada')) }
      filters.forEach((f, i) => ws.send(JSON.stringify(['REQ', `lh${i}`, f])))
    })
  } finally {
    try { ws?.close() } catch { /* nada */ }
  }
}

export class NostrTransport {
  /**
   * @param {() => string[]} getRelays  lista vigente de relays del grupo
   * @param {{ WebSocket?: typeof WebSocket }} [opts]
   */
  constructor (getRelays, opts = {}) {
    this.getRelays = getRelays
    this.WS = opts.WebSocket || globalThis.WebSocket
  }

  async publish (note) {
    const event = noteToEvent(note)
    const relays = this.getRelays()
    return Promise.all(relays.map(async relay => ({ relay, ok: await publishTo(relay, event, this.WS) })))
  }

  async fetch (tags, since) {
    const relays = this.getRelays()
    const sinceSec = Math.max(0, Math.floor(since / 1000))
    const filters = []
    for (let i = 0; i < tags.length; i += TAGS_PER_REQ) {
      filters.push({ kinds: [LH_KIND], '#h': tags.slice(i, i + TAGS_PER_REQ), since: sinceSec })
    }
    const status = []
    const notes = new Map()
    await Promise.all(relays.map(async (relay) => {
      try {
        const events = await fetchFrom(relay, filters, this.WS)
        for (const ev of events) {
          const note = eventToNote(ev)
          if (note && !notes.has(note.id)) notes.set(note.id, note)
        }
        status.push({ relay, ok: true })
      } catch {
        status.push({ relay, ok: false })
      }
    }))
    if (!status.some(s => s.ok)) throw new Error('ningún relay responde')
    return { notes: [...notes.values()], relays: status }
  }
}
