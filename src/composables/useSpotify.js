/**
 * useSpotify — sesión con la Web API de Spotify mediante OAuth PKCE.
 *
 * Se usa PKCE y no el flujo con secreto por una razón obligatoria: en una app
 * que se instala en el móvil del usuario NO existe forma de guardar un
 * client secret; cualquiera puede abrir la APK y leerlo. PKCE está pensado
 * exactamente para este caso y no necesita secreto.
 *
 * El login se abre en el navegador del sistema (Spotify bloquea el login desde
 * WebViews embebidas) y se vuelve por deep link `skippify://spotify-auth`.
 */
import { computed, reactive, ref } from 'vue'

const TOKEN_KEY = 'skippify-spotify-token'
const VERIFIER_KEY = 'skippify-spotify-verifier'
/** `state` del login en curso: la redirección sólo se acepta si lo devuelve igual. */
const OAUTH_STATE_KEY = 'skippify-spotify-oauth-state'
const CLIENT_ID_KEY = 'skippify-spotify-client-id'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

/** Esquema del deep link. Debe coincidir con el intent-filter del manifiesto. */
const NATIVE_REDIRECT = 'skippify://spotify-auth'

// Sólo los permisos que la app usa. Correo y artistas seguidos no se leen en
// ningún sitio, así que no se piden.
const SCOPE_LIST = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read'
]

const SCOPES = SCOPE_LIST.join(' ')

/**
 * Permisos que Spotify concedió realmente en el último login. Un token emitido
 * antes de que la app pidiera un permiso lo sigue sin tener aunque el código ya
 * lo liste, y el refresh conserva los permisos originales: por eso se compara
 * lo concedido con lo que hace falta en lugar de dar SCOPES por hecho.
 */
export function grantedScopes () {
  const raw = token.value?.scope
  if (typeof raw !== 'string' || !raw.trim()) return null // token antiguo: no consta
  return raw.trim().split(/\s+/)
}

/** Permisos que faltan de entre los indicados. `null` si no se puede saber. */
export function missingScopes (needed = SCOPE_LIST) {
  const granted = grantedScopes()
  if (!granted) return null
  return needed.filter(scope => !granted.includes(scope))
}

const state = reactive({
  profile: null,
  connecting: false,
  error: ''
})

const token = ref(loadToken())
const clientId = ref(loadClientId())

// ── Persistencia ────────────────────────────────────────────────────────────

function loadToken () {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
    if (!parsed?.access_token) return null
    return parsed
  } catch {
    return null
  }
}

function saveToken (value) {
  token.value = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, JSON.stringify(value))
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignored */ }
  // El servicio nativo necesita la sesión para ejecutar macros con la app
  // cerrada. A partir de aquí él es el único que refresca el token (ver
  // `refreshToken`): dos refrescadores sobre el mismo refresh token acaban
  // invalidándose el uno al otro cuando Spotify lo rota.
  empujarSesionANativo(value)
}

function empujarSesionANativo (value) {
  const NL = plugin()
  if (!NL?.setSpotifySession) return
  try {
    if (!value?.access_token) {
      NL.clearSpotifySession?.()
      return
    }
    NL.setSpotifySession({
      clientId: clientId.value || '',
      accessToken: value.access_token || '',
      refreshToken: value.refresh_token || '',
      expiresAt: Number(value.expires_at || 0),
      scope: value.scope || ''
    })
  } catch { /* el puente no está: se sigue funcionando sólo con la app abierta */ }
}

/**
 * Adopta la sesión que tenga el nativo si es más fresca que la de la WebView.
 *
 * Hace falta porque el nativo refresca el token mientras la app está cerrada:
 * al volver, `localStorage` tiene uno caducado y el bueno está en el servicio.
 */
export async function adoptarSesionNativa () {
  const NL = plugin()
  if (!NL?.getSpotifySession) return false
  try {
    const nativa = await NL.getSpotifySession()
    if (!nativa?.connected || !nativa?.accessToken) return false

    // El token en memoria puede ir por detrás del almacenado si este módulo se
    // cargó antes de que existiera la sesión; se toma el mejor de los dos para
    // no perder el refresh token al adoptar.
    const previo = token.value?.access_token ? token.value : (loadToken() || {})

    const propia = Number(previo.expires_at || 0)
    const suya = Number(nativa.expiresAt || 0)
    if (previo.access_token && propia >= suya) return false

    // El refresh token no viaja de vuelta desde el nativo: se conserva el que ya
    // había, que es el mismo.
    token.value = {
      access_token: nativa.accessToken,
      refresh_token: previo.refresh_token || '',
      scope: nativa.scope || previo.scope || '',
      expires_at: suya
    }
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token.value)) } catch { /* ignored */ }
    return true
  } catch {
    return false
  }
}

