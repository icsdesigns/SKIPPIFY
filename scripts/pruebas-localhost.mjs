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
import { actividadPorPersona, elegirExpulsados } from '../src/lib/localhost/inactividad.js'
import {
  decodeEscuchas, encodeEscuchas, partirEnLotes, puntuarSemana, ventanaSemana, tuplaAEvento
} from '../src/lib/localhost/escuchas.js'
import { scoreMember, esNoMusical } from '../firebase/functions/scoring.js'
import { escuchaComun, extrasNuevos, ordenarPorTiempo, paresEnComun, perfilHorario, diaCorto } from '../src/lib/gruposExtras.js'

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

// ── Invitación exprés ───────────────────────────────────────────────────────
titulo('Invitación exprés: un código corto abre la invitación larga')
{
  const {
    EXPRES_TTL_MS, esCodigoExpres, formatearCodigo, generarCodigo, normalizarCodigo, publicarExpres, resolverExpres
  } = await import('../src/lib/localhost/expres.js')

  const cod = generarCodigo()
  check('el código tiene 8 caracteres válidos', esCodigoExpres(cod) && cod.length === 8, cod)
  check('se muestra en dos bloques', /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(formatearCodigo(cod)))
  check('dictarlo con minúsculas, guion u O/I/L sigue valiendo', normalizarCodigo('k7qm-4tXd') === 'K7QM4TXD' && normalizarCodigo('O1IL') === '0111')
  check('una invitación larga no se confunde con un exprés', !esCodigoExpres(codigo) && !esCodigoExpres('abc123'))

  const redExp = new MemoryTransport(RELAYS, 11)
  const inv = await ana.createInvite()
  const t0e = Date.now()
  await publicarExpres(redExp, inv, cod, t0e)
  const hallada = await resolverExpres(redExp, formatearCodigo(cod).toLowerCase(), t0e + 60_000)
  check('con el código se recupera la invitación larga', hallada?.invitacion === inv)
  check('un código distinto no encuentra nada', (await resolverExpres(redExp, generarCodigo(), t0e + 60_000)) === null)
  check('pasados 30 minutos ya no vale', (await resolverExpres(redExp, cod, t0e + EXPRES_TTL_MS + 1000)) === null)

  const luis2 = await LocalHost.joinGroup({ storage: new IdbStorage('luis2'), transport: red }, hallada.invitacion, 'Marta')
  for (let i = 0; i < 4 && luis2.status !== 'ready'; i += 1) { await luis2.sync(); await ana.sync() }
  await luis2.sync()
  check('quien entra con el exprés queda dentro del grupo', luis2.status === 'ready', luis2.status)
}

