/**
 * useMacros — modelo y ejecución de las macros A (origen) → B (acción) → C (destino).
 *
 * Una macro es una regla declarativa: de dónde salen las canciones, qué se hace
 * con ellas y dónde acaban. Todo se resuelve contra la Web API de Spotify.
 *
 * Dónde se ejecutan: casi siempre en el servicio nativo, que sigue vivo con la
 * app cerrada (ver MacroRunner.java). Este módulo conserva el motor completo en
 * JavaScript porque sigue siendo el que resuelve la vista previa, el que corre
 * en el navegador y el que atiende las combinaciones que el servicio deja fuera
 * a propósito —crear la playlist de destino la primera vez, y mover o eliminar
 * sobre una playlist entera—. Los orígenes de tipo «novedades» llevan un cursor
 * persistente a los dos lados, de modo que nada se procesa dos veces.
 *
 * Regla que evita duplicados: si el servicio gobierna una macro, es él quien la
 * ejecuta SIEMPRE, también al pulsar «Ejecutar».
 */
import { reactive, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'

const STORAGE_KEY = 'skippify-macros'
const MAX_TRACKED_IDS = 400

/**
 * Endpoints de la Web API que Spotify ha renombrado.
 *
 * Las rutas antiguas (`/playlists/{id}/tracks`, `POST /users/{id}/playlists`,
 * `PUT|DELETE /me/tracks`) siguen existiendo pero responden 403 «Forbidden»
 * incluso sobre playlists propias y con todos los permisos concedidos: ése era
 * el motivo de que TODAS las macros fallasen a la vez. Los nombres viven aquí
 * arriba para que la próxima mudanza sea una línea y no una cacería.
 */
const PLAYLIST_ITEMS = 'items'
/** Alta y baja en «Tus me gusta». Recibe las URIs por query, no en el cuerpo. */
const LIBRARY_PATH = '/me/library'
/** Máximo de URIs por llamada al escribir. */
const WRITE_BATCH = 100
const LIBRARY_BATCH = 50

// ── Catálogo A · orígenes ───────────────────────────────────────────────────

export const MACRO_SOURCES = [
  {
    type: 'current_track',
    label: 'La canción que suena ahora',
    icon: '🎧',
    detail: 'Toma la reproducción activa en Spotify en el momento de ejecutar la macro.',
    needsPlaylist: false,
    incremental: false
  },
  {
    type: 'playlist_new',
    label: 'Novedades de una playlist',
    icon: '🆕',
    detail: 'Detecta las canciones añadidas a una playlist desde la última vez que se ejecutó.',
    needsPlaylist: true,
    incremental: true
  },
  {
    type: 'playlist_all',
    label: 'Todas las canciones de una playlist',
    icon: '📃',
    detail: 'Recorre la playlist entera cada vez. Útil para sincronizar o vaciar.',
    needsPlaylist: true,
    incremental: false
  },
  {
    type: 'recently_played',
    label: 'Tus reproducciones recientes',
    icon: '🕒',
    detail: 'Las últimas canciones que has escuchado según Spotify (máximo 50).',
    needsPlaylist: false,
    incremental: true
  },
  {
    type: 'liked_new',
    label: 'Novedades en «Tus me gusta»',
    icon: '💚',
    detail: 'Canciones que has marcado como favoritas desde la última ejecución.',
    needsPlaylist: false,
    incremental: true
  },
  {
    type: 'top_tracks',
    label: 'Tus canciones más escuchadas',
    icon: '🏆',
    detail: 'El top personal que calcula Spotify con tu historial reciente.',
    needsPlaylist: false,
    incremental: false
  }
]

// ── Catálogo B · acciones ───────────────────────────────────────────────────

export const MACRO_ACTIONS = [
  {
    type: 'copy',
    label: 'Copiar',
    icon: '📋',
    detail: 'Añade las canciones al destino sin tocar el origen.',
    needsTarget: true,
    targets: ['playlist', 'new_playlist', 'liked', 'queue']
  },
  {
    type: 'move',
    label: 'Mover',
    icon: '📦',
    detail: 'Añade al destino y las quita del origen. Solo con orígenes de playlist.',
    needsTarget: true,
    targets: ['playlist', 'new_playlist', 'liked'],
    requiresPlaylistSource: true
  },
  {
    type: 'remove',
    label: 'Eliminar',
    icon: '🗑️',
    detail: 'Quita las canciones del destino indicado.',
    needsTarget: true,
    targets: ['playlist', 'liked']
  },
  {
    type: 'remove_from_source',
    label: 'Quitar del origen',
    icon: '🧹',
    detail: 'Vacía de la playlist de origen las canciones que la macro encuentre, sin copiarlas a ningún sitio.',
    needsTarget: false,
    requiresPlaylistSource: true
  },
  {
    type: 'queue',
    label: 'Poner en cola',
    icon: '⏭️',
    detail: 'Encola las canciones para que suenen a continuación. Requiere reproducción activa.',
    needsTarget: false
  }
]

// ── Catálogo C · destinos ───────────────────────────────────────────────────

export const MACRO_TARGETS = [
  { type: 'playlist', label: 'Una playlist existente', icon: '🎵', needsPlaylist: true },
  { type: 'new_playlist', label: 'Una playlist nueva', icon: '✨', needsName: true },
  { type: 'liked', label: 'Tus me gusta', icon: '💚' },
  { type: 'queue', label: 'La cola de reproducción', icon: '⏭️' }
]

export function sourceMeta (type) {
  return MACRO_SOURCES.find(item => item.type === type) || null
}

export function actionMeta (type) {
  return MACRO_ACTIONS.find(item => item.type === type) || null
}

export function targetMeta (type) {
  return MACRO_TARGETS.find(item => item.type === type) || null
}

// ── Persistencia ────────────────────────────────────────────────────────────

function load () {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isValidMacro) : []
  } catch {
    return []
  }
}