function loadClientId () {
  try {
    const stored = (localStorage.getItem(CLIENT_ID_KEY) || '').trim()
    if (stored) return stored
  } catch { /* ignored */ }
  return (import.meta.env?.VITE_SPOTIFY_CLIENT_ID || '').trim()
}

function setClientId (value) {
  const clean = (value || '').toString().trim()
  clientId.value = clean
  try {
    if (clean) localStorage.setItem(CLIENT_ID_KEY, clean)
    else localStorage.removeItem(CLIENT_ID_KEY)
  } catch { /* ignored */ }
}

// ── PKCE ────────────────────────────────────────────────────────────────────

function randomVerifier (length = 96) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => charset[byte % charset.length]).join('')
}

async function challengeFrom (verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

function isNative () {
  return !!window.Capacitor?.isNativePlatform?.()
}

function redirectUri () {
  // En el navegador (desarrollo) Spotify exige una URL http(s) registrada;
  // en la app se usa el deep link, que es lo que recoge MainActivity.
  return isNative() ? NATIVE_REDIRECT : `${window.location.origin}/`
}

// ── Flujo de autorización ───────────────────────────────────────────────────

async function connect () {
  state.error = ''

  if (!clientId.value) {
    state.error = 'Falta el Client ID de tu aplicación de Spotify.'
    return false
  }

  try {
    const verifier = randomVerifier()
    const oauthState = randomVerifier(32)
    localStorage.setItem(VERIFIER_KEY, verifier)
    localStorage.setItem(OAUTH_STATE_KEY, oauthState)

    const params = new URLSearchParams({
      client_id: clientId.value,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challengeFrom(verifier),
      scope: SCOPES,
      state: oauthState,
      show_dialog: 'true'
    })

    const url = `${AUTH_URL}?${params.toString()}`
    const NL = plugin()

    if (isNative() && NL?.openExternalUrl) {
      state.connecting = true
      const opened = await NL.openExternalUrl({ url })
      if (!opened?.opened) {
        // Sin navegador que abrir no llegará ninguna redirección: dejar el
        // estado en «conectando» colgaría el botón para siempre.
        state.connecting = false
        state.error = 'No se pudo abrir el navegador para autorizar la cuenta.'
        return false
      }
      return true
    }

    window.location.assign(url)
    return true
  } catch (error) {
    state.error = `No se pudo iniciar el login: ${error?.message || error}`
    state.connecting = false
    return false
  }
}

/** Canjea el `code` de la redirección por un token. Idempotente por diseño. */
async function exchangeCode (code) {
  const verifier = localStorage.getItem(VERIFIER_KEY) || ''
  if (!code || !verifier) return false

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId.value,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier
      })
    })

    const data = await response.json()
    if (!response.ok || !data?.access_token) {
      state.error = data?.error_description || 'Spotify rechazó la autorización.'
      return false
    }

    // El verifier es de un solo uso: dejarlo permitiría reintentar un canje que
    // Spotify ya rechazaría, y confundiría el diagnóstico de errores.
    localStorage.removeItem(VERIFIER_KEY)
    localStorage.removeItem(OAUTH_STATE_KEY)
    storeTokenResponse(data)
    await loadProfile()
    return true
  } catch (error) {
    state.error = `No se pudo completar el login: ${error?.message || error}`
    return false
  } finally {
    state.connecting = false
  }
}

function storeTokenResponse (data, previousRefresh = '') {
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token || previousRefresh || token.value?.refresh_token || '',
    // El refresh no siempre repite `scope`; conservar el anterior evita perder
    // la lista y creer luego que faltan permisos que sí están concedidos.
    scope: data.scope || token.value?.scope || '',
    expires_at: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000
  })
}

