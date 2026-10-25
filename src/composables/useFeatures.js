/**
 * useFeatures — persists user-configurable feature toggles in localStorage.
 * Add new features here; the FeaturesView renders them automatically.
 */
import { nextTick, reactive, watch } from 'vue'

const STORAGE_KEY = 'skippify-features'
const CUSTOM_SKIP_CONFIG_KEY = 'skippify-features-custom-skip'

const FEATURE_DEFAULTS = {
  listeningMode: 'custom',
  /**
   * ¿Ha elegido el usuario un modo alguna vez? `listeningMode` siempre tiene
   * valor —el de por defecto—, así que no distingue «elegido» de «nunca
   * tocado»; la guía rápida necesita esa diferencia para obligar a escoger
   * uno en el primer recorrido.
   */
  listeningModeChosen: false,
  skipDuplicates: true,
  skipDuplicatesInterval: '1w',
  silenceAds: false,
  silenceAdsKeywords: ['publicidad', 'anuncio', 'anuncios']
}

const CUSTOM_SKIP_DEFAULTS = {
  skipDuplicates: true,
  skipDuplicatesInterval: '1w'
}

const VALID_LISTENING_MODES = ['discovery', 'casual', 'custom']
// Debe coincidir con las opciones de FeaturesView + el preset de Descubrimiento.
const VALID_SKIP_INTERVALS = ['1h', '1d', '1w', '2w', '1m', '3m', '6m', '1y']

export function sanitizeListeningMode (mode) {
  const raw = (mode ?? '').toString().trim().toLowerCase()
  return VALID_LISTENING_MODES.includes(raw) ? raw : 'custom'
}

export function sanitizeSkipInterval (interval) {
  const raw = (interval ?? '').toString().trim().toLowerCase()
  return VALID_SKIP_INTERVALS.includes(raw) ? raw : '1w'
}

function load () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...FEATURE_DEFAULTS }
    const parsed = JSON.parse(raw)
    const next = { ...FEATURE_DEFAULTS, ...parsed }
    next.listeningMode = sanitizeListeningMode(next.listeningMode)
    next.listeningModeChosen = !!next.listeningModeChosen
    next.skipDuplicatesInterval = sanitizeSkipInterval(next.skipDuplicatesInterval)
    // Backward compatibility: migrate legacy `skipAds` to `silenceAds`.
    if (typeof next.silenceAds !== 'boolean' && typeof parsed?.skipAds === 'boolean') {
      next.silenceAds = !!parsed.skipAds
    }
    if (!Array.isArray(next.silenceAdsKeywords)) {
      next.silenceAdsKeywords = [...FEATURE_DEFAULTS.silenceAdsKeywords]
    }
    next.silenceAdsKeywords = next.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    for (const kw of FEATURE_DEFAULTS.silenceAdsKeywords) {
      if (!next.silenceAdsKeywords.includes(kw)) next.silenceAdsKeywords.push(kw)
    }
    return next
  } catch {
    return { ...FEATURE_DEFAULTS }
  }
}

function loadCustomSkipConfig (fallbackState) {
  try {
    const raw = localStorage.getItem(CUSTOM_SKIP_CONFIG_KEY)
    if (!raw) {
      return {
        skipDuplicates: !!fallbackState?.skipDuplicates,
        skipDuplicatesInterval: fallbackState?.skipDuplicatesInterval || '1w'
      }
    }
    const parsed = { ...CUSTOM_SKIP_DEFAULTS, ...JSON.parse(raw) }
    parsed.skipDuplicates = !!parsed.skipDuplicates
    parsed.skipDuplicatesInterval = sanitizeSkipInterval(parsed.skipDuplicatesInterval)
    return parsed
  } catch {
    return {
      skipDuplicates: !!fallbackState?.skipDuplicates,
      skipDuplicatesInterval: fallbackState?.skipDuplicatesInterval || '1w'
    }
  }
}

const loadedState = load()
const state = reactive(loadedState)
const customSkipConfig = reactive(loadCustomSkipConfig(loadedState))
let nativeSyncReady = false
let applyingNativeConfig = false

function applyListeningModePreset (mode) {
  if (mode === 'discovery') {
    state.skipDuplicates = true
    state.skipDuplicatesInterval = '1y'
    return
  }

  if (mode === 'casual') {
    state.skipDuplicates = false
    return
  }

  state.skipDuplicates = !!customSkipConfig.skipDuplicates
  state.skipDuplicatesInterval = sanitizeSkipInterval(customSkipConfig.skipDuplicatesInterval)
}

function setListeningMode (mode) {
  if (!VALID_LISTENING_MODES.includes(mode)) return
  if (state.listeningMode === 'custom') {
    customSkipConfig.skipDuplicates = !!state.skipDuplicates
    customSkipConfig.skipDuplicatesInterval = sanitizeSkipInterval(state.skipDuplicatesInterval)
  }
  state.listeningMode = mode
  state.listeningModeChosen = true
  applyListeningModePreset(mode)
}