// ── Inactividad ─────────────────────────────────────────────────────────────
titulo('Autoexpulsión a los 30 días sin actividad')
{
  const DIA = 24 * 3600 * 1000
  const ahora = 1_800_000_000_000
  const ev = (author, dias, type = 'rec.add', body = {}) => ({ author, hlc: `${String(ahora - dias * DIA).padStart(15, '0')}:00000`, type, body })
  const personaDe = d => ({ dA: 'A', dB: 'B', dC: 'C' })[d]
  const m = (person, admin = false, removed = false) => ({ person, admin, removed })

  const act = actividadPorPersona([ev('dA', 1), ev('dB', 40), ev('dC', 2), ev('dA', 0, 'member.add', { person: 'B' })], personaDe, ahora)
  check('un alta cuenta como actividad de quien entra', act.get('B') === ahora)
  const act2 = actividadPorPersona([ev('dA', 1), ev('dB', 40), ev('dC', 2)], personaDe, ahora)
  check('la última señal de cada persona gana', act2.get('A') === ahora - DIA && act2.get('B') === ahora - 40 * DIA)
  check('expulsa al que lleva más de 30 días callado', JSON.stringify(elegirExpulsados({ miembros: [m('A', true), m('B'), m('C')], actividad: act2, ahora, yo: 'A' })) === '["B"]')
  check('no expulsa a quien está dentro del plazo', elegirExpulsados({ miembros: [m('A', true), m('C')], actividad: act2, ahora, yo: 'A' }).length === 0)
  check('sólo actúa el primer administrador activo', elegirExpulsados({ miembros: [m('A', true), m('C', true), m('B')], actividad: act2, ahora, yo: 'C' }).length === 0)
  const callados = new Map([['A', ahora], ['D', ahora], ['C', ahora - 40 * DIA], ['B', ahora - 40 * DIA]])
  check('si el primer administrador está callado, actúa el siguiente', JSON.stringify(elegirExpulsados({ miembros: [m('B', true), m('A', true), m('C'), m('D')], actividad: callados, ahora, yo: 'A' })) === '["B","C"]')
  check('un no administrador nunca expulsa', elegirExpulsados({ miembros: [m('A', true), m('B'), m('C')], actividad: act2, ahora, yo: 'C' }).length === 0)
  check('no expulsa a todos los demás en un grupo de más de dos (vista atrasada)', elegirExpulsados({ miembros: [m('A', true), m('B'), m('C')], actividad: new Map([['A', ahora], ['B', ahora - 40 * DIA], ['C', ahora - 40 * DIA]]), ahora, yo: 'A' }).length === 0)
  check('un reloj adelantado no da vida de más', actividadPorPersona([ev('dA', -400)], personaDe, ahora).get('A') === ahora)

  // Con el kit de verdad y un reloj que avanza 31 días.
  const reloj = { t: Date.parse('2027-01-01T10:00:00Z'), now () { return this.t } }
  const rd = new MemoryTransport(RELAYS, 11)
  const storageAna = new IdbStorage('ia')
  const a = await LocalHost.createGroup({ storage: storageAna, transport: rd, clock: reloj }, { name: 'G', relays: RELAYS, deviceName: 'Ana' })
  const inv = await a.createInvite()
  const b = await LocalHost.joinGroup({ storage: new IdbStorage('ib'), transport: rd, clock: reloj }, inv, 'Luis')
  for (let i = 0; i < 4 && b.status !== 'ready'; i += 1) { await b.sync(); await a.sync() }
  check('Luis entra en el grupo con reloj simulado', b.status === 'ready')
  reloj.t += 10 * DIA
  await a.records('presencia').add({ u: a.me.person, t: reloj.now() })
  reloj.t += 21 * DIA // 31 días desde el alta de Luis
  await a.records('presencia').add({ u: a.me.person, t: reloj.now() })
  await a.sync()
  const evs = await storageAna.getEvents({})
  const actividadReal = actividadPorPersona(evs, d => a.membershipView().personOf(d), reloj.now())
  const aExpulsar = elegirExpulsados({ miembros: a.members(), actividad: actividadReal, ahora: reloj.now(), yo: a.me.person })
  check('con el kit: se elige a Luis tras 31 días en silencio', aExpulsar.length === 1 && aExpulsar[0] === b.me.person, JSON.stringify(aExpulsar))
  await a.removePerson(aExpulsar[0])
  for (let i = 0; i < 3; i += 1) { await a.sync(); await b.sync() }
  check('Luis ve que ya no es miembro', b.removedInOwnView())
  check('Ana sigue siendo miembro y puede escribir', !a.removedInOwnView() && a.canSeal())
}

titulo('El DJ de Spotify y los anuncios no cuentan como música')
{
  const base = Date.UTC(2026, 9, 5, 12)
  const e = (track, artist, i) => ({ playedAt: new Date(base + i * 600_000).toISOString(), track, artist, durationMs: 200_000, msPlayed: 190_000, measuredMs: 190_000, countedForRegister: true })
  const eventos = [...Array.from({ length: 9 }, (_, i) => e('Up next', 'DJ', i)), e('Canción', 'Artista', 20), e('Canción', 'Artista', 30), e('Otra', 'Otro', 40)]
  const r = scoreMember(eventos)
  check('«Up next» del DJ no es la canción más escuchada', r.topTrack === 'Canción', r.topTrack)
  check('el DJ no es el artista más escuchado', r.topArtist === 'Artista', r.topArtist)
  check('la locución no suma escuchas', r.totalTracks === 3, String(r.totalTracks))
  check('una canción llamada «Up next» de un artista real sí cuenta', !esNoMusical('Up Next', 'Un Artista'))
  check('artistas con «DJ» en el nombre sí cuentan', !esNoMusical('Hola', 'DJ Snake') && esNoMusical('Anuncio', 'x') && esNoMusical('Hey', 'DJ X'))
}

