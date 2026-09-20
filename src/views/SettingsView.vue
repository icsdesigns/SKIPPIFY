<template>
  <div class="sk-stagger space-y-5">

    <!-- ── Permisos del sistema ───────────────────────────────────────────── -->
    <section
      data-tour="permissions-required"
      class="overflow-hidden sk-card"
    >
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18] text-base">🛡️</span>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-white">Permisos del sistema</h2>
          <p class="text-[11px] text-slate-400">Sin ellos Skippify no puede ver lo que suena en Spotify.</p>
        </div>
        <span
          class="sk-badge ml-auto"
          :class="allPermissionsGranted ? 'sk-badge-ok' : 'sk-badge-warn'"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="allPermissionsGranted ? 'bg-brand-400' : 'bg-amber-300'" />
          {{ grantedCount }} / {{ orderedPermissionCards.length }}
        </span>
      </header>

      <div class="space-y-2.5 p-5">
        <article
          v-for="card in orderedPermissionCards"
          :key="card.id"
          class="rounded-card border-l-4 bg-white/[0.04] p-3.5 transition-colors duration-200"
          :class="card.granted ? 'border-brand-400' : 'border-amber-400'"
        >
          <div class="flex items-start gap-2.5">
            <span class="pt-0.5 text-base leading-none" aria-hidden="true">{{ card.icon }}</span>

            <div class="min-w-0 flex-1">
              <!-- `anywhere` sólo aquí: uno de estos títulos lleva el
                   identificador del permiso de Android (POST_NOTIFICATIONS),
                   una única palabra de 147 px que a 320 px no cabe de ninguna
                   forma. Partir un identificador es lo correcto; lo que no vale
                   es que ensanche la tarjeta. -->
              <p class="text-sm font-bold leading-tight text-white [overflow-wrap:anywhere]">{{ card.title }}</p>
              <span
                class="sk-badge mt-1.5"
                :class="card.granted ? 'sk-badge-ok' : 'sk-badge-warn'"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="card.granted ? 'bg-brand-400' : 'bg-amber-300'" />
                {{ card.granted ? 'Concedido' : 'No concedido' }}
              </span>
            </div>

            <button
              class="sk-btn sk-btn-ghost shrink-0 px-2 py-1 text-[11px]"
              type="button"
              :aria-expanded="expandedPermissionId === card.id"
              @click="togglePermissionInfo(card.id)"
            >
              ℹ️
            </button>
          </div>

          <div v-if="!card.granted && isCapacitor" class="mt-3">
            <button
              class="sk-btn sk-btn-sm w-full bg-amber-400/[0.18] text-amber-100 hover:bg-amber-400/30 sm:w-auto"
              :disabled="checkingPermissions"
              @click="activarPermiso(card.id)"
            >
              {{ checkingPermissions
                ? 'Verificando…'
                : (permisoIntentado(card.id) ? 'Reintentar' : card.actionLabel) }}
            </button>
          </div>

          <!-- Instrucciones manuales: sólo tras pulsar el botón y seguir sin
               concederse. Android puede negarse a abrir el ajuste, o dejar de
               preguntar tras dos negativas; hasta ahora, en esos casos el botón
               parecía no hacer nada. -->
          <p
            v-if="ayudaManual(card.id, card.granted)"
            class="mt-3 rounded-md bg-amber-400/[0.14] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100"
          >
            ✋ {{ ayudaManual(card.id, card.granted) }}
          </p>

          <div v-if="expandedPermissionId === card.id" class="sk-well mt-2.5 px-3 py-2.5">
            <p class="text-[11px] leading-relaxed text-slate-400">{{ card.description }}</p>
            <p class="mt-1 text-[11px] text-slate-500">{{ card.meta }}</p>
          </div>
        </article>

        <p
          v-if="notifError"
          class="rounded-card bg-rose-500/[0.16] px-3.5 py-2.5 text-xs text-rose-200"
        >
          Error al verificar permisos: {{ notifError }}
        </p>
      </div>
    </section>

    <!-- ── Respaldo ───────────────────────────────────────────────────────── -->
    <section class="overflow-hidden sk-card">
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400/[0.18] text-base">💾</span>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-white">Historial y estadísticas</h2>
          <p class="text-[11px] text-slate-400">Exporta o importa tus canciones junto con la configuración.</p>
        </div>
        <span class="ml-auto sk-badge bg-sky-400/[0.18] text-sky-200">
          Datos locales
        </span>
      </header>

      <div class="space-y-3.5 p-5">
        <div class="flex flex-wrap gap-2">
          <button
            class="sk-btn sk-btn-primary sk-btn-sm"
            @click="exportBackup"
          >
            Exportar respaldo
          </button>

          <button
            class="sk-btn sk-btn-sm bg-sky-400/[0.18] text-sky-100 hover:bg-sky-400/30"
            @click="triggerImport"
          >
            Importar respaldo
          </button>

          <input
            ref="importInputRef"
            type="file"
            accept="application/json,.json"
            class="hidden"
            @change="onImportFileChange"
          >

        </div>

        <div v-if="backupPreview" class="sk-well p-3.5 text-xs text-slate-300">
          <p class="mb-2 flex items-center gap-2 font-bold text-white">
            <span class="h-1.5 w-1.5 rounded-full bg-sky-400" />Vista previa de importación
          </p>
          <p>Canciones válidas: {{ backupPreview.totalTracks }}</p>
          <p>Artistas únicos: {{ backupPreview.uniqueArtists }}</p>
          <p>Canciones únicas: {{ backupPreview.uniqueTracks }}</p>
          <p>Rango: {{ backupPreview.rangeLabel }}</p>
          <p class="mt-2 text-slate-500">Esquema: {{ backupPreview.schema }} · Versión: {{ backupPreview.version }}</p>

          <!--
            La importación SIEMPRE reemplaza. Fusionar dejaba un historial mezcla
            de dos dispositivos con escuchas solapadas que ninguna estadística
            sabía interpretar, así que se avisa de lo que va a pasar y ya está.
          -->
          <p class="mt-3 block rounded-md bg-amber-400/[0.14] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100">
            <span class="font-semibold">Se reemplazará tu historial.</span>
            Las {{ currentTrackCount }} canciones que tienes ahora se sustituyen por las
            {{ backupPreview.totalTracks }} del respaldo. No se puede deshacer: exporta antes
            si quieres conservarlas.
          </p>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="sk-btn sk-btn-primary sk-btn-sm"
              @click="applyPendingImport"
            >
              Reemplazar historial
            </button>
            <button
              class="sk-btn sk-btn-ghost sk-btn-sm"
              @click="clearPendingImport"
            >
              Cancelar
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <p v-if="backupMessage" class="text-[11px] font-semibold text-brand-400">{{ backupMessage }}</p>
          <p v-if="backupWarning" class="text-[11px] text-amber-300">{{ backupWarning }}</p>
          <p v-if="backupError" class="text-[11px] text-rose-200">{{ backupError }}</p>
        </div>
      </div>
    </section>

    <!-- ── Parámetros de la app ───────────────────────────────────────────── -->
    <!--
      La comprobación automática al arrancar es silenciosa a propósito: sin
      cobertura no debe dar la lata. El precio es que un fallo real se ve igual
      que «no hay nada nuevo», así que aquí sí se enseña lo que ocurre.
    -->
    <section class="overflow-hidden sk-card">
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400/[0.18] text-base">⬆️</span>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-white">Actualizaciones</h2>
          <p class="text-[11px] text-slate-400">Se comprueba sola al abrir la app.</p>
        </div>
      </header>

      <div class="p-5">
        <div class="mb-3 flex items-center justify-between gap-3 sk-well px-3.5 py-2.5">
          <span class="text-xs text-slate-300">Versión instalada</span>
          <span class="font-mono text-sm font-bold text-brand-400">{{ installedVersionLabel }}</span>
        </div>

        <button
          class="sk-btn sk-btn-primary w-full"
          :disabled="updateBusy"
          @click="checkForUpdates"
        >
          {{ updateBusy ? 'Comprobando…' : 'Buscar actualizaciones' }}
        </button>

        <p
          v-if="updateCheckMessage"
          class="mt-3 rounded-card px-3 py-2.5 text-xs"
          :class="updateCheckFailed
            ? 'bg-rose-500/[0.16] text-rose-100'
            : 'bg-brand-400/[0.14] text-brand-100'"
        >{{ updateCheckMessage }}</p>

        <p v-if="!isCapacitor" class="mt-3 text-[11px] text-slate-500">
          Sólo disponible en la app instalada; en el navegador no hay nada que actualizar.
        </p>
      </div>
    </section>

    <section class="overflow-hidden sk-card">
      <header class="sk-card-head">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-400/[0.18] text-base">⚙️</span>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-white">Umbrales de esta versión</h2>
          <p class="text-[11px] text-slate-400">Cuánto tiene que sonar una canción para contar.</p>
        </div>
      </header>

      <div class="p-5">
        <div class="sk-well divide-y divide-white/[0.06] overflow-hidden">
          <div
            v-for="row in runtimeRows"
            :key="row.label"
            class="flex items-center justify-between gap-3 px-3.5 py-2.5"
          >
            <span class="text-xs text-slate-300">{{ row.label }}</span>
            <span class="font-mono text-sm font-bold text-brand-400">{{ row.value }}</span>
          </div>
        </div>
        <p class="mt-2.5 text-[11px] text-slate-500">Firma de app: {{ APP_SIGNATURE }}</p>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { useNotifListener } from '@/composables/useNotifListener'
