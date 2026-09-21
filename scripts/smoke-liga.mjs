/**
 * Puntuación semanal de Comunidad: las cifras que se publican por miembro.
 *
 * Corre con Node a secas, sin Firebase ni red: `scoreMember` es una función pura
 * y lo único que necesita es una lista de escuchas.
 *
 *   node scripts/smoke-liga.mjs
 *
 * El caso que justifica esta prueba es la HORA PUNTA. `playedAt` viaja en UTC y
 * la hora que le interesa al usuario es la suya, así que el cálculo depende del
 * desfase de Europe/Madrid —que además cambia entre invierno (+1) y verano (+2)—.
 * Es un fallo que no se ve: la cifra sale, sólo que corrida una o dos horas.
 */
import { scoreMember, horaLocalDeEscucha } from './publish-weekly-leaderboard.mjs'

let fallos = 0
let total = 0

function check (etiqueta, real, esperado) {
  total += 1
  const ok = Object.is(real, esperado)
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : `\n      esperado: ${esperado}\n      recibido: ${real}`}`)
  if (!ok) fallos += 1
}

function titulo (s) {
  console.log()
  console.log(s)
}

/**
 * Una escucha que cuenta para todo. `msPlayed` por encima del 80 % de la
 * duración es lo que la hace válida para minutos y para «completada».
 */
function escucha (track, artist, playedAt, { completa = true, durationMs = 200000 } = {}) {
  const msPlayed = completa ? Math.round(durationMs * 0.9) : 0
  return {
    track,
    artist,
    playedAt,
    durationMs,
    msPlayed,
    // Por debajo del 80 % la app guarda msPlayed = 0 y el avance real queda en
    // measuredMs; con el 30 % la escucha cuenta para el registro pero no para
    // el tiempo, que es justo el caso intermedio que hay que cubrir.
    measuredMs: completa ? msPlayed : Math.round(durationMs * 0.3)
  }
}

// ── A · repertorio distinto ──────────────────────────────────────────────────

titulo('Artistas y canciones distintas')
{
  const r = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-12T10:00:00.000Z'),
    escucha('Uno', 'Alfa', '2026-01-12T11:00:00.000Z'),
    escucha('Dos', 'Alfa', '2026-01-12T12:00:00.000Z'),
    escucha('Tres', 'Beta', '2026-01-12T13:00:00.000Z')
  ])

  check('cuatro escuchas en total', r.totalTracks, 4)
  check('tres canciones distintas', r.distinctTracks, 3)
  check('dos artistas distintos', r.distinctArtists, 2)
}

{
  // Lo que no llega al umbral de registro no entra en ninguna de las dos
  // cifras, o el índice de variedad dividiría cosas distintas.
  const r = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-12T10:00:00.000Z'),
    { track: 'Fugaz', artist: 'Gamma', playedAt: '2026-01-12T11:00:00.000Z', durationMs: 200000, msPlayed: 0, measuredMs: 1000 }
  ])

  check('una escucha fugaz no suma al total', r.totalTracks, 1)
  check('ni a las canciones distintas', r.distinctTracks, 1)
  check('ni a los artistas distintos', r.distinctArtists, 1)
}

// ── A2 · índice de variedad ──────────────────────────────────────────────────

titulo('Índice de variedad')
{
  const sinRepetir = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-12T10:00:00.000Z'),
    escucha('Dos', 'Beta', '2026-01-12T11:00:00.000Z')
  ])
  check('sin repetir nada vale 1', sinRepetir.varietyIndex, 1)

  const mitad = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-12T10:00:00.000Z'),
    escucha('Uno', 'Alfa', '2026-01-12T11:00:00.000Z'),
    escucha('Dos', 'Beta', '2026-01-12T12:00:00.000Z'),
    escucha('Dos', 'Beta', '2026-01-12T13:00:00.000Z')
  ])
  check('cada tema dos veces vale 0,5', mitad.varietyIndex, 0.5)

  const vacio = scoreMember([])
  check('sin escuchas vale 0 y no NaN', vacio.varietyIndex, 0)
}

// ── A6 · hora punta ──────────────────────────────────────────────────────────

titulo('Hora punta, en la zona horaria del usuario')
{
  // Invierno: Madrid va en UTC+1.
  check('22:30 UTC de enero son las 23:00 en Madrid',
    horaLocalDeEscucha('2026-01-15T22:30:00.000Z'), 23)
  check('23:30 UTC de enero ya es medianoche en Madrid',
    horaLocalDeEscucha('2026-01-15T23:30:00.000Z'), 0)

  // Verano: Madrid va en UTC+2. Este es el caso que delata un cálculo en UTC.
  check('22:30 UTC de julio es la medianoche en Madrid',
    horaLocalDeEscucha('2026-07-15T22:30:00.000Z'), 0)
  check('07:10 UTC de julio son las 09:00 en Madrid',
    horaLocalDeEscucha('2026-07-15T07:10:00.000Z'), 9)

  check('una fecha inválida no revienta', horaLocalDeEscucha('vaya-fecha'), null)
}

{
  const r = scoreMember([
    escucha('Uno', 'Alfa', '2026-07-15T19:05:00.000Z'),   // 21 h en Madrid
    escucha('Dos', 'Alfa', '2026-07-15T19:40:00.000Z'),   // 21 h
    escucha('Tres', 'Beta', '2026-07-15T08:00:00.000Z')   // 10 h
  ])

  check('la hora punta es la de más escuchas', r.peakHour, 21)
  check('y se guarda cuántas fueron', r.peakHourPlays, 2)
}

{
  // Empate: gana la hora más temprana, para que la cifra no dependa del orden
  // en que Firestore devuelva los documentos.
  const r = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-15T20:00:00.000Z'),   // 21 h
    escucha('Dos', 'Beta', '2026-01-15T08:00:00.000Z')    // 9 h
  ])
  check('en empate gana la hora más temprana', r.peakHour, 9)
}

{
  const vacio = scoreMember([])
  check('sin escuchas la hora punta es null, no medianoche', vacio.peakHour, null)
  check('y sin escuchas en esa hora', vacio.peakHourPlays, 0)
}

// ── Lo que ya existía sigue igual ────────────────────────────────────────────

titulo('Las cifras anteriores no cambian')
{
  const r = scoreMember([
    escucha('Uno', 'Alfa', '2026-01-12T10:00:00.000Z', { durationMs: 240000 }),
    escucha('Dos', 'Alfa', '2026-01-13T10:00:00.000Z', { durationMs: 240000 })
  ])

  check('dos canciones completadas', r.completedTracks, 2)
  check('dos días activos', r.activeDays, 2)
  check('artista top', r.topArtist, 'Alfa')
  check('con sus dos escuchas', r.topArtistPlays, 2)
  // 0,9 × 240 000 ms = 216 s = 3,6 min por canción.
  check('minutos válidos', r.totalMinutes, 7.2)
}

// ── Una sola implementación ──────────────────────────────────────────────────
//
// El ranking lo puede escribir la acción de GitHub (este script) o la función
// programada de Firebase. Durante un tiempo cada una tenía su copia del
// cálculo y sólo se actualizó la de aquí: según cuál publicara, el grupo se
// quedaba sin repertorio, variedad ni hora punta, y la app —que oculta lo que
// no viene— dejaba de enseñar las estadísticas de cada miembro. Ahora las dos
// leen `firebase/functions/scoring.js`, y esto lo comprueba.

titulo('Las dos publicaciones comparten el cálculo')
{
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const raizDe = (rel) => fileURLToPath(new URL(rel, import.meta.url))

  const compartido = await import('../firebase/functions/scoring.js')
  check('este script usa el módulo compartido',
    scoreMember, (compartido.default || compartido).scoreMember)
  check('y la misma hora local',
    horaLocalDeEscucha, (compartido.default || compartido).horaLocalDeEscucha)

  const funcion = readFileSync(raizDe('../firebase/functions/index.js'), 'utf8')
  check('la función programada también lo requiere',
    /require\(['"]\.\/scoring['"]\)/.test(funcion), true)
  check('y no vuelve a declarar scoreMember por su cuenta',
    /\bfunction scoreMember\b/.test(funcion), false)
}

console.log()
if (fallos > 0) {
  console.log(`Fallos: ${fallos} de ${total}`)
  process.exit(1)
}
console.log(`Comunidad: ${total} comprobaciones, todo correcto.`)