function isSkipDuplicatesLocked () {
  return state.listeningMode === 'discovery' || state.listeningMode === 'casual'
}

function getSkipDuplicatesLockReason () {
  if (state.listeningMode === 'discovery') {
    return 'El modo Descubrimiento fija esta función en 1 año mientras esté activo.'
  }
  if (state.listeningMode === 'casual') {
    return 'El modo Casual desactiva esta función mientras esté activo.'
  }
  return ''
}

applyListeningModePreset(state.listeningMode)

function getPlugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

/**
 * Lotes de la siembra del historial nativo.
 *
 * Un respaldo de un año son varios miles de escuchas: mandarlas de una sola vez
 * por el puente de Capacitor obliga a serializarlo todo en un único mensaje.
 */
const IMPORT_BATCH_SIZE = 750

/**
 * Vuelca escuchas importadas en el historial de duplicadas del motor nativo.
 *
 * El motor decide contra su propia base de datos y no contra el almacén de
 * JavaScript, así que sin esto una canción restaurada desde un respaldo salía
 * en las estadísticas pero jamás se saltaba.
 *
 * No se filtra por `ms_played`: una escucha sólo se anota si en su día superó
 * el umbral de reproducción, de modo que estar en el respaldo ya lo demuestra.
 * Muchas escuchas legítimas guardan `ms_played = 0` porque se cerraron por
 * debajo del 80 %, y filtrarlas aquí las dejaría fuera sin motivo.
 *
 * @returns {Promise<number>} escuchas nuevas anotadas; 0 en la web.
 */
let lastImportFailed = false

async function importPlaysToNativeHistory (events) {
  lastImportFailed = false
  const plugin = getPlugin()
  if (!plugin?.importDuplicateHistory || !Array.isArray(events)) return 0

  const plays = []
  for (const event of events) {
    const track = (event?.track || '').toString().trim()
    const artist = (event?.artist || '').toString().trim()
    if (!track || !artist) continue

    const playedAt = Date.parse(event?.played_at)
    if (!Number.isFinite(playedAt)) continue

    plays.push({
      track,
      artist,
      playedAt,
      durationMs: Math.max(0, Number(event?.duration_ms || 0) || 0)
    })
  }

  let imported = 0
  for (let i = 0; i < plays.length; i += IMPORT_BATCH_SIZE) {
    const batch = plays.slice(i, i + IMPORT_BATCH_SIZE)
    try {
      const result = await plugin.importDuplicateHistory({ plays: batch })
      imported += Number(result?.imported || 0)
    } catch (e) {
      // Que falle un lote no debe abortar la importación entera: lo que ya se
      // sembró sigue siendo válido y el resto se reintenta en el siguiente lote.
      lastImportFailed = true
      console.warn('[skippify] lote de historial no importado', e)
    }
  }

  return imported
}

const HISTORY_SYNC_KEY = 'skippify-native-history-synced-at'

/**
 * Mantiene el historial del motor al día con el de la app.
 *
 * El motor decide contra su propia base de datos, y ésta sólo se alimentaba con
 * las escuchas que él mismo veía y con los respaldos importados. Todo lo que la
 * app tenía en sus estadísticas y la base no (base reiniciada, escuchas de antes
 * del motor actual, otro dispositivo) salía como «escuchado» en pantalla pero se
 * colaba sin saltarse. Aquí se vuelcan las escuchas posteriores a la última
 * sincronización; si la base nativa está vacía se vuelca todo.
 *
 * @returns {Promise<number>} escuchas nuevas anotadas.
 */
async function syncNativeHistoryFromEvents (events) {
  const plugin = getPlugin()
  if (!plugin?.importDuplicateHistory || !Array.isArray(events) || !events.length) return 0

  let watermark = 0
  try { watermark = Number(localStorage.getItem(HISTORY_SYNC_KEY)) || 0 } catch { /* ignorado */ }

  try {
    const info = await plugin.getPlayLog?.({ offset: 0, limit: 1 })
    if (info?.history && Number(info.history.rows || 0) === 0) watermark = 0
  } catch { /* ignorado */ }

  let newest = watermark
  const pending = []
  for (const event of events) {
    const ms = Date.parse(event?.played_at)
    if (!Number.isFinite(ms) || ms <= watermark) continue
    pending.push(event)
    if (ms > newest) newest = ms
  }
  if (!pending.length) return 0

  const imported = await importPlaysToNativeHistory(pending)
  if (!lastImportFailed) {
    try { localStorage.setItem(HISTORY_SYNC_KEY, String(newest)) } catch { /* ignorado */ }
  }
  return imported
}