import { useEventStore } from '@/stores/events'
import { useFeatures, sanitizeListeningMode, sanitizeSkipInterval } from '@/composables/useFeatures'
import { useAppUpdate } from '@/composables/useAppUpdate'
import {
  REGISTER_DUPLICATE_PROGRESS_RATIO,
  REGISTER_NEW_SONG_PROGRESS_RATIO,
  REGISTER_LISTEN_TIME_PROGRESS_RATIO
} from '@/config/appThresholds'

const {
  notifEnabled,
  notifError,
  isCapacitor,
  recheckPermission,
  postNotifGranted,
  batteryOptimizationIgnored,
  refreshSystemPermissions,
  activarPermiso,
  permisoIntentado,
  ayudaManual
} = useNotifListener()

const eventStore = useEventStore()
const { state: featureState, importPlaysToNativeHistory } = useFeatures()
const importInputRef = ref(null)
const backupPreview = ref(null)
const pendingImportPayload = ref(null)
const backupMessage = ref('')
const backupWarning = ref('')
const backupError = ref('')
const expandedPermissionId = ref(null)
/** Lo que hay guardado ahora mismo: es lo que la importación va a sustituir. */
const currentTrackCount = computed(() => eventStore.state.events.length)
const APP_VERSION = __APP_VERSION__
const APP_SIGNATURE = `Skippify ${APP_VERSION}`

