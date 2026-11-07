/**
 * usePlayLog — «Registro de funcionalidad»: exporta el registro de
 * reproducciones del motor y gestiona sus ajustes.
 *
 * El motor nativo anota una fila por canción que suena: si se saltó o se
 * conservó, el motivo, los criterios (modo, intervalo) y el calibrado que había
 * en ese momento y, desde la versión 2, la medición de fundido (qué detectó el
 * motor) junto con la respuesta del usuario a «¿has estado escuchando música
 * con fundido?». Este módulo lo lee por páginas y lo guarda en un JSON junto
 * con un resumen del historial contra el que el motor decide, que es lo que
 * permite averiguar por qué una canción escuchada hace tiempo no se saltó.
 */
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { useEventStore } from '@/stores/events'
import { useFeatures } from '@/composables/useFeatures'

const PAGE_SIZE = 500
const EXPORT_SCHEMA = 'skippify-play-log'
// 2: filas con `fundido` y lista de `sesionesDeEscucha`. Solo se añade, nada se quita.
const EXPORT_VERSION = 2

const busy = ref(false)
const total = ref(null)
/** «Medir fundido (experimental)» y «Compartir mi registro con mis grupos»: ambos activados por defecto. */
const fundidoMedir = ref(true)
const fundidoCompartir = ref(true)

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

function iso (ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null
}

/** Convierte las marcas de tiempo nativas (ms) a ISO para que el fichero se lea solo. */
function readableRow (row) {
  return {
    ...row,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    matchedPreviousAt: iso(row.matchedPreviousAt)
  }
}

function readableSession (s) {
  return {
    ...s,
    inicio: iso(s.inicio),
    fin: iso(s.fin),
    respuestaEn: iso(s.respuestaEn)
  }
}

async function loadAllRows (NL) {
  const rows = []
  let history = null
  let expected = null
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await NL.getPlayLog({ offset, limit: PAGE_SIZE })
    if (!history) history = page?.history || null
    if (expected === null) expected = Number(page?.total || 0)
    const batch = Array.isArray(page?.rows) ? page.rows : []
    for (const row of batch) rows.push(readableRow(row))
    if (batch.length < PAGE_SIZE || rows.length >= expected) break
  }
  return { rows, history }
}

/**
 * Las últimas `max` filas del registro NATIVO, con las marcas en ms (sin pasar a
 * ISO) y las sesiones de escucha, para subirlas a los grupos. Devuelve null si
 * no hay registro nativo (navegador) o no se puede leer.
 */
export async function leerRegistroParaGrupos (max) {
  const NL = plugin()
  if (!NL?.getPlayLog || !NL?.getListeningSessions) return null
  try {
    const first = await NL.getPlayLog({ offset: 0, limit: 1 })
    const totalRows = Number(first?.total || 0)
    const filas = []
    for (let offset = Math.max(0, totalRows - max); offset < totalRows; offset += PAGE_SIZE) {
      const page = await NL.getPlayLog({ offset, limit: Math.min(PAGE_SIZE, totalRows - offset) })
      const batch = Array.isArray(page?.rows) ? page.rows : []
      if (!batch.length) break
      filas.push(...batch)
    }
    const ses = await NL.getListeningSessions()
    const sesiones = Array.isArray(ses?.sessions) ? ses.sessions : []
    const respuestaMasReciente = sesiones.reduce((m, s) => Math.max(m, Number(s.respuestaEn) || 0), 0)
    return { filas, sesiones, total: totalRows, respuestaMasReciente }
  } catch {
    return null
  }
}

/**
 * Cuántas filas hay y la marca de la respuesta más reciente del usuario, sin
 * traer el registro: es lo único que hace falta para decidir si toca subir.
 */
export async function leerResumenRegistro () {
  const NL = plugin()
  if (!NL?.getPlayLog || !NL?.getListeningSessions) return null
  try {
    const first = await NL.getPlayLog({ offset: 0, limit: 1 })
    const ses = await NL.getListeningSessions()
    const sesiones = Array.isArray(ses?.sessions) ? ses.sessions : []
    return {
      filas: Number(first?.total || 0),
      respuestaMasReciente: sesiones.reduce((m, s) => Math.max(m, Number(s.respuestaEn) || 0), 0)
    }
  } catch {
    return null
  }
}

/** Ajustes nativos de fundido; si no hay puente (navegador) devuelve los valores por defecto. */
export async function leerAjustesFundido () {
  const NL = plugin()
  if (!NL?.getFundidoConfig) return { medir: fundidoMedir.value, compartir: fundidoCompartir.value }
  try {
    const cfg = await NL.getFundidoConfig()
    fundidoMedir.value = cfg?.medir !== false
    fundidoCompartir.value = cfg?.compartir !== false
  } catch { /* se queda lo que hubiera */ }
  return { medir: fundidoMedir.value, compartir: fundidoCompartir.value }
}