function isValidMacro (macro) {
  return !!macro
    && typeof macro.id === 'string'
    && !!sourceMeta(macro?.source?.type)
    && !!actionMeta(macro?.action?.type)
}

/**
 * Completa los campos que una macro guardada por una versión anterior puede no
 * tener. Sin esto, `macro.stats.lastResult = …` lanzaba un TypeError que ni
 * siquiera quedaba recogido por el `try` de `runMacro` (el propio `catch`
 * volvía a tocar `macro.stats`), así que la macro fallaba sin decir por qué.
 * Devuelve la misma referencia para poder usarla en cadena.
 */
/** Ventana del historial: siete días, que es lo que se enseña en la pestaña. */
export const HISTORIAL_DIAS = 7
const HISTORIAL_MS = HISTORIAL_DIAS * 24 * 60 * 60 * 1000
const HISTORIAL_MAX = 60

/** 0 aplicada · 1 omitida · 2 error, igual que MacroRunner.java. */
export const HIST_APLICADA = 0
export const HIST_OMITIDA = 1
export const HIST_ERROR = 2

function podarHistorial (entradas) {
  const limite = Date.now() - HISTORIAL_MS
  return entradas
    .filter(e => e && Number(e.at) > limite)
    .sort((a, b) => Number(b.at) - Number(a.at))
    .slice(0, HISTORIAL_MAX)
}

/**
 * Anota una ejecución. Existe para poder responder a «¿esto funciona?» sin
 * tener que fiarse de un contador acumulado: un total que sube no dice si subió
 * anteayer o hace un minuto, y con la app cerrada no hay forma de mirar.
 */
function anotarEnHistorial (macro, status, applied, message) {
  if (!Array.isArray(macro.historial)) macro.historial = []
  macro.historial = podarHistorial([
    { at: Date.now(), status, applied: Number(applied) || 0, message: message || '', origen: 'app' },
    ...macro.historial
  ])
}

export function normalizeMacro (macro) {
  if (!macro || typeof macro !== 'object') return macro

  const cursor = macro.cursor && typeof macro.cursor === 'object' ? macro.cursor : {}
  macro.cursor = {
    seen: Array.isArray(cursor.seen) ? cursor.seen : [],
    lastRunAt: cursor.lastRunAt || null
  }

  const stats = macro.stats && typeof macro.stats === 'object' ? macro.stats : {}
  macro.stats = {
    runs: Number.isFinite(Number(stats.runs)) ? Number(stats.runs) : 0,
    applied: Number.isFinite(Number(stats.applied)) ? Number(stats.applied) : 0,
    lastResult: typeof stats.lastResult === 'string' ? stats.lastResult : ''
  }

  macro.historial = podarHistorial(Array.isArray(macro.historial) ? macro.historial : [])

  if (typeof macro.enabled !== 'boolean') macro.enabled = true
  if (!macro.source || typeof macro.source !== 'object') macro.source = { type: '' }
  if (!macro.action || typeof macro.action !== 'object') macro.action = { type: '' }
  if (macro.target && typeof macro.target !== 'object') macro.target = null

  return macro
}

const macros = reactive(load().map(normalizeMacro))

watch(
  () => JSON.stringify(macros),
  () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...macros])) } catch { /* ignored */ }
  }
)

