/**
 * Registros de funcionalidad en los grupos: empaquetado, lectura y política de subida.
 * Corre con node a secas (necesita Node 18+ por CompressionStream):
 *
 *   node scripts/pruebas-funcionalidad.mjs
 */
import { aBase64, pasar } from '../src/lib/localhost/escuchas.js'
import {
  desempaquetarRegistro, empaquetarRegistro, registroMeta, registrosDeSubida, resumirFuncionalidad,
  tocaSubir, MAX_TROZOS, TOPE_FILAS, TROZO_CHARS, SUBIDA_CADA_MS, SUBIDA_TRAS_RESPUESTA_MS, REINTENTO_MS
} from '../src/lib/localhost/funcionalidad.js'
import { resumirRegistro, predecirSesion } from '../src/lib/registroResumen.js'

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

  // Una «bomba» gzip (muy pequeña, enorme al descomprimir) no debe agotar la memoria.
  const bomba = aBase64(await pasar(new Uint8Array(40 * 1024 * 1024), new CompressionStream('gzip')))
  check('una bomba gzip se rechaza', (await desempaquetarRegistro([bomba])) === null)

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

console.log('\nBloque de duplicadas (formato 3)')
{
  const nativa = {
    ...fila(1), decision: 'saltada', reason: 'duplicada', counted: false, playedMs: 300,
    skipEnabled: true, skipInterval: '2w',
    duplicada: { comprobada: true, esDuplicada: true, deberiaSaltarse: true, saltada: true, resultadoSalto: 'confirmado', msHastaCambio: 280, ventanaMs: 12000 },
    fundido: { ...fila(1).fundido, activoEstimado: true }
  }
  const emp = await empaquetarRegistro({ filas: [nativa, fila(2)], sesiones: [], total: 2 })
  const des = await desempaquetarRegistro(emp.piezas)
  const d = des.filas[0].duplicada
  check('ida y vuelta del bloque de duplicadas', d && d.esDuplicada === true && d.deberiaSaltarse && d.saltada && d.resultadoSalto === 'confirmado' && d.msHastaCambio === 280 && d.ventanaMs === 12000)
  check('  con los ajustes de entonces', d.funcionActiva === true && d.intervalo === '2w')
  check('  y la estimación de fundido', des.filas[0].fundido.activoEstimado === true)
  check('fila sin bloque (versión anterior): duplicada null', des.filas[1].duplicada === null && des.filas[1].fundido.activoEstimado === null)

  // Una subida de formato 2 (versiones anteriores) se sigue leyendo.
  const json = JSON.stringify({ f: 2, g: 1, n: 1, filas: [[1, 2, 't', 'a', 100, 50, 1, 'conservada', 'no_duplicada', 'sonda', 10, 'sin_fundido', 0.9, -100, -100, 10, 'solape_nulo', null]], ses: [] })
  const z = aBase64(await pasar(new TextEncoder().encode(json), new CompressionStream('gzip')))
  const viejo = await desempaquetarRegistro([z])
  check('una subida de formato 2 se sigue leyendo', viejo?.filas.length === 1 && viejo.filas[0].duplicada === null)
}

console.log('\nResumen del registro')
{
  const dup = (decision, reason, d) => ({ decision, reason, duplicada: { comprobada: true, funcionActiva: true, ...d } })
  const filas = [
    dup('saltada', 'duplicada', { esDuplicada: true, deberiaSaltarse: true, resultadoSalto: 'confirmado', msHastaCambio: 300 }),
    dup('saltada', 'duplicada', { esDuplicada: true, deberiaSaltarse: true, resultadoSalto: 'abortado', msHastaCambio: null }),
    dup('conservada', 'fuera_de_ventana', { esDuplicada: true, deberiaSaltarse: true }),
    dup('conservada', 'freno_de_cadena', { esDuplicada: true, deberiaSaltarse: true }),
    dup('conservada', 'no_duplicada', { esDuplicada: false, deberiaSaltarse: false }),
    { decision: 'sin_decidir', reason: 'funcion_desactivada', duplicada: { comprobada: true, funcionActiva: false, esDuplicada: true, deberiaSaltarse: false } },
    { decision: 'conservada', reason: 'no_duplicada' }
  ]
  const r = resumirRegistro(filas, []).duplicadas
  check('cuenta duplicadas y las que debían saltarse', r.duplicadas === 5 && r.deberianSaltarse === 4)
  check('saltadas, confirmadas y abortadas', r.saltadas === 2 && r.saltosConfirmados === 1 && r.saltosAbortados === 1)
  check('escapadas por motivo', r.escapadas === 2 && r.escapadasPorMotivo.fuera_de_ventana === 1 && r.frenosDeCadena === 1)
  check('duplicadas con la función apagada', r.duplicadasConFuncionApagada === 1)
  check('eficacia = confirmadas / debían', r.eficacia === 25)
  check('filas sin bloque no cuentan', r.filas === 6)

  check('predicción: sin datos, incierto', predecirSesion({ probables: 1, sinFundido: 0 }) === 'incierto')
  check('predicción: mayoría con fundido, sí', predecirSesion({ probables: 12, sinFundido: 12 }) === 'si')
  check('predicción: casi todo sin fundido, no', predecirSesion({ probables: 4, sinFundido: 27 }) === 'no')
  check('predicción: mezcla, incierto', predecirSesion({ probables: 3, sinFundido: 7 }) === 'incierto')

  const fu = (id, detectado) => ({ fundido: { detectado, sesionEscuchaId: id, solapeMs: 7000 } })
  const fil = [fu(1, 'fundido_probable'), fu(1, 'fundido_probable'), fu(2, 'sin_fundido'), fu(2, 'sin_fundido'), fu(3, 'sin_fundido'), fu(3, 'sin_fundido')]
  const ses = [{ id: 1, respuesta: 'si' }, { id: 2, respuesta: 'no' }, { id: 3, respuesta: 'si' }, { id: 4, respuesta: null }]
  const c = resumirRegistro(fil, ses).fundido.contraste
  check('contraste con la encuesta', c.contrastadas === 3 && c.aciertos === 2 && c.matriz.no_si === 1 && c.eficacia === 66.7)
  check('sensibilidad y precisión', c.sensibilidad === 50 && c.precision === 100)
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
