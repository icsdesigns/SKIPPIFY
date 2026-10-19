/**
 * Prueba relays candidatos para el modo LocalHost: publican una nota del tipo
 * LH_KIND y la devuelven al pedirla por su etiqueta. Uso:
 *   node scripts/probar-relays.mjs [wss://relay1 wss://relay2 …]
 */
import { NostrTransport, DEFAULT_RELAYS } from '../src/lib/localhost/nostrTransport.js'

const relays = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_RELAYS
const tag = `prueba-${Math.random().toString(16).slice(2)}`
const note = { id: `n-${tag}`, tags: [tag], createdAt: Date.now(), content: 'hola' }

let buenos = 0
for (const relay of relays) {
  const t = new NostrTransport(() => [relay])
  const t0 = Date.now()
  const pub = await t.publish(note)
  let leida = false
  if (pub[0].ok) {
    try {
      const r = await t.fetch([tag], Date.now() - 60_000)
      leida = r.notes.some(n => n.id === note.id)
    } catch { /* se queda en falso */ }
  }
  if (pub[0].ok && leida) buenos += 1
  console.log(`${pub[0].ok && leida ? 'OK  ' : 'FALLA'} ${relay}  publica=${pub[0].ok} devuelve=${leida} (${Date.now() - t0} ms)`)
}
console.log(`${buenos}/${relays.length} relays válidos`)
process.exit(buenos >= 2 ? 0 : 1)
