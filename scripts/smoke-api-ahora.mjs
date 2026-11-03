/**
 * Reproducción en directo por la API: qué se enseña y cuándo se deja en paz.
 *
 *   node scripts/smoke-api-ahora.mjs
 */
import { decidir, estadoDeApi } from '../src/composables/useApiNowPlaying.js'

let fallos = 0
function check (etiqueta, ok, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
  if (!ok) fallos += 1
}

const ok = {
  state: 'ok', track: 'Canción', artist: 'Ana, Luis', album: 'Disco', device: 'Salón',
  durationMs: 200_000, progressMs: 50_000, isPlaying: true
}

console.log('\nEstado del cartel')
{
  const e = estadoDeApi(ok, 1000)
  check('suena: modo playing con título, artista y álbum', e.mode === 'playing' && e.track === 'Canción' && e.artist === 'Ana, Luis' && e.album === 'Disco')
  check('el avance es el 25 %', e.progressPct === 25 && e.durationMs === 200_000 && e.progressSyncedAt === 1000)
  check('dice en qué dispositivo suena', e.meta === 'En Salón · vía Spotify')
  check('en pausa, modo paused', estadoDeApi({ ...ok, isPlaying: false }).mode === 'paused')
  check('sin dispositivo, sin «En …»', estadoDeApi({ ...ok, device: '' }).meta === 'Vía Spotify')
  check('sin duración no hay barra ni NaN', (() => {
    const s = estadoDeApi({ ...ok, durationMs: 0 })
    return s.progressPct === null && s.durationMs === null && s.progressSyncedAt === null
  })())
  check('el avance nunca pasa del 100 %', estadoDeApi({ ...ok, progressMs: 999_999 }).progressPct === 100)
  check('sin canción no hay estado', estadoDeApi({ state: 'idle' }) === null && estadoDeApi(null) === null && estadoDeApi({ state: 'error' }) === null)
}

console.log('\nCuándo se toma el relevo')
{
  check('parado: se muestra lo de la API', decidir({ respuesta: ok, modoActual: 'stopped', mandaApi: false }).accion === 'poner')
  check('una canción de la notificación sonando no se pisa', decidir({ respuesta: ok, modoActual: 'playing', mandaApi: false }) === null)
  check('en pausa por notificación y sonando en otro sitio: relevo', decidir({ respuesta: ok, modoActual: 'paused', mandaApi: false }).accion === 'poner')
  check('en pausa en ambos: se deja la de la notificación', decidir({ respuesta: { ...ok, isPlaying: false }, modoActual: 'paused', mandaApi: false }) === null)
  check('si lo puso la API, se sigue actualizando', decidir({ respuesta: ok, modoActual: 'playing', mandaApi: true }).accion === 'poner')
  check('si la API dice que no suena nada, se para lo suyo', decidir({ respuesta: { state: 'idle' }, modoActual: 'playing', mandaApi: true }).accion === 'parar')
  check('pero no se para lo de la notificación', decidir({ respuesta: { state: 'idle' }, modoActual: 'playing', mandaApi: false }) === null)
  check('un error o un límite de peticiones no apagan el cartel',
    decidir({ respuesta: { state: 'rate-limit' }, modoActual: 'playing', mandaApi: true }) === null &&
    decidir({ respuesta: { state: 'error' }, modoActual: 'playing', mandaApi: true }) === null)
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) con error.`)
  process.exit(1)
}
console.log('\nLa reproducción en directo por API decide bien.')