async function refreshToken () {
  const refresh = token.value?.refresh_token
  if (!refresh || !clientId.value) return false

  // Con puente nativo, refresca él y esta capa adopta el resultado. Es lo que
  // garantiza que sólo haya un refresh token vivo.
  const NL = plugin()
  if (NL?.refreshSpotifySession) {
    try {
      const nativa = await NL.refreshSpotifySession()
      if (nativa?.accessToken) {
        token.value = {
          access_token: nativa.accessToken,
          refresh_token: refresh,
          scope: nativa.scope || token.value?.scope || '',
          expires_at: Number(nativa.expiresAt || 0)
        }
        try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token.value)) } catch { /* ignored */ }
        return true
      }
      // Si el nativo dice que ya no hay sesión, es que Spotify la invalidó.
      if (nativa && nativa.connected === false) {
        disconnect()
        return false
      }
    } catch { /* se cae al camino de siempre */ }
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId.value,
        grant_type: 'refresh_token',
        refresh_token: refresh
      })
    })

    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.access_token) {
      // Sólo se cierra sesión cuando Spotify declara el refresh token muerto
      // (`invalid_grant`). Un 429 o un 5xx son transitorios: desconectar por
      // ellos vaciaba el token y dejaba TODA la app pidiendo login otra vez.
      const revoked = data?.error === 'invalid_grant'
        || (response.status >= 400 && response.status < 500 && response.status !== 429)
      if (revoked) disconnect()
      return false
    }

    storeTokenResponse(data, refresh)
    return true
  } catch {
    return false
  }
}

function disconnect () {
  saveToken(null)
  state.profile = null
  try {
    localStorage.removeItem(VERIFIER_KEY)
    localStorage.removeItem(OAUTH_STATE_KEY)
  } catch { /* ignored */ }
}

/** Recoge el `code` de una URL de redirección (deep link o barra del navegador). */
async function consumeRedirect (rawUrl) {
  const source = rawUrl || window.location.href
  let params

  try {
    params = new URL(source).searchParams
  } catch {
    const queryIndex = source.indexOf('?')
    if (queryIndex < 0) return false
    params = new URLSearchParams(source.slice(queryIndex + 1))
  }

  const error = params.get('error')
  if (error) {
    state.error = error === 'access_denied'
      ? 'Has cancelado el acceso a tu cuenta de Spotify.'
      : `Spotify devolvió un error: ${error}`
    state.connecting = false
    return false
  }

  const code = params.get('code')
  if (!code) return false

  // Una redirección que no trae el `state` de NUESTRO login no se canjea: así
  // otra app o web no puede colar un código suyo y vincular su cuenta aquí.
  let esperado = ''
  let verifier = ''
  try {
    esperado = localStorage.getItem(OAUTH_STATE_KEY) || ''
    verifier = localStorage.getItem(VERIFIER_KEY) || ''
  } catch { /* ignored */ }
  // Sin login en curso (p. ej. la misma redirección leída dos veces tras un
  // canje correcto) no hay nada que hacer ni error que enseñar.
  if (!verifier) return false
  if (!esperado || params.get('state') !== esperado) {
    state.error = 'La respuesta de Spotify no corresponde a este inicio de sesión. Vuelve a intentarlo.'
    state.connecting = false
    return false
  }
  return exchangeCode(code)
}

// ── Llamadas a la API ───────────────────────────────────────────────────────

async function ensureFreshToken () {
  if (!token.value?.access_token) return false
  if (Date.now() < Number(token.value.expires_at || 0)) return true
  return refreshToken()
}

/**
 * Cola de peticiones.
 *
 * Spotify limita por aplicación en una ventana deslizante de ~30 s, y una macro
 * sobre una playlist larga dispara cientos de llamadas seguidas (encolar hace
 * un POST por canción). Sin freno se agota el cupo, Spotify responde 429 con un
 * `Retry-After` que puede ser de minutos y a partir de ahí falla TODO lo demás,
 * no sólo la macro que se pasó. Serializar y espaciar las llamadas cuesta unos
 * milisegundos y evita ese bloqueo en cascada.
 */
const MIN_REQUEST_GAP_MS = 90
let requestChain = Promise.resolve()
let lastRequestAt = 0

/** Momento (ms epoch) hasta el que Spotify nos ha pedido no volver a llamar. */
let rateLimitedUntil = 0

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

