/**
 * useAppUpdate — comprueba si hay una APK más nueva publicada como release de
 * GitHub, la descarga y lanza el instalador del sistema.
 *
 * SINGLETON: el estado es de módulo, igual que en `useNotifListener`, para que
 * el aviso salga una sola vez aunque lo monten varios componentes.
 *
 * El flujo completo es: Actions compila la APK al hacer push → la publica como
 * release → esto la encuentra al abrir la app → la descarga en segundo plano →
 * el usuario confirma la instalación. Android no permite instalar en silencio a
 * una app normal, así que ese último toque es inevitable.
 */
import { ref, computed } from 'vue'

const REPO = 'icsdesigns/SKIPPIFY'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`

/** Versión ignorada por el usuario, para no repetir el aviso en cada arranque. */
const SKIPPED_KEY = 'skippify.update.skipped'

// ── Estado compartido ─────────────────────────────────────────────────────────
// idle | checking | available | downloading | ready | installing | error
const status = ref('idle')
const latest = ref(null)      // { version, versionCode, url, fileName, notes, size }
const current = ref(null)     // { versionName, versionCode, canInstall }
const progress = ref(0)
const error = ref('')
const downloadedPath = ref('')
const dismissed = ref(false)

let _initialized = false
let _progressListener = null

function plugin () {
  return window.Capacitor?.Plugins?.Updater || null
}

/**
 * Etiqueta de release: `v<versionName>-b<versionCode>`, tal y como la compone
 * .github/workflows/release-apk.yml.
 *
 * El versionCode salía antes del `latest.json` que se publica junto a la APK,
 * pero esa lectura NO funciona desde la app: la URL de descarga de un asset
 * redirige a release-assets.githubusercontent.com, que no envía
 * `Access-Control-Allow-Origin`, así que la WebView bloqueaba el `fetch` por
 * CORS. La respuesta de la API sí trae la cabecera, y ahí ya viene la etiqueta.
 *
 * (El `latest.json` se sigue publicando: es útil para inspeccionar una release
 * desde fuera, pero la app ya no depende de él.)
 */
const TAG_PATTERN = /^v(.+)-b(\d+)$/

const updateAvailable = computed(() => {
  if (dismissed.value) return false
  if (!latest.value || !current.value) return false
  return latest.value.versionCode > current.value.versionCode
})

/** Sólo se anuncia lo que el usuario no haya descartado ya. */
const shouldPrompt = computed(() =>
  // 'installing' entra en la lista a propósito: si el usuario cancela el
  // diálogo del sistema, el aviso sigue ahí para poder reintentar.
  updateAvailable.value && ['available', 'downloading', 'ready', 'installing', 'error'].includes(status.value)
)

async function readCurrentVersion () {
  const updater = plugin()
  if (!updater) return null
  try {
    current.value = await updater.getStatus()
    return current.value
  } catch (e) {
    error.value = `No se pudo leer la versión instalada: ${e?.message || e}`
    return null
  }
}

/**
 * Busca la última release. Silencioso por diseño: si no hay red, el repo es
 * privado o GitHub responde con un 403 por límite de peticiones, la app sigue
 * funcionando exactamente igual y simplemente no se ofrece actualización.
 */
async function check ({ manual = false } = {}) {
  if (!plugin()) return false          // navegador o build web: nada que hacer
  if (status.value === 'downloading') return false

  status.value = 'checking'
  error.value = ''

  if (!current.value && !(await readCurrentVersion())) {
    status.value = 'idle'
    return false
  }

  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) throw new Error(`GitHub respondió ${response.status}`)

    const release = await response.json()
    const assets = release.assets || []

    const apk = assets.find(asset => asset.name?.endsWith('.apk'))
    if (!apk) throw new Error('La release no incluye ninguna APK')

    const tag = String(release.tag_name || '')
    const parsedTag = TAG_PATTERN.exec(tag)
    if (!parsedTag) throw new Error(`Etiqueta de release inesperada: ${tag || '(vacía)'}`)

    latest.value = {
      version: parsedTag[1],
      versionCode: Number(parsedTag[2]) || 0,
      url: apk.browser_download_url,
      fileName: apk.name,
      size: apk.size || 0,
      notes: release.body || ''
    }

    // Un descarte sólo vale para esa build concreta: en cuanto se publique otra
    // el aviso vuelve a aparecer. Se guarda el versionCode y no el nombre de
    // versión, que se repite entre builds de la misma release.
    const skipped = localStorage.getItem(SKIPPED_KEY)
    dismissed.value = !manual && skipped === String(latest.value.versionCode)

    status.value = updateAvailable.value ? 'available' : 'idle'
    return updateAvailable.value
  } catch (e) {
    error.value = e?.message || String(e)
    status.value = manual ? 'error' : 'idle'
    return false
  }
}

async function download () {
  const updater = plugin()
  if (!updater || !latest.value) return false

  status.value = 'downloading'
  progress.value = 0
  error.value = ''

  try {
    const result = await updater.download({
      url: latest.value.url,
      fileName: latest.value.fileName
    })
    downloadedPath.value = result?.path || ''
    progress.value = 100
    status.value = 'ready'
    return true
  } catch (e) {
    error.value = `Fallo la descarga: ${e?.message || e}`
    status.value = 'error'
    return false
  }
}

async function install () {
  const updater = plugin()
  if (!updater || !downloadedPath.value) return false

  try {
    status.value = 'installing'
    await updater.install({ path: downloadedPath.value })
    // Si el usuario confirma, el proceso muere aquí y vuelve ya actualizado.
    return true
  } catch (e) {
    if (e?.code === 'SIN_PERMISO_INSTALACION') {
      // No es un error real: falta el permiso de "apps desconocidas" y la UI
      // ofrece el atajo a los ajustes correspondientes.
      status.value = 'ready'
      error.value = 'PERMISO'
      return false
    }
    error.value = `No se pudo instalar: ${e?.message || e}`
    status.value = 'error'
    return false
  }
}

/** Descarga e instala de un tirón: es lo que hace el botón "Actualizar". */
async function downloadAndInstall () {
  const ok = await download()
  if (!ok) return false
  return install()
}

/**
 * Relee si ya se puede instalar, para usar al volver de los ajustes del sistema.
 *
 * El permiso de «apps desconocidas» se concede fuera de la app, así que nada
 * dentro avisa de que ha cambiado: sin esta relectura el aviso se quedaría
 * ofreciendo «Conceder permiso» indefinidamente, aunque ya estuviera dado.
 */
async function recheckInstallPermission () {
  if (error.value !== 'PERMISO') return false

  const updater = plugin()
  if (!updater) return false

  try {
    const info = await updater.getStatus()
    current.value = info
    if (!info?.canInstall) return false

    error.value = ''
    // La APK sigue descargada de antes: se vuelve a ofrecer instalarla.
    status.value = downloadedPath.value ? 'ready' : 'available'
    return true
  } catch {
    return false
  }
}

async function openInstallSettings () {
  const updater = plugin()
  if (!updater) return
  try {
    await updater.openInstallSettings()
  } catch (e) {
    error.value = `No se pudieron abrir los ajustes: ${e?.message || e}`
  }
}

function dismiss () {
  if (latest.value?.versionCode) {
    localStorage.setItem(SKIPPED_KEY, String(latest.value.versionCode))
  }
  dismissed.value = true
  status.value = 'idle'
}

export function useAppUpdate () {
  async function initialize () {
    if (_initialized) return
    _initialized = true

    const updater = plugin()
    if (!updater) return

    if (!_progressListener) {
      _progressListener = await updater.addListener('downloadProgress', event => {
        progress.value = event?.percent ?? 0
      })
    }

    await check()
  }

  return {
    status,
    latest,
    current,
    progress,
    error,
    dismissed,
    updateAvailable,
    shouldPrompt,
    initialize,
    check,
    download,
    install,
    downloadAndInstall,
    openInstallSettings,
    recheckInstallPermission,
    dismiss
  }
}