// ── Actualizaciones ─────────────────────────────────────────────────────────
const appUpdate = useAppUpdate()
const updateBusy = ref(false)
const updateCheckMessage = ref('')
const updateCheckFailed = ref(false)

/**
 * Versión instalada. Se prefiere la que informa el propio Android, porque es la
 * que de verdad manda al decidir si una release es más nueva; `__APP_VERSION__`
 * es sólo la etiqueta que se incrustó al compilar el bundle web.
 */
const installedVersionLabel = computed(() => {
  const native = appUpdate.current.value
  if (native?.versionName) return `${native.versionName} · build ${native.versionCode}`
  return APP_VERSION
})

/**
 * Comprobación a petición del usuario.
 *
 * A diferencia de la automática del arranque, ésta SÍ cuenta lo que pasa: la
 * silenciosa llegó a ocultar durante toda una versión que las peticiones se
 * estaban cancelando por CORS, y desde fuera era idéntico a «no hay novedades».
 */
async function checkForUpdates () {
  updateBusy.value = true
  updateCheckMessage.value = ''
  updateCheckFailed.value = false

  try {
    if (!isCapacitor.value) {
      updateCheckMessage.value = 'En el navegador no hay ninguna APK que actualizar.'
      return
    }

    const hayNovedad = await appUpdate.check({ manual: true })

    if (hayNovedad) {
      const nueva = appUpdate.latest.value
      // El aviso de App.vue aparece solo al detectarla; aquí basta con decirlo.
      updateCheckMessage.value = `Disponible Skippify ${nueva.version} (build ${nueva.versionCode}).`
      return
    }

    if (appUpdate.error.value) {
      updateCheckFailed.value = true
      updateCheckMessage.value = `No se pudo comprobar: ${appUpdate.error.value}`
      return
    }

    updateCheckMessage.value = 'Ya tienes la última versión publicada.'
  } finally {
    updateBusy.value = false
  }
}

const FEATURES_STORAGE_KEY = 'skippify-features'
const CUSTOM_SKIP_CONFIG_KEY = 'skippify-features-custom-skip'
const BACKUP_SCHEMA = 'skippify-backup-v1'
const BACKUP_VERSION = 1
const SUPPORTED_SCHEMAS = new Set([BACKUP_SCHEMA])

