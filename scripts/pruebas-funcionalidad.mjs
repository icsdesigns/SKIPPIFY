/**
 * Registros de funcionalidad en los grupos: empaquetado, lectura y política de subida.
 * Corre con node a secas (necesita Node 18+ por CompressionStream):
 *
 *   node scripts/pruebas-funcionalidad.mjs
 */
import {
  desempaquetarRegistro, empaquetarRegistro, registroMeta, registrosDeSubida, resumirFuncionalidad,
  tocaSubir, MAX_TROZOS, TOPE_FILAS, TROZO_CHARS, SUBIDA_CADA_MS, SUBIDA_TRAS_RESPUESTA_MS, REINTENTO_MS
} from '../src/lib/localhost/funcionalidad.js'

let fallos = 0
let total = 0
function check (etiqueta, ok, detalle = '') {
  total += 1
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : ` ${detalle}`}`)
  if (!ok) fallos += 1
}

function fila (i, sesion = 1) {
  return {
    startedAt: 1_700_000_000_000 + i * 200_000, endedAt: 1_700_000_000_000 + i * 200_000 + 190_000,
    track: `Canción número ${i}`, artist: `Artista ${i % 37}`, durationMs: 200_000, playedMs: 190_000,
    counted: true, decision: 'conservada', reason: 'no_duplicada', source: 'notification', positionAtDecisionMs: 400,
    fundido: { detectado: i % 5 === 0 ? 'fundido_probable' : 'sin_fundido', confianza: 0.85, solapeMs: i % 5 === 0 ? 8000 : 120,
      restanteAnteriorMs: -120, posicionPrimeraVistaMs: 300, motivo: 'solape_nulo', sesionEscuchaId: sesion, respuestaUsuario: null }
  }
}

console.log('\nEmpaquetado')
{
  const filas = Array.from({ length: 300 }, (_, i) => fila(i))
  const sesiones = [{ id: 1, inicio: 1, fin: 2, escuchaActivaMs: 3_600_000, canciones: 300, respuesta: 'si', respuestaEn: 99 }]
  const emp = await empaquetarRegistro({ filas, sesiones, total: 300 })
  check('se empaqueta', !!emp && emp.piezas.length >= 1)
  check('cada trozo cabe en una nota', emp.piezas.every(p => p.length <= TROZO_CHARS))
  const des = await desempaquetarRegistro(emp.piezas)
  check('ida y vuelta: mismas filas', des?.filas.length === 300 && des.filas[7].track === 'Canción número 7')
  check('la respuesta se une por sesión', des.filas[5].fundido.respuestaUsuario === true)
  check('sin sesión conocida, la respuesta es null', (await desempaquetarRegistro((await empaquetarRegistro({ filas: [fila(1, 9)], sesiones: [], total: 1 })).piezas)).filas[0].fundido.respuestaUsuario === null)
  check('un trozo corrupto no rompe', (await desempaquetarRegistro(['@@@'])) === null)

  const muchas = Array.from({ length: 5000 }, (_, i) => fila(i, i))
  const grande = await empaquetarRegistro({ filas: muchas, sesiones: [], total: 5000 })
  check(`con 5000 filas sólo se suben las ${TOPE_FILAS} más recientes`, grande.filas <= TOPE_FILAS)
  check('y no pasa de los trozos máximos', grande.piezas.length <= MAX_TROZOS, String(grande.piezas.length))
  const dg = await desempaquetarRegistro(grande.piezas)
  check('conserva las más recientes', dg.filas[dg.filas.length - 1].track === 'Canción número 4999')
  check('recuerda cuántas había en total', dg.total === 5000)
}

console.log('\nLectura por persona')
{
  const emp = await empaquetarRegistro({ filas: Array.from({ length: 40 }, (_, i) => fila(i)), sesiones: [], total: 40 })
  const trozos = registrosDeSubida(emp.piezas, { app: 'v4.5.5-b142', filas: emp.filas, total: 40 }, 5_000)
  const entradas = [
    { id: 'm1', persona: 'ana', hlc: 'a', data: registroMeta('v4.5.4-b140', 1_000) },
    { id: 'm2', persona: 'ana', hlc: 'b', data: registroMeta('v4.5.5-b142', 4_000) },
    ...trozos.map((d, i) => ({ id: `c${i}`, persona: 'ana', hlc: 'c', data: d })),
    { id: 'm3', persona: 'luis', hlc: 'd', data: registroMeta('v4.4.0-b100', 2_000) },
    { id: 'x', persona: 'luis', hlc: 'e', data: { v: 9, t: 'm', app: 'raro', at: 1 } },
    { id: 'y', persona: 'luis', hlc: 'f', data: { v: 1, t: 'c', sid: 's', i: 5, n: 2, z: 'aa', at: 3 } }
  ]
  const r = resumirFuncionalidad(entradas)
  check('la versión más reciente de cada miembro', r.get('ana').version === 'v4.5.5-b142' && r.get('luis').version === 'v4.4.0-b100')
  check('subida completa de ana', r.get('ana').completa && r.get('ana').filas === 40 && r.get('ana').subidaEn === 5_000)
  check('luis no ha subido registro', !r.get('luis').completa && r.get('luis').piezas === null)
  check('un registro de otra versión o malformado se ignora', r.get('luis').ids.meta.length === 1 && r.get('luis').ids.trozos.length === 0)
  const des = await desempaquetarRegistro(r.get('ana').piezas)
  check('lo subido se puede descargar', des?.filas.length === 40)

  // Subida nueva a medias: se sigue enseñando la anterior completa.
  const nuevos = registrosDeSubida(['aa', 'bb'], { app: 'v', filas: 1, total: 1 }, 9_000).slice(0, 1)
  const r2 = resumirFuncionalidad([...entradas, ...nuevos.map((d, i) => ({ id: `n${i}`, persona: 'ana', hlc: 'z', data: d }))])
  check('una subida a medias no tapa la anterior', r2.get('ana').completa && r2.get('ana').subidaEn === 5_000)
}

console.log('\nCuándo subir')
{
  const h = 3600 * 1000
  const local = { filas: 100, respuestaMasReciente: 0 }
  check('nunca subido: toca', tocaSubir(undefined, local, 1_000))
  check('sin filas no hay nada que subir', !tocaSubir(undefined, { filas: 0, respuestaMasReciente: 0 }, 1_000))
  check('hace una hora: no toca', !tocaSubir({ at: 10 * h }, local, 11 * h))
  check('pasadas las horas fijadas: toca', tocaSubir({ at: 10 * h }, local, 10 * h + SUBIDA_CADA_MS))
  check('respuesta nueva pero demasiado pronto: no toca', !tocaSubir({ at: 10 * h, respuestaAt: 5 }, { filas: 5, respuestaMasReciente: 10 }, 10 * h + 60_000))
  check('respuesta nueva pasado el mínimo: toca', tocaSubir({ at: 10 * h, respuestaAt: 5 }, { filas: 5, respuestaMasReciente: 10 }, 10 * h + SUBIDA_TRAS_RESPUESTA_MS))
  check('respuesta ya subida: no toca', !tocaSubir({ at: 10 * h, respuestaAt: 10 }, { filas: 5, respuestaMasReciente: 10 }, 10 * h + SUBIDA_TRAS_RESPUESTA_MS))
  check('tras un fallo se espera antes de reintentar', !tocaSubir({ fallo: 100 * h }, local, 100 * h + REINTENTO_MS - 1))
  check('y luego se reintenta', tocaSubir({ fallo: 100 * h }, local, 100 * h + REINTENTO_MS))
}

console.log(`\nFuncionalidad: ${total - fallos}/${total} pruebas correctas`)
if (fallos > 0) process.exit(1)