titulo('Estadísticas nuevas de cada miembro')
{
  const ev = (h, mi, artist, track, msPlayed = 190_000, dia = 5) => ({ playedAt: new Date(Date.UTC(2026, 9, dia, h, mi)).toISOString(), track, artist, durationMs: 200_000, msPlayed, measuredMs: msPlayed, countedForRegister: true })
  const r = scoreMember([ev(10, 0, 'A', 't1'), ev(10, 3, 'A', 't2'), ev(10, 7, 'B', 't3'), ev(11, 0, 'A', 't1'), ev(15, 0, 'A', 't1'), ev(15, 4, 'C', 't4', 100_000), ev(20, 0, 'A', 't1', 190_000, 6)])
  check('tasa de finalización: terminadas sobre registradas', r.completionRate === 0.857, String(r.completionRate))
  check('día de más escucha', r.busiestDay === '2026-10-05', String(r.busiestDay))
  check('sesiones: separa por silencios de más de 10 min', r.sessionCount === 4, String(r.sessionCount))
  check('sesión más larga ≈ 9,5 min', Math.abs(r.longestSessionMinutes - 9.5) < 0.05, String(r.longestSessionMinutes))
  check('artistas con su número de escuchas, de más a menos', r.artistCounts[0][0] === 'A' && r.artistCounts[0][1] === 5, JSON.stringify(r.artistCounts))
  check('el DJ no aparece entre los artistas', !scoreMember([ev(10, 0, 'DJ', 'Up next')]).artistCounts.length)

  check('perfil horario', perfilHorario(8) === 'Mañanero' && perfilHorario(15) === 'De tarde' && perfilHorario(21) === 'De noche' && perfilHorario(2) === 'Noctámbulo' && perfilHorario(null) === '')
  check('día corto sin que la zona lo corra', diaCorto('2026-10-05').startsWith('lun'), diaCorto('2026-10-05'))
  const x = extrasNuevos(r)
  check('extras: finalización, día top, perfil y sesión', x.extras.length === 4 && x.temaVeces === 4 && x.artistaVeces === 5, JSON.stringify(x.extras.map(e => e.texto)))
  check('un resultado antiguo no trae extras ni huecos', extrasNuevos({ totalMinutes: 10 }).extras.length === 0)

  const ana = [['Rosalía', 10], ['Bad Bunny', 10]]
  const luis = [['Rosalía', 10], ['Quevedo', 10]]
  check('escucha en común: mitad y mitad = 50 %', escuchaComun(ana, luis) === 50)
  check('mismo reparto = 100 %', escuchaComun(ana, ana) === 100)
  check('nada en común = 0 %', escuchaComun(ana, [['Otro', 3]]) === 0)
  check('proporciones, no cantidades: 10 contra 100 escuchas', escuchaComun([['A', 1]], [['A', 100]]) === 100)
  check('sin datos no hay porcentaje', escuchaComun([], ana) === null)
  const pares = paresEnComun([
    { id: '1', nombre: 'Ana', yo: true, conteoArtistas: ana },
    { id: '2', nombre: 'Luis', conteoArtistas: luis },
    { id: '3', nombre: 'Mar', conteoArtistas: ana },
    { id: '4', nombre: 'Sin datos', conteoArtistas: [] }
  ])
  check('pares: 3 parejas y la más parecida primero', pares.length === 3 && pares[0].pct === 100 && pares[0].a === 'Ana' && pares[0].b === 'Mar', JSON.stringify(pares))
  const orden = ordenarPorTiempo([{ nombre: 'B', minutos: 30 }, { nombre: 'A', minutos: 90 }, { nombre: 'C', minutos: 30 }])
  check('ranking por tiempo de escucha, sin puntos', orden.map(f => f.nombre).join('') === 'ABC')
}

console.log(`\n${total - fallos}/${total} comprobaciones correctas`)
process.exit(fallos ? 1 : 0)