const checkingPermissions = ref(false)

const orderedPermissionCards = computed(() => [
  {
    id: 'notif-access',
    icon: '🔔',
    title: 'Acceso a notificaciones',
    description: 'Permite detectar automáticamente las canciones reproducidas en Spotify mediante NotificationListenerService.',
    meta: 'Requerido · Todas las versiones de Android',
    granted: notifEnabled.value,
    actionLabel: 'Activar permiso'
  },
  {
    id: 'post-notifications',
    icon: '📬',
    title: 'Permiso POST_NOTIFICATIONS',
    description: 'Necesario para mostrar notificaciones y mantener operativo el servicio de detección en primer plano.',
    meta: 'Requerido en Android 13+ (API 33)',
    granted: postNotifGranted.value,
    actionLabel: 'Solicitar permiso'
  },
  {
    id: 'battery',
    icon: '🔋',
    title: 'Optimización de batería',
    description: 'Excluir Skippify evita pausas agresivas del sistema y mejora la captura cuando la app está en segundo plano.',
    meta: 'Recomendado · Android 6+ · Crítico en capas OEM restrictivas',
    granted: batteryOptimizationIgnored.value,
    actionLabel: 'Excluir de optimización'
  }
])

const grantedCount = computed(() => orderedPermissionCards.value.filter(card => card.granted).length)
const allPermissionsGranted = computed(() => grantedCount.value === orderedPermissionCards.value.length)

const runtimeRows = computed(() => [
  { label: 'Escucha mínima para registrar nueva canción', value: formatPercent(REGISTER_NEW_SONG_PROGRESS_RATIO) },
  { label: 'Escucha mínima para registrar tiempo escuchado', value: formatPercent(REGISTER_LISTEN_TIME_PROGRESS_RATIO) },
  { label: 'Escucha mínima para registrar canción como duplicada', value: formatPercent(REGISTER_DUPLICATE_PROGRESS_RATIO) }
])

function formatPercent (ratio) {
  const numeric = Number(ratio)
  if (!Number.isFinite(numeric)) return 'N/A'
  return `${Math.round(numeric * 100)}%`
}

function togglePermissionInfo (cardId) {
  expandedPermissionId.value = expandedPermissionId.value === cardId ? null : cardId
}

/**
 * Relee el estado de los tres permisos. La activación en sí vive en
 * `useNotifListener`, compartida con la guía rápida: tenerla por duplicado ya
 * había hecho que sólo el permiso de batería explicara qué hacer al fallar.
 */
async function refreshAllStatuses () {
  if (!isCapacitor.value || checkingPermissions.value) return
  checkingPermissions.value = true
  try {
    await recheckPermission()
    await refreshSystemPermissions()
  } finally {
    checkingPermissions.value = false
  }
}

function summarizeStats (events) {
  const totalTracks = events.length
  const totalMsPlayed = events.reduce((acc, item) => acc + Number(item?.ms_played || 0), 0)
  const uniqueTracks = new Set(events.map(item => `${item?.track || ''}|${item?.artist || ''}`)).size
  const uniqueArtists = new Set(events.map(item => `${item?.artist || ''}`)).size
  return {
    totalTracks,
    uniqueTracks,
    uniqueArtists,
    totalMsPlayed
  }
}

function stableStringify (value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  const body = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')
  return `{${body}}`
}

function fnv1a32 (input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function computeChecksum (data) {
  return fnv1a32(stableStringify(data))
}

function formatDateLabel (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'N/A'
  return d.toLocaleString()
}

function createPreview (events, meta = {}) {
  const sorted = [...events].sort((a, b) => new Date(a.played_at) - new Date(b.played_at))
  const first = sorted[0]?.played_at || null
  const last = sorted[sorted.length - 1]?.played_at || null
  return {
    totalTracks: events.length,
    uniqueTracks: new Set(events.map(item => `${item.track}|${item.artist}`)).size,
    uniqueArtists: new Set(events.map(item => item.artist)).size,
    rangeLabel: first && last ? `${formatDateLabel(first)} -> ${formatDateLabel(last)}` : 'Sin rango válido',
    schema: meta.schema || BACKUP_SCHEMA,
    version: Number(meta.version || 1)
  }
}

function buildBackupPayload () {
  const events = [...eventStore.state.events]
  let customSkipConfig = {}
  try {
    customSkipConfig = JSON.parse(localStorage.getItem(CUSTOM_SKIP_CONFIG_KEY) || '{}')
  } catch {
    customSkipConfig = {}
  }

  const data = {
    events,
    features: { ...featureState },
    customSkipConfig,
    statsSummary: summarizeStats(events)
  }

  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    checksum: {
      algorithm: 'fnv1a-32',
      value: computeChecksum(data)
    },
    data
  }
}

