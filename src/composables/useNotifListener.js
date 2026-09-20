/**
 * useNotifListener — bridges the Capacitor NotifListener plugin (Android)
 * and drains background events on startup.
 *
 * SINGLETON: All components share the same reactive state.
 * Auto-prompts the user on first launch if permission is not granted.
 * Listens for `permissionChanged` events when user returns from settings.
 */
import { computed, reactive, ref } from 'vue'
import { useEventStore } from '@/stores/events'
import { usePlayback } from '@/composables/usePlayback'
import { useFeatures } from '@/composables/useFeatures'
import { REGISTER_LISTEN_TIME_PROGRESS_RATIO } from '@/config/appThresholds'

// ── Shared singleton state ────────────────────────────────────────────────────
const notifEnabled = ref(false)
const notifError = ref('')
const notifChecked = ref(false)
const isCapacitor = ref(false)
const promptDismissed = ref(false)

// Permisos del sistema que no son el acceso a notificaciones. Viven aquí, en el
// singleton, porque el banner de aviso los necesita desde App.vue y antes sólo
// existían dentro de la vista de Configuración.
const postNotifGranted = ref(true)
const batteryOptimizationIgnored = ref(false)
/** `true` en cuanto el nativo ha contestado alguna vez con valores reales. */
const systemPermsChecked = ref(false)

/**
 * Ajustes del sistema que faltan por conceder. Fuera de Capacitor siempre está
 * vacío: en el navegador no hay nada que activar.
 */
const missingSystemSettings = computed(() => {
  if (!isCapacitor.value) return []
  // Cada aviso espera a SU fuente. `batteryOptimizationIgnored` nace en
  // `false`, así que darlo por bueno antes de que el nativo conteste hacía saltar
  // el banner en cada arranque —y al actualizar, que es cuando más se mira—
  // aunque el permiso estuviera concedido.
  const faltan = []
  if (notifChecked.value && !notifEnabled.value) faltan.push('el acceso a notificaciones')
  if (systemPermsChecked.value && !postNotifGranted.value) faltan.push('el permiso para mostrar notificaciones')
  if (systemPermsChecked.value && !batteryOptimizationIgnored.value) faltan.push('la exclusión de optimización de batería')
  return faltan
})

// Controls the first-launch permissions modal.
// True = modal visible. Persisted via localStorage so it only shows once,
// but reappears if permissions are later revoked.
/* ── Activación de permisos y ayuda manual ──────────────────────────────────
 *
 * Pulsar «Activar» no garantiza nada: Android puede negarse a abrir el ajuste,
 * dejar de preguntar por un permiso tras dos negativas, o abrir una pantalla
 * distinta según la capa del fabricante. Hasta ahora eso quedaba en nada —el
 * botón parecía no hacer efecto— salvo en el de batería, que sí explicaba qué
 * hacer a mano, con el texto duplicado en la guía y en Configuración.
 *
 * Aquí vive una sola vez: qué permisos se han intentado, cómo se piden y qué
 * decirle al usuario cuando sigue sin concederse.
 */

/** Permisos en los que el usuario ya ha pulsado «Activar», en esta sesión. */
const permisosIntentados = ref(new Set())

/**
 * Pista concreta devuelta por el lado nativo (por qué pantalla entró, o que no
 * pudo abrir ninguna). Afina el texto por defecto cuando se sabe algo más.
 */
const pistasPermiso = reactive({})

/**
 * Qué hacer a mano con cada permiso. Las rutas varían entre fabricantes, así
 * que se nombra el camino de Android puro y se añade dónde suele estar el
 * mismo ajuste en las capas que lo mueven.
 */
const INSTRUCCIONES_MANUALES = {
  'notif-access': 'Ajustes → Aplicaciones → Acceso especial de aplicaciones → '
    + 'Acceso a notificaciones → activa Skippify. En algunas capas está en '
    + 'Ajustes → Notificaciones → Acceso a notificaciones.',
  'post-notifications': 'Android deja de preguntar tras dos negativas. Actívalo en '
    + 'Ajustes → Aplicaciones → Skippify → Notificaciones → «Permitir notificaciones».',
  battery: 'Ajustes → Batería → Optimización de batería → busca Skippify y marca '
    + '«No optimizar» o «Sin restricciones».'
}

const SEEN_KEY = 'skippify-notif-seen'
const showPermissionsModal = ref(false)

/**
 * Mientras la guía rápida está en pantalla nadie más pide permisos: conceder el
 * acceso a notificaciones saca al usuario de la app y la guía no vuelve. El
 * aviso espera a que la guía llegue a su último paso, que es el de permisos.
 */
