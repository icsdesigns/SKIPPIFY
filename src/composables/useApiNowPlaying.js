/**
 * useApiNowPlaying — enseña en «Reproducción actual» lo que suena en la cuenta
 * de Spotify cuando las notificaciones no lo ven (por ejemplo, en otro móvil, un
 * altavoz o el ordenador).
 *
 * Es sólo la parte de la pantalla: pregunta al nativo qué suena ahora
 * (`/me/player`) mientras la app está a la vista y rellena el cartel. NO anota
 * nada en el historial ni en las estadísticas —de eso se encarga el sondeo de
 * `recently-played` del servicio—, así que una canción nunca se cuenta dos veces
 * por haberse visto en directo.
 *
 * La notificación manda: si ya hay una canción sonando que vino de ella, se deja
 * en paz. Sólo se toma el relevo cuando está parada o en pausa, o cuando lo que
 * hay lo puso esta misma función.
 */

/** Entre consulta y consulta mientras todo va bien. */
const PERIODO_MS = 10_000
/** Si la API está apagada, sin sesión o limitando, se mira con calma. */
const PERIODO_LENTO_MS = 60_000

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

/**
 * Convierte la respuesta del nativo en el estado del cartel, o null si no hay
 * nada que enseñar. Aparte para poder probarla sin Capacitor.
 */
export function estadoDeApi (r, ahora = Date.now()) {
  if (!r || r.state !== 'ok' || !r.track) return null
  const durationMs = Number(r.durationMs || 0)
  const progressMs = Number(r.progressMs || 0)
  const progressPct = durationMs > 0 ? Math.min(100, Math.max(0, (progressMs / durationMs) * 100)) : null
  return {
    mode: r.isPlaying ? 'playing' : 'paused',
    track: r.track,
    artist: r.artist || '',
    album: r.album || '',
    meta: r.device ? `En ${r.device} · vía Spotify` : 'Vía Spotify',
    progressPct,
    durationMs: durationMs > 0 ? durationMs : null,
    progressSyncedAt: progressPct === null ? null : ahora
  }
}

/**
 * Decide qué hacer con una respuesta.
 *   · 'poner' con el estado nuevo, 'parar' si lo que enseñábamos ya no suena,
 *     o null si no hay que tocar nada.
 */
export function decidir ({ respuesta, modoActual, mandaApi }) {
  // Sólo «idle» es una respuesta fiable de que no suena nada; un error o un
  // límite de peticiones no deben apagar el cartel.
  if (respuesta?.state === 'idle') return mandaApi ? { accion: 'parar' } : null

  const estado = estadoDeApi(respuesta)
  if (!estado) return null

  // Una canción en marcha que vino de la notificación no se pisa.
  if (modoActual === 'playing' && !mandaApi) return null
  // En pausa por notificación pero sonando en otro sitio: sí se toma el relevo.
  if (!mandaApi && modoActual === 'paused' && estado.mode === 'paused') return null
  return { accion: 'poner', estado }
}

export function useApiNowPlaying () {
  let timer = null
  let activo = false
  let mandaApi = false
  let cb = null

  async function consultar () {
    const NL = plugin()
    if (!NL?.getApiNowPlaying) return PERIODO_LENTO_MS
    let respuesta = null
    try {
      respuesta = await NL.getApiNowPlaying()
    } catch {
      return PERIODO_LENTO_MS
    }

    const d = decidir({ respuesta, modoActual: cb.leerModo(), mandaApi })
    if (d?.accion === 'poner') {
      mandaApi = true
      cb.poner(d.estado)
    } else if (d?.accion === 'parar') {
      mandaApi = false
      cb.poner({ mode: 'stopped', progressPct: null, durationMs: null, progressSyncedAt: null })
    }
    return respuesta?.state === 'ok' || respuesta?.state === 'idle' ? PERIODO_MS : PERIODO_LENTO_MS
  }

  async function ciclo () {
    timer = null
    if (!activo) return
    let siguiente = PERIODO_LENTO_MS
    if (document.visibilityState === 'visible') siguiente = await consultar()
    if (activo) timer = setTimeout(ciclo, siguiente)
  }

  function alVolver () {
    if (!activo || document.visibilityState !== 'visible') return
    clearTimeout(timer)
    timer = setTimeout(ciclo, 0)
  }

  /**
   * @param {{ leerModo: () => string, poner: (estado: object) => void }} manos
   *   cómo leer el modo actual del cartel y cómo cambiarlo.
   */
  function start (manos) {
    if (activo || !plugin()?.getApiNowPlaying) return
    cb = manos
    activo = true
    document.addEventListener('visibilitychange', alVolver)
    timer = setTimeout(ciclo, 1500)
  }

  function stop () {
    activo = false
    clearTimeout(timer)
    timer = null
    document.removeEventListener('visibilitychange', alVolver)
  }

  /** La notificación ha puesto su estado: desde ahora manda ella. */
  function alLlegarNotificacion () {
    mandaApi = false
  }

  return { start, stop, alLlegarNotificacion }
}
