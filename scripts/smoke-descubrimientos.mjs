/**
 * Comprobación de humo de los descubrimientos de artista (`lib/descubrimientos.js`).
 *
 * Historiales sintéticos con el resultado conocido de antemano: desbloqueo a
 * las 300 canciones únicas, artista con histórico previo, atracón de un día,
 * desempate entre candidatos, colaboraciones, mayúsculas y tildes, anuncios,
 * historial vacío, fechas rotas o futuras y escuchas fuera de la ventana.
 */
import {
  estadoDescubrimientos, contarCancionesUnicas, claveArtistaPrincipal, artistaPrincipalTexto,
  desdeCuando, textoCancionesNuevas, UMBRAL_CANCIONES_UNICAS, PREVIO_MAX_ESCUCHAS,
  PREVIO_MAX_CANCIONES, MIN_CANCIONES, MIN_ESCUCHAS, MIN_DIAS
} from '../src/lib/descubrimientos.js'
import { calcularWrapped } from '../src/lib/wrapped.js'

const DIA = 86400000
const AHORA = new Date(2026, 10, 11, 18, 0, 0).getTime()

let fallos = 0
function check (etiqueta, real, esperado) {
  const ok = Object.is(real, esperado)
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : `\n      esperado: ${JSON.stringify(esperado)} · recibido: ${JSON.stringify(real)}`}`)
  if (!ok) fallos++
}

/** Escucha `dias` días antes de AHORA (más `min` minutos). */
function e (dias, track, artist, min = 0) {
  return { played_at: new Date(AHORA - dias * DIA + min * 60000).toISOString(), track, artist, duration_ms: 200000, ms_played: 180000 }
}

/** `n` canciones únicas antiguas (hace 100 días), de artistas de relleno. */
function relleno (n) {
  return Array.from({ length: n }, (_, i) => e(100 + (i % 50), `Relleno ${i}`, `Grupo ${i % 40}`, i))
}

/** Un descubrimiento típico: `canciones` canciones, `escuchas` escuchas en `dias` días. */
function racha (artista, { canciones = 4, escuchas = 6, dias = 2, desde = 12, prefijo = 'Tema' } = {}) {
  return Array.from({ length: escuchas }, (_, i) =>
    e(desde - (i % dias), `${prefijo} ${i % canciones}`, artista, i))
}

console.log('\nUmbrales')
check('300 canciones únicas', UMBRAL_CANCIONES_UNICAS, 300)
check('antes: ≤ 2 escuchas y ≤ 1 canción', `${PREVIO_MAX_ESCUCHAS}/${PREVIO_MAX_CANCIONES}`, '2/1')
check('ahora: ≥ 4 canciones, ≥ 6 escuchas, ≥ 2 días', `${MIN_CANCIONES}/${MIN_ESCUCHAS}/${MIN_DIAS}`, '4/6/2')

console.log('\nDesbloqueo')
const nueva = racha('Lumi')
{
  // 295 de relleno + 4 de Lumi = 299 → bloqueado
  const s = estadoDescubrimientos([...relleno(295), ...nueva], AHORA)
  check('299 únicas: bloqueado', s.desbloqueado, false)
  check('299 únicas: cuenta exacta', s.cancionesUnicas, 299)
  check('bloqueado no detecta nada', s.descubrimiento, null)
  check('bloqueado sin candidatos', s.candidatos.length, 0)
  check('progreso 299/300', Math.round(s.progreso * 1000), 997)
  const s2 = estadoDescubrimientos([...relleno(296), ...nueva], AHORA)
  check('300 únicas: desbloqueado', s2.desbloqueado, true)
  check('300 únicas: progreso 1', s2.progreso, 1)
  check('300 únicas: Lumi es el descubrimiento', s2.descubrimiento?.artista, 'Lumi')
  check('Lumi: 4 canciones nuevas', s2.descubrimiento?.cancionesNuevas, 4)
  check('Lumi: 6 escuchas', s2.descubrimiento?.escuchas, 6)
  check('Lumi: 2 días', s2.descubrimiento?.diasActivos, 2)
  check('Lumi: top 3 canciones', s2.descubrimiento?.canciones.length, 3)
  check('Lumi: la más escuchada primero (2 escuchas)', s2.descubrimiento?.canciones[0].escuchas, 2)
  check('Lumi: sin historial previo', JSON.stringify(s2.descubrimiento?.previo), '{"escuchas":0,"canciones":0}')
  check('Lumi: desde hace 12 días', desdeCuando(s2.descubrimiento?.primeraEscucha, AHORA), 'desde hace 12 días')
  const s3 = estadoDescubrimientos([...relleno(400), ...nueva], AHORA)
  check('progreso nunca pasa de 1', s3.progreso, 1)
}

const base = relleno(320)

console.log('\nHistórico previo')
{
  const conDos = [...base, ...nueva, e(60, 'Tema 0', 'Lumi'), e(70, 'Tema 0', 'Lumi')]
  check('2 escuchas previas de 1 canción: sigue contando', estadoDescubrimientos(conDos, AHORA).descubrimiento?.artista, 'Lumi')
  const d = estadoDescubrimientos(conDos, AHORA).descubrimiento
  check('la canción ya oída no es nueva (3 nuevas de 4)', d?.cancionesNuevas, 3)
  check('previo: 2 escuchas, 1 canción', JSON.stringify(d?.previo), '{"escuchas":2,"canciones":1}')
  const conTres = [...conDos, e(80, 'Tema 0', 'Lumi')]
  check('3 escuchas previas: ya lo conocías', estadoDescubrimientos(conTres, AHORA).descubrimiento, null)
  const dosCanciones = [...base, ...nueva, e(60, 'Tema 0', 'Lumi'), e(70, 'Otra', 'Lumi')]
  check('2 canciones previas: ya lo conocías', estadoDescubrimientos(dosCanciones, AHORA).descubrimiento, null)
}

console.log('\nAtracón de un día y mínimos')
{
  check('todo en un día no cuenta', estadoDescubrimientos([...base, ...racha('Lumi', { dias: 1, escuchas: 12 })], AHORA).descubrimiento, null)
  check('3 canciones no bastan', estadoDescubrimientos([...base, ...racha('Lumi', { canciones: 3, escuchas: 9 })], AHORA).descubrimiento, null)
  check('5 escuchas no bastan', estadoDescubrimientos([...base, ...racha('Lumi', { canciones: 4, escuchas: 5 })], AHORA).descubrimiento, null)
}

console.log('\nVarios candidatos y desempate')
{
  const a = racha('Alba', { canciones: 4, escuchas: 10, dias: 3, prefijo: 'A' })
  const b = racha('Bruno', { canciones: 5, escuchas: 6, dias: 2, prefijo: 'B' })
  const s = estadoDescubrimientos([...base, ...a, ...b], AHORA)
  check('gana el de más canciones distintas (Bruno, 5)', s.descubrimiento?.artista, 'Bruno')
  check('los dos son candidatos', s.candidatos.map(c => c.artista).join(','), 'Bruno,Alba')
  const c = racha('Cira', { canciones: 4, escuchas: 8, dias: 2, prefijo: 'C' })
  const d = racha('Dani', { canciones: 4, escuchas: 7, dias: 3, prefijo: 'D' })
  check('empate en canciones: gana el de más escuchas', estadoDescubrimientos([...base, ...c, ...d], AHORA).descubrimiento?.artista, 'Cira')
  const f = racha('Fran', { canciones: 4, escuchas: 8, dias: 4, prefijo: 'F' })
  check('empate en canciones y escuchas: más días activos', estadoDescubrimientos([...base, ...c, ...f], AHORA).descubrimiento?.artista, 'Fran')
}

console.log('\nColaboraciones, mayúsculas y tildes')
{
  check('artista principal: primer nombre', artistaPrincipalTexto('Ana, Luis'), 'Ana')
  check('clave normalizada', claveArtistaPrincipal('  ÁNA , Luis'), 'ana')
  // Luis sólo aparece como colaborador: no es descubrimiento; Ana sí.
  const colab = racha('Ana, Luis', { prefijo: 'Dúo' })
  const s = estadoDescubrimientos([...base, ...colab], AHORA)
  check('la colaboración cuenta para Ana', s.descubrimiento?.artista, 'Ana')
  check('Luis no sale como candidato', s.candidatos.some(c => /luis/i.test(c.artista)), false)
  // Variantes de escritura del mismo artista y de la misma canción se agrupan.
  const variantes = [
    e(10, 'Canción Uno', 'Rosalía'), e(10, 'cancion uno', 'ROSALIA', 1), e(9, 'Dos', 'rosalía'),
    e(9, 'Tres', 'Rosalia'), e(8, 'Cuatro', 'Rosalía, Otro'), e(8, 'Cuatro', 'Rosalía', 2)
  ]
  const r = estadoDescubrimientos([...base, ...variantes], AHORA).descubrimiento
  check('agrupa mayúsculas y tildes en un artista', r?.cancionesDistintas, 4)
  check('6 escuchas en total', r?.escuchas, 6)
  check('el nombre que se enseña es el más reciente', r?.artista, 'Rosalía')
  // Un artista previo con otra grafía cuenta como ya conocido.
  const previo = [...variantes, e(50, 'Cinco', 'ROSALÍA'), e(55, 'Seis', 'rosalia')]
  check('histórico previo con otra grafía: ya lo conocías', estadoDescubrimientos([...base, ...previo], AHORA).descubrimiento, null)
}

console.log('\nAnuncios, vacío y relojes raros')
{
  const anuncios = Array.from({ length: 10 }, (_, i) => e(5 - (i % 3), `Anuncio ${i}`, 'Spotify', i))
  check('los anuncios no son descubrimiento', estadoDescubrimientos([...base, ...anuncios], AHORA).descubrimiento, null)
  check('los anuncios no suman canciones únicas', contarCancionesUnicas(anuncios, AHORA), 0)
  const vacio = estadoDescubrimientos([], AHORA)
  check('vacío: bloqueado, 0 canciones, progreso 0', JSON.stringify([vacio.desbloqueado, vacio.cancionesUnicas, vacio.progreso, vacio.descubrimiento]), '[false,0,0,null]')
  check('sin lista no rompe', estadoDescubrimientos(null, AHORA).cancionesUnicas, 0)
  check('entradas nulas y sin nombre no rompen', estadoDescubrimientos([null, {}, { played_at: 'x' }, e(1, '', '')], AHORA).cancionesUnicas, 0)
  const rotas = nueva.map(x => ({ ...x, played_at: 'no es una fecha' }))
  check('fechas ilegibles se ignoran', estadoDescubrimientos([...base, ...rotas], AHORA).descubrimiento, null)
  const futuras = nueva.map((x, i) => ({ ...x, played_at: new Date(AHORA + (5 + i) * DIA).toISOString() }))
  check('escuchas en el futuro se ignoran', estadoDescubrimientos([...base, ...futuras], AHORA).descubrimiento, null)
  check('y no suman canciones únicas', contarCancionesUnicas(futuras, AHORA), 0)
  check('ahora no numérico no rompe', typeof estadoDescubrimientos(base, NaN).desbloqueado, 'boolean')
}

console.log('\nFuera de la ventana de 30 días')
{
  const vieja = racha('Lumi', { desde: 45 })
  check('lo de hace 45 días no es de este mes', estadoDescubrimientos([...base, ...vieja], AHORA).descubrimiento, null)
  const dentro = racha('Lumi', { desde: 29 })
  check('lo de hace 29 días sí entra', estadoDescubrimientos([...base, ...dentro], AHORA).descubrimiento?.artista, 'Lumi')
  const mitad = [...dentro, e(31, 'Tema 0', 'Lumi'), e(32, 'Tema 0', 'Lumi'), e(33, 'Tema 0', 'Lumi')]
  check('las de hace 31-33 días cuentan como previas (3 > 2)', estadoDescubrimientos([...base, ...mitad], AHORA).descubrimiento, null)
  check('textos: 1 canción nueva / 5 nuevas', `${textoCancionesNuevas(1)} · ${textoCancionesNuevas(5)}`, '1 canción nueva · 5 canciones nuevas')
  check('desde hoy y desde ayer', `${desdeCuando(AHORA - 60000, AHORA)} · ${desdeCuando(AHORA - DIA, AHORA)}`, 'desde hoy · desde ayer')
}

console.log('\nWrapped')
{
  const w = calcularWrapped([...base, ...nueva], AHORA)
  check('el Wrapped trae el descubrimiento', w.descubrimiento?.artista, 'Lumi')
  check('con las mismas cifras que Inicio', w.descubrimiento?.escuchas, estadoDescubrimientos([...base, ...nueva], AHORA).descubrimiento.escuchas)
  check('bloqueado: el Wrapped no trae descubrimiento', calcularWrapped([...relleno(10), ...nueva], AHORA).descubrimiento, null)
  check('sin descubrimiento: null', calcularWrapped(base, AHORA).descubrimiento, null)
}

console.log(fallos ? `\nFallos: ${fallos}` : '\nDescubrimientos: todo correcto.')
process.exit(fallos ? 1 : 0)