async function exportBackup () {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''

  try {
    const payload = buildBackupPayload()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `skippify-backup-${stamp}.json`
    const payloadJson = JSON.stringify(payload, null, 2)

    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(payloadJson)
        await writable.close()

        backupMessage.value = `Respaldo exportado en ${dirHandle.name}/${fileName} (${payload.data.events.length} canciones).`
        return
      } catch (pickerError) {
        if (pickerError?.name === 'AbortError' || pickerError?.name === 'SecurityError') {
          backupWarning.value = 'No se pudo usar el selector de carpeta. Se usó una exportación automática.'
        } else {
          throw pickerError
        }
      }
    }

    if (isCapacitor.value && Capacitor.isNativePlatform()) {
      const defaultDir = 'Skippify/backups'
      const defaultPath = `${defaultDir}/${fileName}`
      await Filesystem.mkdir({
        path: defaultDir,
        directory: Directory.Documents,
        recursive: true
      })
      await Filesystem.writeFile({
        path: defaultPath,
        data: payloadJson,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })
      backupMessage.value = `Respaldo autoexportado en Documents/${defaultPath} (${payload.data.events.length} canciones).`
      backupWarning.value = backupWarning.value || 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este dispositivo.'
      return
    }

    const blob = new Blob([payloadJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    backupMessage.value = `Respaldo autoexportado en Descargas como ${fileName} (${payload.data.events.length} canciones).`
    backupWarning.value = backupWarning.value || 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este navegador.'
  } catch (error) {
    const detail = (error?.message || '').toString().trim()
    backupError.value = detail
      ? `No se pudo exportar el respaldo: ${detail}`
      : 'No se pudo exportar el respaldo.'
  }
}

function triggerImport () {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''
  clearPendingImport(false)
  if (importInputRef.value) {
    importInputRef.value.value = ''
    importInputRef.value.click()
  }
}

function clearPendingImport (clearInput = true) {
  backupPreview.value = null
  pendingImportPayload.value = null
  if (clearInput && importInputRef.value) importInputRef.value.value = ''
}

function sanitizeImportedEvents (items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const normalized = []

  for (const event of items) {
    const playedAt = (event?.played_at || '').toString()
    const track = (event?.track || '').toString().trim()
    const artist = (event?.artist || '').toString().trim()
    if (!playedAt || !track || !artist) continue
    if (!Number.isFinite(Date.parse(playedAt))) continue

    const key = `${playedAt}|${track}|${artist}`
    if (seen.has(key)) continue
    seen.add(key)

    normalized.push({
      played_at: playedAt,
      track,
      artist,
      album: (event?.album || '').toString(),
      duration_ms: Math.max(0, Number(event?.duration_ms || 0) || 0),
      ms_played: Math.max(0, Number(event?.ms_played || 0) || 0),
      genres: Array.isArray(event?.genres) ? event.genres : [],
      source: (event?.source || '').toString(),
      reason: (event?.reason || '').toString(),
      // Se perdía al importar y provocaba eventos duplicados al reanudar una
      // canción pausada tras restaurar un respaldo.
      resume_anchor_ms: Math.max(0, Number(event?.resume_anchor_ms || 0) || 0)
    })
  }

  normalized.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  return normalized
}

function applyImportedFeatures (incoming) {
  if (!incoming || typeof incoming !== 'object') return
  // Antes se copiaban los valores del fichero tal cual: un respaldo manipulado o
  // de una versión antigua podía dejar `listeningMode`/intervalo con valores
  // inválidos y romper las vistas Modos y Funcionalidades.
  if (typeof incoming.listeningMode === 'string') {
    featureState.listeningMode = sanitizeListeningMode(incoming.listeningMode)
  }
  if (typeof incoming.skipDuplicates === 'boolean') featureState.skipDuplicates = incoming.skipDuplicates
  if (typeof incoming.skipDuplicatesInterval === 'string') {
    featureState.skipDuplicatesInterval = sanitizeSkipInterval(incoming.skipDuplicatesInterval)
  }
  if (typeof incoming.silenceAds === 'boolean') featureState.silenceAds = incoming.silenceAds
  if (Array.isArray(incoming.silenceAdsKeywords)) {
    const keywords = incoming.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    for (const kw of ['publicidad', 'anuncio', 'anuncios']) {
      if (!keywords.includes(kw)) keywords.push(kw)
    }
    featureState.silenceAdsKeywords = keywords
  }
}