/** Serializa las llamadas y respeta la separación mínima entre ellas. */
function enqueue (task) {
  const run = requestChain.then(async () => {
    const wait = Math.max(
      lastRequestAt + MIN_REQUEST_GAP_MS - Date.now(),
      rateLimitedUntil - Date.now()
    )
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return task()
  })
  // La cadena no debe romperse si una tarea falla: se encadena una versión
  // «neutralizada» para que la siguiente petición siga saliendo.
  requestChain = run.then(() => {}, () => {})
  return run
}

/** Espera máxima que aceptamos ante un 429 antes de rendirnos y avisar. */
const MAX_RETRY_AFTER_S = 30
const MAX_ATTEMPTS = 3

/**
 * Llamada autenticada. Reintenta tras refrescar el token (un 401 por caducidad
 * es lo habitual cuando la app ha estado horas en segundo plano) y tras un 429,
 * respetando el `Retry-After` que indica Spotify.
 */
async function api (path, options = {}, retry = true) {
  let attempt = 0

  for (;;) {
    attempt++
    if (!(await ensureFreshToken())) throw new Error('Sesión de Spotify no válida')

    const url = path.startsWith('http') ? path : `${API_BASE}${path}`
    const response = await enqueue(() => fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token.value.access_token}`,
        // Spotify rechaza algunos GET si se anuncia un cuerpo JSON que no existe;
        // la cabecera sólo tiene sentido cuando de verdad se envía algo.
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    }))

    if (response.status === 401 && retry && attempt === 1) {
      if (await refreshToken()) continue
      throw new Error('Sesión de Spotify caducada')
    }

    if (response.status === 429) {
      const after = Number(response.headers.get('Retry-After'))
      const waitS = Number.isFinite(after) && after > 0 ? after : 2
      // Se anota para toda la cola: si nos han limitado, no tiene sentido que
      // las peticiones que vienen detrás salgan corriendo a chocarse igual.
      rateLimitedUntil = Date.now() + waitS * 1000
      if (retry && attempt < MAX_ATTEMPTS && waitS <= MAX_RETRY_AFTER_S) {
        await sleep(waitS * 1000 + 250)
        continue
      }
      const error = new Error(`Spotify respondió 429`)
      error.status = 429
      error.retryAfter = waitS
      error.method = (options.method || 'GET').toUpperCase()
      error.path = path
      throw error
    }

    if (!response.ok) {
      let detail = ''
      let reason = ''
      try {
        const body = await response.json()
        detail = body?.error?.message || ''
        reason = body?.error?.reason || ''
      } catch { /* respuesta sin cuerpo JSON */ }

      // El status y el `reason` se conservan aparte del mensaje: un 403 de
      // Spotify llega casi siempre con el texto pelado «Forbidden», que no le
      // dice nada a nadie. Quien llama necesita el código para traducirlo.
      const error = new Error(detail || `Spotify respondió ${response.status}`)
      error.status = response.status
      error.reason = reason
      error.method = (options.method || 'GET').toUpperCase()
      error.path = path
      throw error
    }

    if (response.status === 204) return null
    const text = await response.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      // Un cuerpo que no es JSON (una página de error de un proxy, por ejemplo)
      // reventaba con un SyntaxError ilegible en mitad de la macro.
      const error = new Error('Spotify devolvió una respuesta que no se pudo leer')
      error.status = response.status
      error.path = path
      throw error
    }
  }
}

/** Recorre una colección paginada de la API hasta `max` elementos. */
async function apiPaged (path, max = 200) {
  const items = []
  let next = path

  while (next && items.length < max) {
    const page = await api(next)
    if (!page) break
    items.push(...(page.items || []))
    next = page.next || null
  }

  return items.slice(0, max)
}

async function loadProfile () {
  try {
    state.profile = await api('/me')
    return state.profile
  } catch (error) {
    state.error = error?.message || 'No se pudo leer tu perfil.'
    return null
  }
}

/** Deja de esperar la vuelta del navegador sin marcarlo como error. */
function cancelConnecting () {
  state.connecting = false
}

export function useSpotify () {
  const connected = computed(() => !!token.value?.access_token)

  return {
    state,
    connected,
    cancelConnecting,
    clientId,
    setClientId,
    redirectUri,
    connect,
    disconnect,
    consumeRedirect,
    loadProfile,
    grantedScopes,
    missingScopes,
    adoptarSesionNativa,
    api,
    apiPaged
  }
}
