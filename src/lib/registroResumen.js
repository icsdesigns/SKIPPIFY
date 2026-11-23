/**
 * Resumen del «registro de funcionalidad» para revisar el motor sin hojas de
 * cálculo. Va dentro del fichero exportado (Ajustes) y del que se descarga de un
 * grupo, una vez por miembro. Funciones puras: aceptan las filas tal como salen
 * del fichero (marcas en ISO o en ms, da igual: aquí no se usan).
 *
 * Dos bloques:
 *
 *  · duplicadas: cuántas canciones eran duplicadas según el intervalo
 *    configurado, cuántas debían saltarse según los ajustes (función activa),
 *    cuántas se saltaron de verdad (salto confirmado: la canción cambió) y, de
 *    las que se escaparon, por qué.
 *
 *  · fundido: por cada sesión de escucha, lo que predice el motor (¿hubo fundido?)
 *    a partir de las transiciones que midió, frente a lo que respondió el
 *    usuario en la encuesta, con la tabla de aciertos.
 */

/** Proporción mínima de transiciones con fundido para predecir «sí». */
export const PREDICCION_SI_MIN = 0.5
/** Proporción máxima para predecir «no». Entre ambas, «incierto». */
export const PREDICCION_NO_MAX = 0.15
/** Transiciones clasificadas (con o sin fundido) que hacen falta para predecir. */
export const PREDICCION_MIN_TRANSICIONES = 2

function cuantiles (valores) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return { n: 0, mediana: null, p90: null, max: null }
  return { n: v.length, mediana: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)], max: v[v.length - 1] }
}

function sumar (obj, clave) {
  obj[clave] = (obj[clave] || 0) + 1
}

/** Bloque de duplicadas. Las filas sin bloque `duplicada` (versiones < 4.10) no cuentan. */
export function resumirDuplicadas (filas) {
  const out = {
    filas: 0,
    comprobadas: 0,
    duplicadas: 0,
    duplicadasConFuncionApagada: 0,
    deberianSaltarse: 0,
    saltadas: 0,
    saltosConfirmados: 0,
    saltosAbortados: 0,
    saltosSinConfirmar: 0,
    escapadas: 0,
    escapadasPorMotivo: {},
    frenosDeCadena: 0,
    msHastaCambio: cuantiles([]),
    // Saltos hechos sin que la fila diga que debían hacerse: debería ser 0.
    saltosSinMotivo: 0
  }
  const ms = []
  for (const f of filas || []) {
    const d = f?.duplicada
    if (!d) continue
    out.filas++
    if (!d.comprobada) continue
    out.comprobadas++
    const saltada = f.decision === 'saltada'
    if (d.esDuplicada) {
      out.duplicadas++
      if (d.funcionActiva === false && !d.deberiaSaltarse) out.duplicadasConFuncionApagada++
    }
    if (d.deberiaSaltarse) {
      out.deberianSaltarse++
      if (!saltada) {
        out.escapadas++
        sumar(out.escapadasPorMotivo, f.reason || 'desconocido')
        if (f.reason === 'freno_de_cadena') out.frenosDeCadena++
      }
    } else if (saltada) {
      out.saltosSinMotivo++
    }
    if (saltada) {
      out.saltadas++
      if (d.resultadoSalto === 'confirmado') out.saltosConfirmados++
      else if (d.resultadoSalto === 'abortado') out.saltosAbortados++
      else out.saltosSinConfirmar++
      if (Number.isFinite(d.msHastaCambio)) ms.push(d.msHastaCambio)
    }
  }
  out.msHastaCambio = cuantiles(ms)
  out.eficacia = out.deberianSaltarse ? Math.round((out.saltosConfirmados / out.deberianSaltarse) * 1000) / 10 : null
  return out
}

/** Predicción de una sesión a partir de los recuentos de sus transiciones. */
export function predecirSesion ({ probables = 0, sinFundido = 0 }) {
  const n = probables + sinFundido
  if (n < PREDICCION_MIN_TRANSICIONES) return 'incierto'
  const p = probables / n
  if (p >= PREDICCION_SI_MIN) return 'si'
  if (p <= PREDICCION_NO_MAX) return 'no'
  return 'incierto'
}

/** Bloque de fundido: transiciones, predicción por sesión y contraste con la encuesta. */
export function resumirFundido (filas, sesiones) {
  const transiciones = { fundido_probable: 0, fundido_posible: 0, sin_fundido: 0, no_aplica: 0 }
  const motivos = {}
  const porSesion = new Map()
  for (const f of filas || []) {
    const fu = f?.fundido
    if (!fu || !fu.detectado) continue
    sumar(transiciones, fu.detectado)
    if (fu.motivo) sumar(motivos, fu.motivo)
    const id = fu.sesionEscuchaId
    if (id === null || id === undefined) continue
    if (!porSesion.has(id)) porSesion.set(id, { probables: 0, posibles: 0, sinFundido: 0, noAplica: 0, solapes: [] })
    const s = porSesion.get(id)
    if (fu.detectado === 'fundido_probable') { s.probables++; if (Number.isFinite(fu.solapeMs)) s.solapes.push(fu.solapeMs) } else if (fu.detectado === 'fundido_posible') s.posibles++
    else if (fu.detectado === 'sin_fundido') s.sinFundido++
    else s.noAplica++
  }

  const matriz = { si_si: 0, si_no: 0, no_si: 0, no_no: 0 }
  let inciertas = 0
  const lista = []
  for (const ses of sesiones || []) {
    const c = porSesion.get(ses.id) || { probables: 0, posibles: 0, sinFundido: 0, noAplica: 0, solapes: [] }
    const prediccion = predecirSesion(c)
    const respuesta = ses.respuesta === 'si' || ses.respuesta === 'no' ? ses.respuesta : null
    let acierto = null
    if (respuesta) {
      if (prediccion === 'incierto') inciertas++
      else {
        matriz[`${prediccion}_${respuesta}`]++
        acierto = prediccion === respuesta
      }
    }
    lista.push({
      id: ses.id,
      inicio: ses.inicio ?? null,
      canciones: ses.canciones ?? null,
      probables: c.probables,
      posibles: c.posibles,
      sinFundido: c.sinFundido,
      solapeTipicoMs: cuantiles(c.solapes).mediana,
      prediccion,
      respuesta,
      acierto
    })
  }
  const contrastadas = matriz.si_si + matriz.si_no + matriz.no_si + matriz.no_no
  const aciertos = matriz.si_si + matriz.no_no
  return {
    transiciones,
    motivos,
    sesiones: lista,
    contraste: {
      respondidas: contrastadas + inciertas,
      contrastadas,
      inciertas,
      aciertos,
      fallos: contrastadas - aciertos,
      // filas = predicción del motor, columnas = respuesta del usuario
      matriz,
      eficacia: contrastadas ? Math.round((aciertos / contrastadas) * 1000) / 10 : null,
      // De las sesiones con fundido según el usuario, cuántas detectó el motor.
      sensibilidad: (matriz.si_si + matriz.no_si) ? Math.round((matriz.si_si / (matriz.si_si + matriz.no_si)) * 1000) / 10 : null,
      // De las que el motor dio por fundido, cuántas lo eran según el usuario.
      precision: (matriz.si_si + matriz.si_no) ? Math.round((matriz.si_si / (matriz.si_si + matriz.si_no)) * 1000) / 10 : null
    }
  }
}

export function resumirRegistro (filas, sesiones) {
  return {
    duplicadas: resumirDuplicadas(filas),
    fundido: resumirFundido(filas, sesiones)
  }
}