const permissionsPromptSuppressed = ref(false)

// Ruta solicitada desde la notificación persistente (acciones de modo). El lado
// nativo ya emitía `openRoute` / exponía `consumePendingOpenRoute`, pero nadie lo
// consumía: pulsar la notificación abría siempre la pantalla de inicio.
const pendingOpenRoute = ref('')

function _updateModalVisibility () {
  if (!isCapacitor.value || !notifChecked.value) return
  if (permissionsPromptSuppressed.value) {
    showPermissionsModal.value = false
    return
  }
  if (notifEnabled.value) {
    // Permissions granted → mark as seen and hide modal
    localStorage.setItem(SEEN_KEY, '1')
    showPermissionsModal.value = false
  } else {
    // Permissions NOT granted → show modal only if not already seen this cycle
    showPermissionsModal.value = !localStorage.getItem(SEEN_KEY)
  }
}

let _initialized = false
let _onNowPlayingCb = null
// Guardas de idempotencia: `setupTrackListener` / `drainEvents` pueden llegar a
// invocarse en paralelo desde `checkAndInit`, desde el evento `permissionChanged`
// y desde `recheckPermission`. Sin estas guardas se registraban varios listeners
// `spotifyTrack` y cada notificación de Spotify se procesaba (y contaba) 2 veces.
let _trackListenerReady = false
let _featureListenerReady = false
let _openRouteListenerReady = false
let _drainPromise = null

// ── Saltado de duplicadas ─────────────────────────────────────────────────
// Ya NO se decide aquí. Antes convivían dos motores independientes —este, que
// consultaba el store de eventos de la WebView, y el nativo, que consulta su
// propio historial— y ambos podían emitir `skipTrack()` sobre la misma canción
// con criterios y ventanas temporales distintos: saltos dobles, decisiones
// contradictorias y, en segundo plano, sólo actuaba el nativo.
//
// El único dueño de la decisión es ahora `DuplicateSkipEngine` (nativo), que
// lee el MediaSession en vivo y funciona con la app cerrada. Aquí sólo se
// refleja el estado de reproducción en la UI y en las estadísticas.

const MIN_REGISTER_PROGRESS_RATIO = 0.05
const MIN_LISTEN_TIME_PROGRESS_RATIO = REGISTER_LISTEN_TIME_PROGRESS_RATIO

function getPlugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

