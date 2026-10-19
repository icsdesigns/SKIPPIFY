/**
 * Modo LocalHost de Comunidad: prueba de extremo a extremo SIN red ni Firebase.
 *
 * Dos «móviles» (cada uno con su IdbStorage sobre fake-indexeddb) comparten una
 * red simulada del kit. Se comprueba que el almacenamiento real cumple lo que
 * el kit exige, que se pueden crear y unir grupos, que las escuchas viajan, se
 * deduplican y puntúan IGUAL que en Firebase.
 *
 *   npx vite build --ssr scripts/pruebas-localhost.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/pruebas-localhost.js
 */
import 'fake-indexeddb/auto'
import { LocalHost, MemoryTransport } from '../src/vendor/localhost-core/index.ts'
import { IdbStorage } from '../src/lib/localhost/idbStorage.js'
import {
  decodeEscuchas, encodeEscuchas, partirEnLotes, puntuarSemana, ventanaSemana, tuplaAEvento
} from '../src/lib/localhost/escuchas.js'
import { scoreMember } from '../firebase/functions/scoring.js'

let fallos = 0
let total = 0
function check (etiqueta, ok, detalle = '') {
  total += 1
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : ` ${detalle}`}`)
  if (!ok) fallos += 1
}
const titulo = s => console.log(`\n${s}`)

const RELAYS = ['wss://a.test', 'wss://b.test']

// ── Almacenamiento ──────────────────────────────────────────────────────────
titulo('IdbStorage cumple la interfaz del kit')
{
  const s = new IdbStorage('t1')
  const ev = (author, seq) => ({ v: 1, group: 'g', author, seq, hlc: `${String(seq).padStart(15, '0')}:00000`, epoch: 0, type: 'rec.add', body: {}, sig: 'x' })
  await s.putEvents([ev('A', 1), ev('A', 2), ev('A', 4), ev('B', 1), ev('C', 2)])
  const vec = await s.getVector()
  check('vector: contigüidad por autor', vec.A === 2 && vec.B === 1 && vec.C === undefined, JSON.stringify(vec))
  const todos = await s.getEvents({})
  check('getEvents sin filtro ordena por autor y seq', todos.map(e => `${e.author}${e.seq}`).join() === 'A1,A2,A4,B1,C2', todos.map(e => `${e.author}${e.seq}`).join())
  check('getEvents por autor y fromSeq', (await s.getEvents({ author: 'A', fromSeq: 2 })).length === 2)
  await s.putEvents([{ ...ev('A', 2), type: 'rec.remove' }])
  check('una sola versión por (autor, seq)', (await s.getEvents({ author: 'A' })).filter(e => e.seq === 2).length === 1)
  await s.outbox.add({ id: 'n1', tags: ['t'], createdAt: 1, content: 'c' })
  check('outbox add/list', (await s.outbox.list()).length === 1)
  await s.outbox.ack('n1')
  check('outbox ack', (await s.outbox.list()).length === 0)
  await s.meta.set('k', { a: [1, 2] })
  check('meta set/get', JSON.stringify(await s.meta.get('k')) === '{"a":[1,2]}' && (await s.meta.get('nope')) === undefined)
  check('sin snapshot al empezar', (await s.latestSnapshot()) === null)
  await s.putSnapshot({ state: { x: 1 }, vector: { A: 2 }, hlcUntil: 'h', control: [] })
  check('snapshot guardado', (await s.latestSnapshot()).vector.A === 2)
  s.close()
}

// ── Dos móviles ─────────────────────────────────────────────────────────────
titulo('Crear grupo, invitar, unirse y compartir datos (almacenamiento real)')
const red = new MemoryTransport(RELAYS, 7)
const ana = await LocalHost.createGroup(
  { storage: new IdbStorage('ana'), transport: red }, { name: 'Amigos', relays: RELAYS, deviceName: 'Ana' }
)
await ana.records('grupo').add({ nombre: 'Amigos' })
const codigo = await ana.createInvite()
check('la invitación lleva prefijo lh1:', codigo.startsWith('lh1:'))
const luis = await LocalHost.joinGroup({ storage: new IdbStorage('luis'), transport: red }, codigo, 'Luis')
for (let i = 0; i < 4 && luis.status !== 'ready'; i += 1) {
  await luis.sync()
  await ana.sync()
}
await luis.sync()
check('Luis queda listo', luis.status === 'ready', luis.status)
check('Ana ve 2 miembros', ana.members().filter(m => !m.removed).length === 2)

// Reabrir desde IndexedDB: nada vive solo en memoria.
const anaReabierta = await LocalHost.openGroup({ storage: new IdbStorage('ana'), transport: red })
check('el grupo sobrevive a reabrirlo', anaReabierta.id === ana.id && anaReabierta.members().length === 2)

// ── Escuchas ────────────────────────────────────────────────────────────────
titulo('Escuchas: compresión, deduplicación y puntuación idéntica a Firebase')
const ahora = new Date()
const lunes = ventanaSemana('pasada', ahora)
const t0 = Date.parse(lunes.weekStartIso) + 3600_000
const mk = (i, persona) => [`${persona}${i}`, t0 + i * 600_000, `Tema ${i % 7}`, `Artista ${i % 3}`, 200_000, i % 5 === 0 ? 0 : 190_000, i % 5 === 0 ? 60_000 : 190_000]
const tuplasAna = Array.from({ length: 150 }, (_, i) => mk(i, 'a'))
const tuplasLuis = Array.from({ length: 90 }, (_, i) => mk(i, 'l'))

const anaPersona = ana.me.person
const luisPersona = luis.me.person
for (const lote of partirEnLotes(tuplasAna)) await ana.records('escuchas').add(await encodeEscuchas(anaPersona, lote))
for (const lote of partirEnLotes(tuplasLuis)) await luis.records('escuchas').add(await encodeEscuchas(luisPersona, lote))
// Una escucha publicada dos veces (otro lote con las mismas): no debe contar doble.
await ana.records('escuchas').add(await encodeEscuchas(anaPersona, tuplasAna.slice(0, 10)))
for (let i = 0; i < 3; i += 1) { await ana.sync(); await luis.sync() }

async function ranking (grupo) {
  const vistos = new Set()
  const porPersona = new Map()
  for (const item of grupo.records('escuchas').items()) {
    const lote = await decodeEscuchas(item.data)
    if (!lote) continue
    for (const t of lote.l) {
      const k = `${lote.u}|${t[0]}`
      if (vistos.has(k)) continue
      vistos.add(k)
      if (!porPersona.has(lote.u)) porPersona.set(lote.u, [])
      porPersona.get(lote.u).push(t)
    }
  }
  return grupo.members().map(m => puntuarSemana(m.person, m.name, porPersona.get(m.person) || [], lunes))
    .sort((a, b) => a.uid.localeCompare(b.uid))
}
const rAna = await ranking(ana)
const rLuis = await ranking(luis)
check('los dos móviles calculan el mismo ranking', JSON.stringify(rAna) === JSON.stringify(rLuis))
const delAna = rAna.find(r => r.uid === anaPersona)
const delLuis = rAna.find(r => r.uid === luisPersona)
check('Ana: 150 escuchas (la repetida no suma)', delAna.totalTracks === 150, String(delAna.totalTracks))
check('Luis: 90 escuchas', delLuis.totalTracks === 90, String(delLuis.totalTracks))

const directo = scoreMember(tuplasAna.map(tuplaAEvento))
check('misma puntuación que scoring.js sobre los mismos datos', delAna.score === directo.score && delAna.totalMinutes === directo.totalMinutes)

const lote = await encodeEscuchas('p', tuplasAna.slice(0, 60))
const ida = await decodeEscuchas(lote)
check('compresión: ida y vuelta exacta', JSON.stringify(ida.l) === JSON.stringify(tuplasAna.slice(0, 60)))
check('datos ajenos o corruptos se descartan', (await decodeEscuchas({ v: 9 })) === null && (await decodeEscuchas({ v: 1, u: 'x', z: '%%%' })) === null)
check('el lote comprimido cabe de sobra en una nota', JSON.stringify(lote).length < 12_000, String(JSON.stringify(lote).length))

console.log(`\n${total - fallos}/${total} comprobaciones correctas`)
process.exit(fallos ? 1 : 0)