async function guardarAjustesFundido (cambio) {
  const NL = plugin()
  if (cambio.medir !== undefined) fundidoMedir.value = !!cambio.medir
  if (cambio.compartir !== undefined) fundidoCompartir.value = !!cambio.compartir
  if (!NL?.setFundidoConfig) return
  try {
    const cfg = await NL.setFundidoConfig(cambio)
    fundidoMedir.value = cfg?.medir !== false
    fundidoCompartir.value = cfg?.compartir !== false
  } catch { /* el valor local ya está puesto; el nativo se corrige en la siguiente lectura */ }
}

function jsHistorySummary (events) {
  const times = events
    .map(e => Date.parse(e?.played_at))
    .filter(Number.isFinite)
  return {
    eventos: events.length,
    primero: times.length ? new Date(Math.min(...times)).toISOString() : null,
    ultimo: times.length ? new Date(Math.max(...times)).toISOString() : null
  }
}

/** Guarda un JSON como fichero (Documentos/Skippify/registro en Android, descarga en el navegador). */
export async function saveJson (fileName, text) {
  if (Capacitor.isNativePlatform()) {
    const dir = 'Skippify/registro'
    await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true })
    await Filesystem.writeFile({
      path: `${dir}/${fileName}`,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })
    return `Documents/${dir}/${fileName}`
  }

  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return `Descargas/${fileName}`
}

/** Marca de fecha para los nombres de fichero: 2026-11-07T10-15-00. */
export function stampDeFichero () {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/**
 * Lee el registro nativo y lo guarda como fichero.
 * @returns {Promise<{ path: string, rows: number }>}
 */
async function exportPlayLog () {
  const NL = plugin()
  if (!NL?.getPlayLog) {
    throw new Error('El registro de funcionalidad sólo existe en la app de Android.')
  }

  busy.value = true
  try {
    const { rows, history } = await loadAllRows(NL)
    total.value = rows.length

    let diagnostics = null
    try { diagnostics = await NL.getDuplicateDiagnostics?.() } catch { /* ignorado */ }

    let sesiones = []
    try {
      const res = await NL.getListeningSessions?.()
      sesiones = Array.isArray(res?.sessions) ? res.sessions.map(readableSession) : []
    } catch { /* ignorado */ }

    const { state: featureState } = useFeatures()
    const events = useEventStore().state.events
    const ajustesFundido = await leerAjustesFundido()

    const payload = {
      schema: EXPORT_SCHEMA,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      app: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
      // Criterios y calibrado de AHORA; cada fila trae los suyos de entonces.
      ajustesActuales: {
        modo: featureState.listeningMode,
        saltarDuplicadas: !!featureState.skipDuplicates,
        intervalo: featureState.skipDuplicatesInterval,
        medirFundido: ajustesFundido.medir,
        compartirRegistroConGrupos: ajustesFundido.compartir,
        calibrado: diagnostics?.config || null
      },
      // Lo que el motor sabe de tus escuchas (la base contra la que decide).
      historialDelMotor: history
        ? {
            ...history,
            oldestAt: iso(history.oldestAt),
            newestAt: iso(history.newestAt)
          }
        : null,
      // Lo que ve la app en sus estadísticas, para contrastarlo con lo anterior.
      historialDeLaApp: jsHistorySummary(events),
      primeraFilaDelRegistro: rows.length ? rows[0].startedAt : null,
      decisionesEnMemoria: diagnostics?.log || [],
      // Sesiones de escucha (≥ 30 min de escucha reciben la pregunta de fundido)
      // con la respuesta del usuario: «si», «no» o null si no contestó.
      sesionesDeEscucha: sesiones,
      // Cada fila trae `fundido: { detectado, confianza, solapeMs, ..., respuestaUsuario }`:
      // lo que detectó el motor frente a lo que dijo el usuario de su sesión.
      registro: rows
    }

    const path = await saveJson(`skippify-registro-funcionalidad-${stampDeFichero()}.json`, JSON.stringify(payload, null, 2))
    return { path, rows: rows.length }
  } finally {
    busy.value = false
  }
}

async function refreshTotal () {
  const NL = plugin()
  if (!NL?.getPlayLog) return null
  try {
    const page = await NL.getPlayLog({ offset: 0, limit: 1 })
    total.value = Number(page?.total || 0)
  } catch { /* ignorado */ }
  return total.value
}

async function clearPlayLog () {
  const NL = plugin()
  if (!NL?.clearPlayLog) return
  await NL.clearPlayLog()
  total.value = 0
}

export function usePlayLog () {
  return {
    busy,
    total,
    fundidoMedir,
    fundidoCompartir,
    exportPlayLog,
    refreshTotal,
    clearPlayLog,
    leerAjustesFundido,
    setFundidoMedir: (valor) => guardarAjustesFundido({ medir: !!valor }),
    setFundidoCompartir: (valor) => guardarAjustesFundido({ compartir: !!valor })
  }
}