export function createMacro (draft) {
  const macro = {
    id: `macro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (draft.name || '').trim() || describeMacro(draft),
    enabled: true,
    createdAt: new Date().toISOString(),
    source: { ...draft.source },
    action: { ...draft.action },
    target: draft.target ? { ...draft.target } : null,
    cursor: { seen: [], lastRunAt: null },
    stats: { runs: 0, applied: 0, lastResult: '' }
  }
  macros.unshift(macro)
  return macro
}

export function deleteMacro (id) {
  const index = macros.findIndex(item => item.id === id)
  if (index >= 0) macros.splice(index, 1)
}

export function toggleMacro (id) {
  const macro = macros.find(item => item.id === id)
  if (macro) macro.enabled = !macro.enabled
}

/** Frase legible «A → B → C», usada como nombre por defecto y en la lista. */
export function describeMacro (macro) {
  const source = sourceMeta(macro?.source?.type)
  const action = actionMeta(macro?.action?.type)
  const target = targetMeta(macro?.target?.type)

  const sourceText = macro?.source?.playlistName
    ? `${source?.label} (${macro.source.playlistName})`
    : source?.label || '—'

  let targetText = ''
  if (action?.needsTarget && target) {
    targetText = macro?.target?.playlistName
      ? `${target.label} (${macro.target.playlistName})`
      : macro?.target?.newPlaylistName
        ? `playlist nueva «${macro.target.newPlaylistName}»`
        : target.label
  }

  return targetText
    ? `${sourceText} → ${action?.label?.toLowerCase()} → ${targetText}`
    : `${sourceText} → ${action?.label?.toLowerCase() || '—'}`
}

/** Valida un borrador antes de dejar crearlo. Devuelve el motivo del bloqueo. */
export function validateDraft (draft) {
  const source = sourceMeta(draft?.source?.type)
  const action = actionMeta(draft?.action?.type)

  if (!source) return 'Elige de dónde salen las canciones.'
  if (source.needsPlaylist && !draft?.source?.playlistId) return 'Elige la playlist de origen.'
  if (!action) return 'Elige qué quieres hacer con ellas.'

  if (action.requiresPlaylistSource && !source.needsPlaylist) {
    return 'Mover solo funciona con una playlist como origen: hay que poder quitar la canción de algún sitio.'
  }

  if (!action.needsTarget) return ''

  const target = targetMeta(draft?.target?.type)
  if (!target) return 'Elige el destino.'
  if (!action.targets.includes(target.type)) return 'Ese destino no es compatible con la acción elegida.'
  if (target.needsPlaylist && !draft?.target?.playlistId) return 'Elige la playlist de destino.'
  if (target.needsName && !(draft?.target?.newPlaylistName || '').trim()) return 'Ponle nombre a la playlist nueva.'

  // Spotify solo deja escribir en playlists propias o colaborativas; sin este
  // corte la macro se crearía bien y fallaría con «Forbidden» al ejecutarse.
  if (draft?.target?.playlistWritable === false) {
    return 'Esa playlist no es tuya ni colaborativa: Spotify no deja añadir ni quitar canciones en ella.'
  }
  if (action.requiresPlaylistSource && draft?.source?.playlistWritable === false) {
    return 'Para mover hay que poder quitar la canción del origen, y esa playlist no es tuya ni colaborativa.'
  }

  if (target.type === 'playlist'
      && draft?.source?.playlistId
      && draft.source.playlistId === draft.target.playlistId) {
    return 'El origen y el destino son la misma playlist.'
  }

  return ''
}

// ── Permisos y diagnóstico ──────────────────────────────────────────────────

/** Permisos que necesita cada origen para poder leerse. */
const SOURCE_SCOPES = {
  current_track: ['user-read-currently-playing'],
  playlist_new: ['playlist-read-private'],
  playlist_all: ['playlist-read-private'],
  recently_played: ['user-read-recently-played'],
  liked_new: ['user-library-read'],
  top_tracks: ['user-top-read']
}

/** Permisos que necesita cada pareja acción/destino para poder escribir. */
function writeScopes (actionType, targetType) {
  if (actionType === 'queue' || targetType === 'queue') return ['user-modify-playback-state']
  if (targetType === 'liked') return ['user-library-modify']
  return ['playlist-modify-private', 'playlist-modify-public']
}

/**
 * Traduce un fallo de la API a algo accionable. Spotify devuelve el 403 con el
 * cuerpo `{"error":{"status":403,"message":"Forbidden"}}` en los tres casos que
 * más se dan aquí —playlist ajena, cuenta sin Premium y app en modo desarrollo—
 * así que el texto crudo hay que sustituirlo por el motivo probable.
 */
export function explainSpotifyError (error, context = {}) {
  const status = error?.status
  const raw = (error?.message || '').trim()
  const bare = /^forbidden$/i.test(raw) || !raw

  if (status === 403) {
    if (/premium/i.test(raw) || /PREMIUM_REQUIRED/i.test(error?.reason || '')) {
      return 'Spotify solo deja controlar la reproducción (cola, saltos) con cuenta Premium.'
    }
    if (/not registered|dashboard/i.test(raw)) {
      return 'Tu app de Spotify está en modo desarrollo y esta cuenta no está en su lista de usuarios. '
        + 'Añádela en developer.spotify.com → tu app → User Management.'
    }
    if (context.scope === 'playlist') {
      return context.playlistName
        ? `Spotify no te deja modificar la playlist «${context.playlistName}»: no es tuya ni colaborativa.`
        : 'Spotify no te deja modificar esa playlist: no es tuya ni colaborativa.'
    }
    if (context.scope === 'player') {
      return 'Spotify ha rechazado la orden de reproducción. Suele ser una cuenta sin Premium.'
    }
    return bare
      ? 'Spotify ha respondido «Forbidden». Lo habitual es una playlist que no es tuya, '
        + 'una cuenta sin Premium o permisos que no concediste al iniciar sesión.'
      : raw
  }

  if (status === 404 && context.scope === 'player') {
    return 'No hay ningún dispositivo activo. Pon algo a sonar en Spotify y vuelve a ejecutarla.'
  }
  if (status === 404 && context.scope === 'playlist') {
    return context.playlistName
      ? `La playlist «${context.playlistName}» ya no existe o Spotify no te la deja leer.`
      : 'Esa playlist ya no existe o Spotify no te la deja leer.'
  }
  if (status === 404) {
    return 'Spotify no encuentra eso que la macro intenta usar; puede que se haya borrado.'
  }
  if (status === 401) return 'Tu sesión de Spotify ha caducado. Vuelve a conectar la cuenta.'

  // 429 = cupo de peticiones agotado. Es el fallo que más despista, porque una
  // vez disparado tumba TODAS las macros durante el tiempo que Spotify indique,
  // aunque cada una por separado sea correcta.
  if (status === 429) {
    const seconds = Number(error?.retryAfter)
    const espera = Number.isFinite(seconds) && seconds > 0
      ? (seconds >= 60
          ? `unos ${Math.ceil(seconds / 60)} min`
          : `unos ${Math.ceil(seconds)} s`)
      : 'un rato'
    return 'Has agotado el cupo de peticiones que Spotify da a la app. '
      + `Espera ${espera} y vuelve a intentarlo; conviene repartir las macros grandes en varias veces.`
  }

  if (status === 400) {
    return raw
      ? `Spotify ha rechazado la petición: ${raw}`
      : 'Spotify ha rechazado la petición por venir mal formada.'
  }

  if (status >= 500) {
    return `Spotify está fallando por su lado (error ${status}). Inténtalo de nuevo en unos minutos.`
  }

  // Sin `status` no hubo respuesta: o no hay red, o la petición no llegó a salir.
  if (!status) {
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
      return 'No hay conexión con Spotify. Revisa la red y vuelve a intentarlo.'
    }
    return raw || 'Error desconocido'
  }

  // Cualquier otro código: se dice el código y la ruta, para que el fallo se
  // pueda diagnosticar en vez de quedarse en un «Error desconocido».
  const endpoint = (error?.path || '').split('?')[0]
  return raw
    ? `${raw} (${status}${endpoint ? ` en ${endpoint}` : ''})`
    : `Spotify respondió ${status}${endpoint ? ` en ${endpoint}` : ''}.`
}

/** Lee dueño y modo colaborativo para saber si la playlist admite escritura. */
async function playlistPermission (playlistId, spotify) {
  const profile = spotify.state.profile || await spotify.loadProfile()

  let playlist
  try {
    playlist = await spotify.api(`/playlists/${playlistId}?fields=name,collaborative,owner(id,display_name)`)
  } catch (error) {
    return {
      ok: false,
      name: '',
      writable: false,
      reason: explainSpotifyError(error, { scope: 'playlist' })
    }
  }

  const owner = playlist?.owner || {}
  const mine = !!profile?.id && owner.id === profile.id
  const writable = mine || playlist?.collaborative === true

  return {
    ok: true,
    name: playlist?.name || '',
    writable,
    mine,
    ownerName: owner.display_name || owner.id || 'otra persona',
    reason: writable
      ? ''
      : `«${playlist?.name || playlistId}» es de ${owner.display_name || owner.id || 'otra persona'} `
        + 'y no es colaborativa, así que Spotify no deja añadir ni quitar canciones en ella.'
  }
}

/**
 * Comprueba por adelantado lo que Spotify rechazaría con un 403 pelado. Se
 * ejecuta también en la vista previa: es la única forma de que el usuario vea
 * el problema antes de que la macro deje el trabajo hecho a medias.
 */
export async function preflightMacro (macro, spotify) {
  const action = macro.action?.type
  const targetType = macro.target?.type

  // 1 · permisos concedidos en el login (un token viejo conserva los de antes)
  const needed = [
    ...(SOURCE_SCOPES[macro.source?.type] || []),
    ...writeScopes(action, targetType)
  ]
  const missing = spotify.missingScopes?.(needed)
  if (missing?.length) {
    return `Tu sesión de Spotify no incluye estos permisos: ${missing.join(', ')}. `
      + 'Desconecta y vuelve a conectar la cuenta para concederlos.'
  }

  // 2 · las órdenes de reproducción exigen Premium
  const touchesPlayer = action === 'queue' || targetType === 'queue'
  if (touchesPlayer) {
    const profile = spotify.state.profile || await spotify.loadProfile()
    if (profile?.product && profile.product !== 'premium') {
      return 'Poner canciones en cola requiere Spotify Premium; tu cuenta es '
        + `${profile.product === 'free' ? 'gratuita' : profile.product}.`
    }
  }

  // 3 · escritura sobre playlists ajenas
  const writeTargets = []
  if ((action === 'copy' || action === 'move' || action === 'remove')
      && targetType === 'playlist'
      && macro.target?.playlistId) {
    writeTargets.push(macro.target.playlistId)
  }
  // «Mover» borra del origen: si la playlist de origen no es escribible, el
  // copiado saldría bien y el borrado fallaría, dejando la canción duplicada.
  // «Quitar del origen» sólo escribe ahí, así que es el mismo requisito.
  if ((action === 'move' || action === 'remove_from_source') && macro.source?.playlistId) {
    writeTargets.push(macro.source.playlistId)
  }

  for (const playlistId of [...new Set(writeTargets)]) {
    const permission = await playlistPermission(playlistId, spotify)
    if (!permission.writable) return permission.reason
  }

  return ''
}

// ── Ejecución ───────────────────────────────────────────────────────────────

function chunk (items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Extrae la canción de un elemento de colección.
 *
 * Spotify renombró la envoltura de las playlists: cada entrada traía la canción
 * en `track` y ahora la trae en `item`. «Tus me gusta» (`/me/tracks`) sigue con
 * `track`, así que se aceptan las dos formas y la app funciona con cualquiera
 * de las dos versiones de la API.
 */
function normalizeTrack (raw) {
  const track = raw?.item || raw?.track || raw
  if (!track?.id || !track?.uri) return null
  // Los episodios de pódcast y las pistas locales no admiten las mismas
  // operaciones que una canción del catálogo: se descartan en el origen.
  if (track.type && track.type !== 'track') return null
  // `is_local` viaja unas veces en la envoltura y otras dentro de la canción.
  if (track.is_local || raw?.is_local) return null

  return {
    id: track.id,
    uri: track.uri,
    name: track.name || '',
    artists: (track.artists || []).map(artist => artist?.name).filter(Boolean).join(', ')
  }
}

async function resolveSource (macro, spotify) {
  const { api, apiPaged } = spotify
  const type = macro.source.type

  if (type === 'current_track') {
    const playing = await api('/me/player/currently-playing')
    const track = normalizeTrack(playing?.item)
    return track ? [track] : []
  }

  if (type === 'playlist_new' || type === 'playlist_all') {
    const items = await apiPaged(
      `/playlists/${macro.source.playlistId}/${PLAYLIST_ITEMS}`
        + '?limit=100&fields=items(is_local,item(id,uri,name,type,is_local,artists(name))),next',
      500
    )
    return items.map(normalizeTrack).filter(Boolean)
  }

  if (type === 'recently_played') {
    const page = await api('/me/player/recently-played?limit=50')
    return (page?.items || []).map(normalizeTrack).filter(Boolean)
  }

  if (type === 'liked_new') {
    const items = await apiPaged('/me/tracks?limit=50', 200)
    return items.map(normalizeTrack).filter(Boolean)
  }

  if (type === 'top_tracks') {
    const page = await api('/me/top/tracks?limit=50&time_range=short_term')
    return (page?.items || []).map(normalizeTrack).filter(Boolean)
  }

  return []
}

async function resolveTargetPlaylistId (macro, spotify) {
  const target = macro.target
  if (!target) return null

  if (target.type === 'playlist') return target.playlistId

  if (target.type === 'new_playlist') {
    // Se crea una sola vez y se recuerda: si no, cada ejecución generaría una
    // playlist nueva vacía y la anterior quedaría huérfana.
    if (target.playlistId) return target.playlistId

    // `POST /users/{id}/playlists` responde 403 desde la última revisión de la
    // API; la ruta viva es `/me/playlists`, que además no necesita el perfil.
    const created = await spotify.api('/me/playlists', {
      method: 'POST',
      body: JSON.stringify({
        name: target.newPlaylistName,
        description: 'Creada automáticamente por Skippify',
        public: false
      })
    })

    target.playlistId = created?.id || null
    target.playlistName = created?.name || target.newPlaylistName
    return target.playlistId
  }

  return null
}

/** Alta o baja en «Tus me gusta». Las URIs van en la query, no en el cuerpo. */
async function writeLibrary (api, uris, method) {
  for (const group of chunk(uris, LIBRARY_BATCH)) {
    await api(`${LIBRARY_PATH}?uris=${encodeURIComponent(group.join(','))}`, { method })
  }
}

/** Añade canciones a una playlist. */
async function addToPlaylist (api, playlistId, uris) {
  for (const group of chunk(uris, WRITE_BATCH)) {
    await api(`/playlists/${playlistId}/${PLAYLIST_ITEMS}`, {
      method: 'POST',
      body: JSON.stringify({ uris: group })
    })
  }
}

/** Quita canciones de una playlist. El cuerpo va con `items`, no con `tracks`. */
async function removeFromPlaylist (api, playlistId, uris) {
  for (const group of chunk(uris, WRITE_BATCH)) {
    await api(`/playlists/${playlistId}/${PLAYLIST_ITEMS}`, {
      method: 'DELETE',
      body: JSON.stringify({ items: group.map(uri => ({ uri })) })
    })
  }
}

/** Encola canciones. La cola no admite lotes: hay un POST por canción. */
async function enqueue (api, uris) {
  for (const uri of uris) {
    await api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' })
  }
}

async function applyAction (macro, tracks, spotify) {
  const { api } = spotify
  const action = macro.action.type
  const uris = tracks.map(track => track.uri)

  if (action === 'queue') {
    await enqueue(api, uris)
    return tracks.length
  }

  if (action === 'remove_from_source') {
    if (!macro.source?.playlistId) throw new Error('No hay playlist de origen que vaciar')
    await removeFromPlaylist(api, macro.source.playlistId, uris)
    return tracks.length
  }

  const targetType = macro.target?.type

  if (action === 'copy' || action === 'move') {
    if (targetType === 'liked') {
      await writeLibrary(api, uris, 'PUT')
    } else if (targetType === 'queue') {
      await enqueue(api, uris)
    } else {
      const playlistId = await resolveTargetPlaylistId(macro, spotify)
      if (!playlistId) throw new Error('No se pudo determinar la playlist de destino')
      await addToPlaylist(api, playlistId, uris)
    }

    if (action === 'move' && macro.source.playlistId) {
      await removeFromPlaylist(api, macro.source.playlistId, uris)
    }

    return tracks.length
  }

  if (action === 'remove') {
    if (targetType === 'liked') {
      await writeLibrary(api, uris, 'DELETE')
    } else {
      const playlistId = await resolveTargetPlaylistId(macro, spotify)
      if (!playlistId) throw new Error('No se pudo determinar la playlist de destino')
      await removeFromPlaylist(api, playlistId, uris)
    }
    return tracks.length
  }

  return 0
}

/**
 * Cuántas canciones se procesan como mucho en una sola ejecución.
 *
 * Las acciones que escriben por lotes (playlists, «me gusta») gastan una
 * petición cada 50-100 canciones, así que aguantan mucho. La cola, en cambio,
 * obliga a un POST por canción: ahí el tope tiene que ser bajo o se agota el
 * cupo de la aplicación y Spotify empieza a devolver 429 a todo.
 */
function maxTracksPerRun (macro) {
  const usaCola = macro.action?.type === 'queue' || macro.target?.type === 'queue'
  return usaCola ? 40 : 400
}

/**
 * Ejecuta una macro. `dryRun` resuelve el origen y filtra, pero no escribe nada:
 * es lo que usa la vista previa antes de tocar la biblioteca del usuario.
 */
export async function runMacro (macro, spotify, { dryRun = false } = {}) {
  // Una macro guardada por una versión anterior puede no traer `cursor` ni
  // `stats`. Normalizar aquí garantiza que ni el cuerpo ni el `catch` se topen
  // con un `undefined` (que antes escapaba como excepción sin recoger).
  normalizeMacro(macro)

  const meta = sourceMeta(macro.source?.type)
  const result = { matched: 0, applied: 0, tracks: [], error: '' }

  try {
    // Se comprueba antes de tocar nada, también en la vista previa: así el
    // aviso llega en vez de un «Forbidden» a mitad de la ejecución.
    const blocked = await preflightMacro(macro, spotify)
    if (blocked) {
      result.error = blocked
      if (!dryRun) {
        macro.stats.lastResult = `Bloqueada: ${blocked}`
        anotarEnHistorial(macro, HIST_ERROR, 0, `Bloqueada: ${blocked}`)
      }
      return result
    }

    const all = await resolveSource(macro, spotify)

    // Orígenes incrementales: sólo lo que no se haya visto antes. En la primera
    // ejecución se marca todo como visto sin actuar, porque si no una macro
    // recién creada volcaría el historial entero de golpe.
    let pending = all
    const firstRun = meta?.incremental && !macro.cursor?.lastRunAt

    if (meta?.incremental) {
      const seen = new Set(macro.cursor?.seen || [])
      pending = all.filter(track => !seen.has(track.id))
      if (firstRun) {
        result.matched = 0
        result.tracks = []
        if (!dryRun) {
          macro.cursor = { seen: all.map(t => t.id).slice(0, MAX_TRACKED_IDS), lastRunAt: new Date().toISOString() }
          macro.stats.runs += 1
          macro.stats.lastResult = `Punto de partida fijado con ${all.length} canciones.`
          anotarEnHistorial(macro, HIST_OMITIDA, 0, macro.stats.lastResult)
        }
        return result
      }
    }

    result.matched = pending.length
    result.tracks = pending.slice(0, 25)

    // Tope por ejecución. Encolar hace un POST por canción: una playlist de 500
    // se comía el cupo de la app y dejaba fallando todas las demás macros. Lo
    // que sobra no se marca como visto, así que se procesa en la siguiente vuelta.
    const limit = maxTracksPerRun(macro)
    result.limited = pending.length > limit
    if (result.limited) pending = pending.slice(0, limit)

    if (dryRun || !pending.length) {
      if (!dryRun) {
        macro.cursor.lastRunAt = new Date().toISOString()
        macro.stats.runs += 1
        macro.stats.lastResult = 'Sin canciones nuevas que procesar.'
        anotarEnHistorial(macro, HIST_OMITIDA, 0, macro.stats.lastResult)
      }
      return result
    }

    result.applied = await applyAction(macro, pending, spotify)

    if (meta?.incremental) {
      const seen = [...pending.map(t => t.id), ...(macro.cursor?.seen || [])]
      macro.cursor = { seen: seen.slice(0, MAX_TRACKED_IDS), lastRunAt: new Date().toISOString() }
    } else {
      macro.cursor.lastRunAt = new Date().toISOString()
    }

    macro.stats.runs += 1
    macro.stats.applied += result.applied
    macro.stats.lastResult = result.limited
      ? `${result.applied} canción(es) procesadas; el resto queda para la próxima ejecución.`
      : `${result.applied} canción(es) procesadas.`
    anotarEnHistorial(macro, HIST_APLICADA, result.applied, macro.stats.lastResult)
    return result
  } catch (error) {
    const path = error?.path || ''
    const scope = /\/me\/player/.test(path)
      ? 'player'
      : /\/playlists\//.test(path)
        ? 'playlist'
        : ''
    const playlistName = scope === 'playlist'
      ? (path.includes(macro.source?.playlistId || '\u0000')
          ? macro.source?.playlistName
          : macro.target?.playlistName) || ''
      : ''

    result.error = explainSpotifyError(error, { scope, playlistName })
    if (!dryRun) {
      macro.stats.lastResult = `Error: ${result.error}`
      anotarEnHistorial(macro, HIST_ERROR, 0, `Error: ${result.error}`)
    }
    return result
  }
}

// ── Puente con el motor nativo ──────────────────────────────────────────────

/**
 * El servicio de Android ejecuta las macros con la app cerrada. Aquí sólo se le
 * mantienen sincronizadas las definiciones y se leen sus resultados.
 *
 * Regla que evita duplicados: si el servicio gobierna una macro, es él quien la
 * ejecuta SIEMPRE, también cuando se pulsa «Ejecutar» en la app. Un único sitio
 * que ejecuta es un único deduplicado.
 */
const nativeState = reactive({
  /** Ids que gobierna el servicio. */
  ids: [],
  /** Estadísticas por id: { runs, applied, lastResult, lastRunAt }. */
  stats: {},
  /** Motivo por el que el servicio deja fuera a una macro, por id. */
  excluidas: {},
  /** `true` en cuanto el puente ha contestado alguna vez. */
  disponible: false,
  /**
   * Botón de los auriculares: la macro vinculada, las que se pueden vincular
   * (aunque estén pausadas) y por qué las demás no.
   */
  boton: { macroId: '', elegibles: [], noElegibles: {} }
})

function nativePlugin () {
  return (typeof window !== 'undefined' && window.Capacitor?.Plugins?.NotifListener) || null
}

/** Forma reducida que entiende el nativo. */
function paraNativo (macro) {
  return {
    id: macro.id,
    name: macro.name || '',
    enabled: !!macro.enabled,
    source: macro.source?.type || '',
    action: macro.action?.type || '',
    target: macro.target?.type || '',
    targetPlaylistId: macro.target?.playlistId || '',
    sourcePlaylistId: macro.source?.playlistId || ''
  }
}

function absorberEstado (estado) {
  if (!estado) return
  nativeState.disponible = true
  nativeState.ids = Array.isArray(estado.ids) ? [...estado.ids] : []
  const mapa = {}
  for (const fila of (Array.isArray(estado.stats) ? estado.stats : [])) {
    if (fila?.id) mapa[fila.id] = fila
  }
  nativeState.stats = mapa

  const motivos = {}
  for (const fila of (Array.isArray(estado.excluidas) ? estado.excluidas : [])) {
    if (fila?.id) motivos[fila.id] = fila.motivo || ''
  }
  nativeState.excluidas = motivos

  const boton = estado.boton || {}
  const noElegibles = {}
  for (const fila of (Array.isArray(boton.noElegibles) ? boton.noElegibles : [])) {
    if (fila?.id) noElegibles[fila.id] = fila.motivo || ''
  }
  nativeState.boton = {
    macroId: boton.macroId || '',
    elegibles: Array.isArray(boton.elegibles) ? [...boton.elegibles] : [],
    noElegibles
  }
}

/** Envía las macros al servicio y recoge su estado. Silencioso sin puente. */
export async function sincronizarConNativo () {
  const NL = nativePlugin()
  if (!NL?.setBackgroundMacros) return false
  try {
    absorberEstado(await NL.setBackgroundMacros({ macros: macros.map(paraNativo) }))
    return true
  } catch {
    return false
  }
}

export async function refrescarEstadoNativo () {
  const NL = nativePlugin()
  if (!NL?.getBackgroundMacroState) return false
  try {
    absorberEstado(await NL.getBackgroundMacroState())
    return true
  } catch {
    return false
  }
}

/**
 * Vincula una macro a la pulsación larga del botón de los auriculares; con
 * cadena vacía suelta el vínculo. Lo guarda el servicio, que es quien atiende
 * la pulsación con la app cerrada.
 */
export async function vincularBoton (id) {
  const NL = nativePlugin()
  if (!NL?.setHeadsetMacro) return false
  try {
    absorberEstado(await NL.setHeadsetMacro({ id: id || '' }))
    return true
  } catch {
    return false
  }
}

/** Ejecuta la macro del botón como si se hubiera pulsado. */
export async function probarBoton () {
  const NL = nativePlugin()
  if (!NL?.runHeadsetMacroNow) return { error: 'El servicio en segundo plano no está disponible.' }
  try {
    const res = await NL.runHeadsetMacroNow()
    await refrescarEstadoNativo()
    return res || {}
  } catch (error) {
    return { error: error?.message || 'No se pudo hablar con el servicio.' }
  }
}

/** ¿Es la macro vinculada al botón? */
export function vinculadaAlBoton (macro) {
  return !!macro && !!nativeState.boton.macroId && nativeState.boton.macroId === macro.id
}

/** ¿La ejecuta el servicio por su cuenta? */
export function correEnSegundoPlano (macro) {
  return !!macro && nativeState.ids.includes(macro.id)
}

/**
 * Por qué el servicio no la gobierna. Cadena vacía si sí la gobierna o si aún
 * no hay puente (en el navegador, por ejemplo).
 */
export function motivoSinSegundoPlano (macro) {
  if (!macro || !nativeState.disponible || correEnSegundoPlano(macro)) return ''
  return nativeState.excluidas[macro.id] || ''
}

/**
 * Historial de los últimos 7 días, juntando lo que hizo el servicio con la app
 * cerrada y lo que se ejecutó desde la propia app. Ordenado de más reciente a
 * más antiguo.
 */
export function historialDe (macro) {
  if (!macro) return []
  const nativo = (estadisticasNativas(macro)?.historial || []).map(e => ({
    at: Number(e.at) || 0,
    status: Number(e.status) || 0,
    applied: Number(e.applied) || 0,
    message: e.message || '',
    origen: 'servicio'
  }))
  const limite = Date.now() - HISTORIAL_MS
  return [...nativo, ...(macro.historial || [])]
    .filter(e => e.at > limite)
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORIAL_MAX)
}

/** El mismo historial agrupado por día, que es como se enseña. */
export function historialPorDia (macro) {
  const dias = new Map()
  for (const e of historialDe(macro)) {
    const clave = new Date(e.at).toISOString().slice(0, 10)
    if (!dias.has(clave)) {
      dias.set(clave, { dia: clave, at: e.at, ejecuciones: 0, aplicadas: 0, errores: 0, entradas: [] })
    }
    const d = dias.get(clave)
    d.ejecuciones += 1
    d.aplicadas += e.applied
    if (e.status === HIST_ERROR) d.errores += 1
    d.entradas.push(e)
  }
  return [...dias.values()]
}

export function estadisticasNativas (macro) {
  return (macro && nativeState.stats[macro.id]) || null
}

/**
 * Pide al servicio que ejecute ahora sus macros y devuelve el resultado de la
 * que interesa, con la misma forma que `runMacro` para que la vista no tenga
 * que distinguir de dónde vino.
 */
async function ejecutarEnNativo (macro) {
  const NL = nativePlugin()
  const result = { matched: 0, applied: 0, tracks: [], error: '' }
  if (!NL?.runBackgroundMacrosNow) {
    result.error = 'El servicio en segundo plano no está disponible.'
    return result
  }

  try {
    const res = await NL.runBackgroundMacrosNow({ id: macro.id })
    await refrescarEstadoNativo()

    const mio = (res?.detalle || []).find(d => d?.id === macro.id)
    if (!mio) {
      // La única forma de no aparecer es que el origen sea la canción actual y
      // no hubiera ninguna sonando: el servicio ni siquiera evalúa la macro.
      result.error = macro.source?.type === 'current_track'
        ? 'No hay ninguna canción sonando ahora mismo.'
        : 'El servicio no ha considerado esta macro.'
      return result
    }

    // 0 aplicada · 1 omitida · 2 error (ver MacroRunner.java)
    if (mio.status === 2) { result.error = mio.message || 'Error en segundo plano.'; return result }
    result.matched = Number(mio.matched) || 0
    result.applied = Number(mio.applied) || 0
    if (mio.status === 1) result.nota = mio.message || ''
    return result
  } catch (error) {
    result.error = error?.message || 'No se pudo hablar con el servicio.'
    return result
  }
}

// Cualquier cambio en las macros viaja al servicio. Sin esto, una macro recién
// creada no existiría para el segundo plano hasta el siguiente arranque.
watch(
  () => macros.map(m => `${m.id}|${m.enabled}|${m.source?.type}|${m.source?.playlistId}|${m.action?.type}|${m.target?.type}|${m.target?.playlistId}`).join(';'),
  () => { sincronizarConNativo() },
  { immediate: false }
)

export function useMacros () {
  const spotify = useSpotify()

  async function runAllEnabled () {
    const summary = []
    for (const macro of macros) {
      if (!macro.enabled) continue
      const result = await runMacro(macro, spotify)
      summary.push({ macro, result })
      // Si Spotify ha cortado por cupo, seguir con las demás sólo consigue que
      // fallen todas y que la ventana de bloqueo se alargue. Se para aquí.
      if (/cupo de peticiones/.test(result.error || '')) {
        for (const rest of macros) {
          if (rest === macro || !rest.enabled) continue
          if (summary.some(item => item.macro === rest)) continue
          summary.push({
            macro: rest,
            result: {
              matched: 0,
              applied: 0,
              tracks: [],
              error: 'No se ha ejecutado: Spotify había cortado por cupo de peticiones.'
            }
          })
        }
        break
      }
    }
    return summary
  }

  /**
   * Ejecuta una macro. Si la gobierna el servicio nativo, se le pide a él: así
   * la ventana de repetición y las estadísticas viven en un solo sitio.
   * La vista previa siempre se resuelve aquí, porque no escribe nada.
   */
  async function ejecutar (macro, options = {}) {
    if (!options.dryRun && correEnSegundoPlano(macro)) {
      return ejecutarEnNativo(macro)
    }
    return runMacro(macro, spotify, options)
  }

  return {
    macros,
    createMacro,
    deleteMacro,
    toggleMacro,
    runMacro: ejecutar,
    runAllEnabled,
    nativeState,
    sincronizarConNativo,
    refrescarEstadoNativo,
    correEnSegundoPlano,
    motivoSinSegundoPlano,
    estadisticasNativas,
    historialDe,
    historialPorDia,
    vincularBoton,
    probarBoton,
    vinculadaAlBoton
  }
}