function applyNativeFeatureConfig (config = {}) {
  applyingNativeConfig = true

  state.listeningMode = sanitizeListeningMode(config.listeningMode)
  state.skipDuplicates = typeof config.skipDuplicates === 'boolean'
    ? config.skipDuplicates
    : FEATURE_DEFAULTS.skipDuplicates
  state.skipDuplicatesInterval = sanitizeSkipInterval(config.skipDuplicatesInterval)
  state.silenceAds = typeof config.silenceAds === 'boolean'
    ? config.silenceAds
    : FEATURE_DEFAULTS.silenceAds
  state.silenceAdsKeywords = Array.isArray(config.silenceAdsKeywords)
    ? config.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    : [...FEATURE_DEFAULTS.silenceAdsKeywords]
  for (const kw of FEATURE_DEFAULTS.silenceAdsKeywords) {
    if (!state.silenceAdsKeywords.includes(kw)) state.silenceAdsKeywords.push(kw)
  }

  customSkipConfig.skipDuplicates = typeof config.customSkipDuplicates === 'boolean'
    ? config.customSkipDuplicates
    : CUSTOM_SKIP_DEFAULTS.skipDuplicates
  customSkipConfig.skipDuplicatesInterval = sanitizeSkipInterval(config.customSkipDuplicatesInterval)

  // Los watchers de Vue se ejecutan de forma asíncrona (flush 'pre'), así que
  // poner el flag a false aquí mismo no servía de nada: cuando el watcher
  // corría ya era false y se reenviaba al nativo la misma config que acabábamos
  // de recibir (ida y vuelta innecesaria en cada arranque).
  nextTick(() => { applyingNativeConfig = false })
}

async function syncNativeFeatureConfig () {
  if (!nativeSyncReady) return

  const NL = getPlugin()
  try {
    if (NL?.setFeatureConfig) {
      await NL.setFeatureConfig({
        listeningMode: state.listeningMode,
        skipDuplicates: !!state.skipDuplicates,
        skipDuplicatesInterval: sanitizeSkipInterval(state.skipDuplicatesInterval),
        silenceAds: !!state.silenceAds,
        silenceAdsKeywords: Array.isArray(state.silenceAdsKeywords) ? [...state.silenceAdsKeywords] : [...FEATURE_DEFAULTS.silenceAdsKeywords],
        customSkipDuplicates: !!customSkipConfig.skipDuplicates,
        customSkipDuplicatesInterval: sanitizeSkipInterval(customSkipConfig.skipDuplicatesInterval)
      })
      return
    }

    if (NL?.setSkipConfig) {
      await NL.setSkipConfig({
        enabled: !!state.skipDuplicates,
        interval: sanitizeSkipInterval(state.skipDuplicatesInterval)
      })
    }
    if (NL?.setAdsMuteConfig) {
      await NL.setAdsMuteConfig({
        enabled: !!state.silenceAds
      })
    }
    if (NL?.setAdsMuteKeywords) {
      await NL.setAdsMuteKeywords({
        keywords: Array.isArray(state.silenceAdsKeywords) ? [...state.silenceAdsKeywords] : [...FEATURE_DEFAULTS.silenceAdsKeywords]
      })
    }
  } catch { /* ignored */ }
}

async function initializeNativeFeatures () {
  const NL = getPlugin()

  if (!NL) {
    nativeSyncReady = true
    return
  }

  try {
    if (NL.getFeatureConfig) {
      const config = await NL.getFeatureConfig()
      applyNativeFeatureConfig(config)
    }
  } catch { /* ignored */ }

  nativeSyncReady = true
  await syncNativeFeatureConfig()
}

watch(
  () => ({ ...state }),
  (val) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)) } catch { /* ignored */ }
    if (!applyingNativeConfig) {
      syncNativeFeatureConfig()
    }
  },
  { deep: true }
)

watch(
  () => ({ ...customSkipConfig }),
  (val) => {
    try { localStorage.setItem(CUSTOM_SKIP_CONFIG_KEY, JSON.stringify(val)) } catch { /* ignored */ }
    if (!applyingNativeConfig && state.listeningMode === 'custom') {
      syncNativeFeatureConfig()
    }
  },
  { deep: true }
)

watch(
  () => [state.skipDuplicates, state.skipDuplicatesInterval, state.listeningMode],
  ([skipDuplicates, skipDuplicatesInterval, listeningMode]) => {
    if (listeningMode !== 'custom') return
    customSkipConfig.skipDuplicates = !!skipDuplicates
    customSkipConfig.skipDuplicatesInterval = sanitizeSkipInterval(skipDuplicatesInterval)
  }
)

export function useFeatures () {
  return {
    state,
    setListeningMode,
    initializeNativeFeatures,
    applyNativeFeatureConfig,
    isSkipDuplicatesLocked,
    getSkipDuplicatesLockReason,
    importPlaysToNativeHistory,
    syncNativeHistoryFromEvents
  }
}