export function useNotifListener () {
  const { addEvent } = useEventStore()
  const { updateState, playback } = usePlayback()
  const { applyNativeFeatureConfig } = useFeatures()

  /**
   * Initialize the notification listener. Should be called once (from App.vue).
   * - Checks if we're running inside Capacitor
   * - Checks notification listener permission
   * - If NOT enabled → shows native prompt dialog
   * - Listens for permissionChanged events (fired onResume)
   * - Sets up spotifyTrack listener + drains background events
   */
  async function checkAndInit (onNowPlaying) {
    _onNowPlayingCb = onNowPlaying

    const NL = getPlugin()
    if (!NL) {
      // Running in browser, not Capacitor
      notifChecked.value = true
      isCapacitor.value = false
      return
    }

    isCapacitor.value = true

    // If already initialized (e.g. hot-reload), skip
    if (_initialized) return
    _initialized = true

    // Listen for permission changes (fired by native onResume)
    try {
      await NL.addListener('permissionChanged', async (data) => {
        const wasEnabled = notifEnabled.value
        notifEnabled.value = !!data?.enabled
        notifChecked.value = true

        if (!wasEnabled && notifEnabled.value) {
          // Just granted → set up listeners, hide modal
          _updateModalVisibility()
          await setupTrackListener(NL)
          await drainEvents(NL)
        } else if (wasEnabled && !notifEnabled.value) {
          // Revoked → clear seen flag so modal reappears
          localStorage.removeItem(SEEN_KEY)
          _updateModalVisibility()
        }
      })
    } catch { /* ignored */ }

    // El servicio nativo emite `featureConfigChanged` cuando el usuario cambia de
    // modo desde las acciones de la notificación persistente. Antes nadie
    // escuchaba este evento, así que la UI se quedaba desincronizada.
    await setupFeatureConfigListener(NL)
    await setupOpenRouteListener(NL)

    try {
      // Ensure POST_NOTIFICATIONS permission (Android 13+) + check listener
      await NL.ensureAllPermissions()

      const { enabled } = await NL.isEnabled()
      notifChecked.value = true
      notifEnabled.value = enabled

      // Update modal visibility based on current permission state
      _updateModalVisibility()

      if (enabled) {
        // Permission already granted — start listening
        await setupTrackListener(NL)
        await drainEvents(NL)
      }
    } catch (err) {
      notifError.value = err.message || String(err)
      notifChecked.value = true
    }
  }

  /** Keep the JS feature state in sync with the native config (notification actions). */
  async function setupFeatureConfigListener (NL) {
    if (_featureListenerReady) return
    _featureListenerReady = true
    try {
      await NL.addListener('featureConfigChanged', (config) => {
        if (config && typeof config === 'object') applyNativeFeatureConfig(config)
      })
    } catch {
      _featureListenerReady = false
    }
  }

  /** Route requested from the persistent notification (mode actions / tap). */
  async function setupOpenRouteListener (NL) {
    if (_openRouteListenerReady) return
    _openRouteListenerReady = true
    try {
      await NL.addListener('openRoute', (payload) => {
        const route = (payload?.route || '').toString().trim()
        if (route.startsWith('/')) pendingOpenRoute.value = route
      })
      if (NL.consumePendingOpenRoute) {
        const initial = await NL.consumePendingOpenRoute()
        const route = (initial?.route || '').toString().trim()
        if (route.startsWith('/')) pendingOpenRoute.value = route
      }
    } catch {
      _openRouteListenerReady = false
    }
  }

  function consumePendingOpenRoute () {
    const route = pendingOpenRoute.value
    pendingOpenRoute.value = ''
    return route
  }

  /** Set up real-time Spotify notification listener */
  async function setupTrackListener (NL) {
    if (_trackListenerReady) return
    _trackListenerReady = true

    await NL.addListener('spotifyTrack', async (data) => {
      const evt = (data?.event || '').toString()
      const track = (data?.track || '').toString()
      const artist = (data?.artist || '').toString()
      const durationMs = Number(data?.duration_ms || 0)
      const playing = !!data?.is_playing
      const progressMs = Number(data?.progress_ms ?? data?.progressMs)

      if (evt === 'stopped' || (!track && !artist)) {
        _onNowPlayingCb?.({ mode: 'stopped', progressPct: null, durationMs: null, progressSyncedAt: null })
        await updateState({ track: '', artist: '', is_playing: false, source: 'notification' })
        return
      }

      // Las canciones que el motor nativo decide saltar no llegan hasta aquí:
      // el listener las descarta antes de emitirlas, así que nunca se registran
      // ni aparecen en las estadísticas.
      await updateState({
        track,
        artist,
        album: data.album,
        duration_ms: Number(data.duration_ms || 0),
        progress_ms: Number.isFinite(progressMs) ? progressMs : null,
        is_playing: playing,
        source: 'notification'
      })

      const effectiveDurationMs = Number(durationMs || playback.durationMs || 0)

      let progressPct = null
      if (Number.isFinite(progressMs) && effectiveDurationMs > 0) {
        progressPct = (progressMs / effectiveDurationMs) * 100
      } else if (effectiveDurationMs > 0 && playback.key === `${track}|${artist}`) {
        progressPct = (Number(playback.msPlayed || 0) / effectiveDurationMs) * 100
      }

      _onNowPlayingCb?.({
        mode: playing ? 'playing' : 'paused',
        track,
        artist,
        album: (data?.album || '').toString(),
        meta: '',
        progressPct,
        durationMs: effectiveDurationMs > 0 ? effectiveDurationMs : null,
        progressSyncedAt: Date.now()
      })
    })
  }

  /** Drain background-captured events */
  async function drainEvents (NL) {
    // `drainBackgroundEvents` borra el log nativo al leerlo: dos llamadas
    // simultáneas se repartían los eventos y se perdían segmentos.
    if (_drainPromise) return _drainPromise
    _drainPromise = _drainEventsOnce(NL).finally(() => { _drainPromise = null })
    return _drainPromise
  }

  async function _drainEventsOnce (NL) {
    try {
      const drained = await NL.drainBackgroundEvents()
      const raw = Array.isArray(drained?.events) ? drained.events : []
      if (raw.length) {
        await ingestBackgroundEvents(raw)
      }
    } catch { /* ignored */ }
  }

  /** Open system notification listener settings directly (no dialog) */
  async function requestPermission () {
    const NL = getPlugin()
    if (NL) await NL.requestPermission()
  }

  /** Show the native prompt dialog, then open settings if accepted */
  async function promptPermission () {
    const NL = getPlugin()
    if (!NL) return
    try {
      await NL.promptPermission()
    } catch { /* ignored */ }
  }

  /** Re-check permission (call after returning from settings) */
  async function recheckPermission () {
    const NL = getPlugin()
    if (!NL) return
    try {
      const { enabled } = await NL.isEnabled()
      const wasEnabled = notifEnabled.value
      notifEnabled.value = enabled
      notifChecked.value = true

      if (!wasEnabled && enabled) {
        await setupTrackListener(NL)
        await drainEvents(NL)
      }
    } catch { /* ignored */ }
  }

  /**
   * Relee del lado nativo los permisos que no son el acceso a notificaciones.
   * Se usa desde Configuración y desde el banner de aviso.
   */
  async function refreshSystemPermissions () {
    const NL = getPlugin()
    // Sólo lectura a propósito: `ensureAllPermissions` PIDE el permiso de
    // notificaciones al pasar, y esto se llama en cada arranque y cada vez que
    // la app vuelve a primer plano. Si el nativo es antiguo y no trae el método,
    // no se inventa un estado: sin lectura no hay banner.
    if (!NL?.getPermissionsState) return
    try {
      const result = await NL.getPermissionsState()
      postNotifGranted.value = !!result?.postNotificationsGranted
      batteryOptimizationIgnored.value = !!result?.batteryOptimizationIgnored
      systemPermsChecked.value = true
    } catch { /* ignored */ }
  }

  /**
   * Pide un permiso y deja constancia del intento.
   *
   * Los tres se piden de forma distinta —diálogo propio, permiso en tiempo de
   * ejecución y diálogo del sistema con dos pantallas de reserva— pero desde
   * fuera se activan igual, que es lo que permite que la guía y Configuración
   * compartan comportamiento en vez de llevar cada una el suyo.
   *
   * No devuelve si se concedió: para el acceso a notificaciones y la batería,
   * la respuesta llega cuando el usuario vuelve de los ajustes del sistema, no
   * aquí. Quien pregunte debe mirar el estado (`necesitaAyudaManual`).
   */
  async function activarPermiso (id) {
    permisosIntentados.value = new Set(permisosIntentados.value).add(id)
    delete pistasPermiso[id]

    const NL = getPlugin()
    if (!NL) return

    try {
      if (id === 'notif-access') {
        await promptPermission()
      } else if (id === 'post-notifications') {
        await NL.ensureAllPermissions()
      } else if (id === 'battery') {
        const res = await NL.requestIgnoreBatteryOptimization()
        if (res?.granted) {
          batteryOptimizationIgnored.value = true
        } else if (!res?.opened) {
          pistasPermiso[id] = 'Android no ha dejado abrir el ajuste desde la app.'
        } else if (res.via === 'battery-list') {
          pistasPermiso[id] = 'Se ha abierto la lista de optimización de batería: elige Skippify y marca «No optimizar».'
        } else if (res.via === 'app-details') {
          pistasPermiso[id] = 'Se ha abierto la ficha de la app: entra en Batería y marca «Sin restricciones».'
        }
      }
    } catch { /* el estado manda; un fallo aquí se resuelve al releer */ }

    await recheckPermission()
    await refreshSystemPermissions()
    // Android tarda un instante en persistir el cambio al volver de los
    // ajustes: sin esta segunda lectura, un permiso recién concedido seguiría
    // saliendo como pendiente hasta el siguiente cambio de pestaña.
    setTimeout(() => {
      recheckPermission()
      refreshSystemPermissions()
    }, 800)
  }

  /** ¿Se pulsó «Activar» en este permiso durante esta sesión? */
  function permisoIntentado (id) {
    return permisosIntentados.value.has(id)
  }

  /**
   * ¿Se puede dar por cerrado el paso de permisos de la guía?
   *
   * La condición es haber INTENTADO cada permiso que falte, no tenerlos
   * concedidos. Conceder no siempre está en manos del usuario: hay capas de
   * Android que no dejan abrir el ajuste de batería desde la app, y el permiso
   * de notificaciones deja de preguntarse tras dos negativas. Exigir el
   * resultado encerraba al usuario en la guía sin salida; lo que procede es
   * enseñarle las instrucciones manuales y dejarle terminar, que el banner de
   * Configuración seguirá recordándole lo que queda.
   *
   * En el navegador se da por resuelto: allí no se pinta ni un botón de permiso
   * porque no hay nada que conceder.
   *
   * @param permisos [{ id, granted }]
   */
  function permisosResueltos (permisos, enCapacitor = isCapacitor.value) {
    if (!enCapacitor) return true
    return permisos.every(p => p.granted || permisoIntentado(p.id))
  }

  /**
   * Instrucciones manuales para un permiso: sólo tienen sentido después de
   * haberlo intentado, porque antes de pulsar no hay nada que explicar.
   * Devuelve cadena vacía si no procede.
   */
  function ayudaManual (id, concedido) {
    if (concedido || !permisoIntentado(id)) return ''
    const pista = pistasPermiso[id]
    const manual = INSTRUCCIONES_MANUALES[id] || ''
    return pista ? `${pista} ${manual}` : manual
  }

  function dismissPrompt () {
    promptDismissed.value = true
  }

  /**
   * Aplaza (o reactiva) el aviso de permisos del primer arranque. Se aplaza
   * mientras corre la guía rápida y se reactiva al terminarla.
   */
  function setPermissionsPromptSuppressed (value) {
    permissionsPromptSuppressed.value = !!value
    _updateModalVisibility()
  }

  /** Dismiss the first-launch permissions modal (marks as seen in localStorage). */
  function dismissPermissionsModal () {
    localStorage.setItem(SEEN_KEY, '1')
    showPermissionsModal.value = false
  }

  async function ingestBackgroundEvents (rawEvents) {
    const list = Array.isArray(rawEvents) ? rawEvents : []
    const parsed = list
      .map(e => {
        const playedAt = (e?.played_at || '').toString()
        const t = Date.parse(playedAt)
        if (!Number.isFinite(t)) return null
        const event = (e?.event || '').toString().toLowerCase()
        const track = (e?.track || '').toString().trim()
        const artist = (e?.artist || '').toString().trim()
        const album = (e?.album || '').toString().trim()
        const durationMs = Number(e?.duration_ms || 0)
        let evt = event
        if (!evt) evt = (track || artist) ? (e?.is_playing ? 'playing' : 'paused') : ''
        if (!evt) return null
        return { t, played_at: playedAt, event: evt, track, artist, album, durationMs }
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)

    if (!parsed.length) return

    const segments = []
    let current = null

    function closeCurrent (endT, endPlayedAt) {
      if (!current) return
      const msPlayed = endT - current.startT
      if (!Number.isFinite(msPlayed) || msPlayed <= 0 || msPlayed > 6 * 3600000) {
        current = null
        return
      }
      segments.push({
        played_at: endPlayedAt,
        track: current.track,
        artist: current.artist,
        album: current.album || '',
        duration_ms: Number(current.durationMs || 0),
        ms_played: Math.round(msPlayed),
        genres: [],
        source: 'notification_background',
        reason: 'background'
      })
      current = null
    }

    for (const e of parsed) {
      if (e.event === 'playing') {
        if (!e.track || !e.artist) continue
        // If the same track is already being tracked (notification refresh / repeated
        // "playing" event for the same song), don't close and re-open the segment.
        if (current && current.track === e.track && current.artist === e.artist) continue
        if (current) closeCurrent(e.t, e.played_at)
        current = {
          track: e.track,
          artist: e.artist,
          album: e.album,
          durationMs: Number(e.durationMs || 0),
          startT: e.t
        }
        continue
      }
      if (e.event === 'paused' || e.event === 'stopped') {
        closeCurrent(e.t, e.played_at)
      }
    }
    if (current) closeCurrent(Date.now(), new Date().toISOString())

    segments.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
    for (const seg of segments) {
      const durationMs = Number(seg.duration_ms || 0)
      const msPlayed = Number(seg.ms_played || 0)
      if (!Number.isFinite(durationMs) || durationMs <= 0) continue
      if (!Number.isFinite(msPlayed) || msPlayed <= 0) continue

      const progressRatio = msPlayed / durationMs
      // Register song if progress >= 5%
      if (progressRatio < MIN_REGISTER_PROGRESS_RATIO) continue

      // Only record listening time if progress >= 80%
      if (progressRatio < MIN_LISTEN_TIME_PROGRESS_RATIO) {
        seg.ms_played = 0
      }

      addEvent(seg)
    }
  }

  return {
    notifEnabled,
    notifError,
    notifChecked,
    isCapacitor,
    promptDismissed,
    showPermissionsModal,
    pendingOpenRoute,
    consumePendingOpenRoute,
    checkAndInit,
    requestPermission,
    promptPermission,
    recheckPermission,
    postNotifGranted,
    batteryOptimizationIgnored,
    missingSystemSettings,
    systemPermsChecked,
    refreshSystemPermissions,
    activarPermiso,
    permisoIntentado,
    permisosIntentados,
    permisosResueltos,
    ayudaManual,
    dismissPrompt,
    dismissPermissionsModal,
    setPermissionsPromptSuppressed,
    getPlugin
  }
}
