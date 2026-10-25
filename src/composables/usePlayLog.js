/**
 * usePlayLog — exporta el registro de reproducciones del motor de saltado.
 *
 * El motor nativo anota una fila por canción que suena: si se saltó o se
 * conservó, el motivo, y los criterios (modo, intervalo) y el calibrado que
 * había en ese momento. Este módulo lo lee por páginas y lo guarda en un JSON
 * junto con un resumen del historial contra el que el motor decide, que es lo
 * que permite averiguar por qué una canción escuchada hace tiempo no se saltó.
 */
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { useEventStore } from '@/stores/events'
import { useFeatures } from '@/composables/useFeatures'

const PAGE_SIZE = 500
const EXPORT_SCHEMA = 'skippify-play-log'
const EXPORT_VERSION = 1

const busy = ref(false)
const total = ref(null)

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

async function saveJson (fileName, text) {
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

/**
 * Lee el registro nativo y lo guarda como fichero.
 * @returns {Promise<{ path: string, rows: number }>}
 */
async function exportPlayLog () {
  const NL = plugin()
  if (!NL?.getPlayLog) {
    throw new Error('El registro de reproducciones sólo existe en la app de Android.')
  }

  busy.value = true
  try {
    const { rows, history } = await loadAllRows(NL)
    total.value = rows.length

    let diagnostics = null
    try { diagnostics = await NL.getDuplicateDiagnostics?.() } catch { /* ignorado */ }

    const { state: featureState } = useFeatures()
    const events = useEventStore().state.events

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
      registro: rows
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const path = await saveJson(`skippify-registro-${stamp}.json`, JSON.stringify(payload, null, 2))
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
  return { busy, total, exportPlayLog, refreshTotal, clearPlayLog }
}