async function onImportFileChange (ev) {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''
  clearPendingImport(false)

  const file = ev?.target?.files?.[0]
  if (!file) return

  try {
    const content = await file.text()
    const parsed = JSON.parse(content)

    const schema = (parsed?.schema || '').toString()
    const version = Number(parsed?.version ?? 1)
    if (!SUPPORTED_SCHEMAS.has(schema)) {
      backupError.value = 'Esquema de respaldo no compatible.'
      return
    }
    if (!Number.isFinite(version) || version < 1 || version > BACKUP_VERSION) {
      backupError.value = 'Versión de respaldo no compatible con esta app.'
      return
    }

    const checksumBlock = parsed?.checksum
    if (checksumBlock?.algorithm === 'fnv1a-32' && typeof checksumBlock?.value === 'string') {
      const expected = computeChecksum(parsed?.data || {})
      if (checksumBlock.value !== expected) {
        backupError.value = 'Checksum inválido: el archivo parece corrupto o fue modificado.'
        return
      }
    } else {
      backupWarning.value = 'El respaldo no incluye checksum verificable. Se importará bajo tu responsabilidad.'
    }

    const candidateEvents = parsed?.data?.events ?? parsed?.events
    const sanitizedEvents = sanitizeImportedEvents(candidateEvents)
    if (!sanitizedEvents.length) {
      backupError.value = 'El archivo no contiene canciones válidas para importar.'
      return
    }

    const importedFeatures = parsed?.data?.features ?? parsed?.features
    const importedCustomSkip = parsed?.data?.customSkipConfig ?? parsed?.customSkipConfig

    pendingImportPayload.value = {
      events: sanitizedEvents,
      importedFeatures,
      importedCustomSkip,
      schema,
      version
    }
    backupPreview.value = createPreview(sanitizedEvents, { schema, version })
    backupMessage.value = `Archivo validado. Revisa la vista previa y confirma la importación (${sanitizedEvents.length} canciones).`
  } catch {
    backupError.value = 'No se pudo importar el archivo. Verifica que sea un JSON válido de Skippify.'
  }
}

async function applyPendingImport () {
  backupError.value = ''
  backupMessage.value = ''
  const payload = pendingImportPayload.value
  if (!payload) return

  const importedEvents = payload.events
  const nextEvents = importedEvents

  eventStore.setEvents(nextEvents)

  if (payload.importedFeatures && typeof payload.importedFeatures === 'object') {
    applyImportedFeatures(payload.importedFeatures)
    try { localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify({ ...featureState })) } catch { /* ignored */ }
  }

  if (payload.importedCustomSkip && typeof payload.importedCustomSkip === 'object') {
    try { localStorage.setItem(CUSTOM_SKIP_CONFIG_KEY, JSON.stringify(payload.importedCustomSkip)) } catch { /* ignored */ }
  }

  const resumen = `Historial reemplazado: ${nextEvents.length} canciones importadas.`
  backupMessage.value = resumen
  clearPendingImport()

  // El motor de duplicadas decide contra su propia base de datos nativa, no
  // contra este almacén: las escuchas importadas hay que sembrárselas aparte.
  // Sin esto aparecían en las estadísticas pero no se saltaban nunca.
  const sembradas = await importPlaysToNativeHistory(importedEvents)
  if (sembradas > 0) {
    backupMessage.value = `${resumen} ${sembradas} escuchas añadidas al historial de duplicadas.`
  }
}

function onAppVisibleAgain () {
  if (document.visibilityState === 'visible') {
    refreshAllStatuses()
  }
}

onMounted(async () => {
  await refreshAllStatuses()
  window.addEventListener('focus', refreshAllStatuses)
  document.addEventListener('visibilitychange', onAppVisibleAgain)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshAllStatuses)
  document.removeEventListener('visibilitychange', onAppVisibleAgain)
})
</script>
