/**
 * Comprobación de humo de las macros: verifica que los casos que Spotify
 * rechaza con 403 se detectan ANTES de escribir nada y se explican en
 * castellano, en vez de propagar el «Forbidden» pelado de la API.
 */
function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.window = { localStorage: globalThis.localStorage, location: { origin: 'http://localhost' }, addEventListener () {} }
  // El almacén de eventos (historial de escuchas) registra un listener al importarse.
  globalThis.document = { visibilityState: 'visible', addEventListener () {}, removeEventListener () {}, createElement: () => ({ content: {} }) }
}
installBrowserGlobals()

async function main () {
const {
  preflightMacro, explainSpotifyError, runMacro, validateDraft, useMacros, createMacro, deleteMacro, historialDe, historialPorDia,
  describeMacro, normalizeAfterPlays, decidirTrasEscuchas, claveCancion, contarEscuchas
} = await import('../src/composables/useMacros.js')
const { nextTick } = await import('vue')

let failures = 0
function check (label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${ok ? '' : `\n      recibido: ${JSON.stringify(actual)}`}`)
  if (!ok) failures++
}

/** Spotify falso: registra toda escritura para probar que no ocurre ninguna. */
function fakeSpotify ({ product = 'premium', scope = 'ALL', playlists = {} } = {}) {
  const writes = []
  const ALL = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative '
    + 'playlist-modify-private playlist-modify-public user-library-read user-library-modify '
    + 'user-read-recently-played user-read-currently-playing user-read-playback-state '
    + 'user-modify-playback-state user-top-read user-follow-read'
  const granted = (scope === 'ALL' ? ALL : scope).split(/\s+/).filter(Boolean)

  return {
    writes,
    state: { profile: { id: 'yo', product } },
    loadProfile: async () => ({ id: 'yo', product }),
    missingScopes: (needed) => needed.filter(s => !granted.includes(s)),
    api: async (path, options = {}) => {
      const method = (options.method || 'GET').toUpperCase()
      if (method !== 'GET') { writes.push(`${method} ${path}`); return {} }
      const match = /^\/playlists\/([^/?]+)/.exec(path)
      if (match) {
        const pl = playlists[match[1]]
        if (!pl) { const e = new Error('Not found'); e.status = 404; e.path = path; throw e }
        return pl
      }
      return { items: [] }
    },
    apiPaged: async () => []
  }
}

const own = { id: 'A', name: 'Mía', owner: { id: 'yo' }, collaborative: false }
const alien = { id: 'B', name: 'Éxitos España', owner: { id: 'spotify', display_name: 'Spotify' }, collaborative: false }
const collab = { id: 'C', name: 'Compartida', owner: { id: 'otro' }, collaborative: true }
const playlists = { A: own, B: alien, C: collab }

console.log('\nPreflight: escritura en playlist ajena')
check('copiar a playlist ajena se bloquea',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'B' } },
    fakeSpotify({ playlists })),
  /no es colaborativa/)
check('copiar a playlist propia pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ playlists })), '')
check('copiar a playlist colaborativa pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'C' } },
    fakeSpotify({ playlists })), '')
check('mover desde playlist ajena se bloquea (el origen también se escribe)',
  await preflightMacro(
    { source: { type: 'playlist_all', playlistId: 'B' }, action: { type: 'move' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ playlists })),
  /no es colaborativa/)

console.log('\nPreflight: Premium y permisos')
check('encolar sin Premium se bloquea',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'queue' } },
    fakeSpotify({ product: 'free', playlists })),
  /requiere Spotify Premium/)
check('encolar con Premium pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'queue' } },
    fakeSpotify({ playlists })), '')
check('permiso ausente se detecta',
  await preflightMacro(
    { source: { type: 'liked_new' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ scope: 'playlist-modify-private playlist-modify-public', playlists })),
  /user-library-read/)

console.log('\nrunMacro no escribe nada cuando el preflight falla')
const spy = fakeSpotify({ playlists })
const macro = {
  source: { type: 'playlist_all', playlistId: 'A', playlistName: 'Mía' },
  action: { type: 'copy' },
  target: { type: 'playlist', playlistId: 'B', playlistName: 'Éxitos España' },
  cursor: { seen: [], lastRunAt: null },
  stats: { runs: 0, applied: 0, lastResult: '' }
}
const result = await runMacro(macro, spy)
check('devuelve el motivo real', result.error, /no es colaborativa/)
check('no ha hecho ninguna escritura', spy.writes.length, 0)
check('lo deja anotado en la macro', macro.stats.lastResult, /^Bloqueada:/)

console.log('\nTraducción del 403 pelado de Spotify')
const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
check('403 sobre playlist', explainSpotifyError(forbidden, { scope: 'playlist', playlistName: 'Éxitos' }), /«Éxitos».*no es tuya/)
check('403 de Premium', explainSpotifyError(Object.assign(new Error('Player command failed: Premium required'), { status: 403 })), /Premium/)
check('403 de modo desarrollo', explainSpotifyError(Object.assign(new Error('Check settings on developer.spotify.com/dashboard, the user may not be registered.'), { status: 403 })), /modo desarrollo/)
check('403 sin contexto no deja «Forbidden» a secas', explainSpotifyError(forbidden), /playlist que no es tuya/)
check('404 del reproductor', explainSpotifyError(Object.assign(new Error('No active device found'), { status: 404 }), { scope: 'player' }), /dispositivo activo/)

console.log('\nErrores que antes se quedaban en «Error desconocido»')
check('429 explica el cupo agotado y cuánto esperar',
  explainSpotifyError(Object.assign(new Error('API rate limit exceeded'), { status: 429, retryAfter: 120 })),
  /cupo de peticiones.*2 min/)
check('5xx se atribuye a Spotify', explainSpotifyError(Object.assign(new Error(''), { status: 503 })), /fallando por su lado/)
check('sin red se dice que no hay conexión', explainSpotifyError(new TypeError('Failed to fetch')), /No hay conexión/)
check('un código raro no se traga la causa',
  explainSpotifyError(Object.assign(new Error('Bad gateway thing'), { status: 418, path: '/me/tracks?limit=50' })),
  /418.*\/me\/tracks/)

console.log('\nMacros guardadas por versiones anteriores')
for (const [label, partial] of [
  ['sin cursor ni stats', {}],
  ['sin cursor', { stats: { runs: 0, applied: 0, lastResult: '' } }],
  ['sin stats', { cursor: { seen: [], lastRunAt: null } }]
]) {
  const vieja = {
    id: 'vieja',
    source: { type: 'current_track' },
    action: { type: 'copy' },
    target: { type: 'playlist', playlistId: 'A' },
    ...partial
  }
  let salida
  try {
    salida = await runMacro(vieja, fakeSpotify({ playlists }))
  } catch (e) {
    salida = { error: `EXCEPCIÓN NO RECOGIDA: ${e.message}` }
  }
  check(`macro ${label} no revienta`, salida.error, '')
}

console.log('\nTope de canciones por ejecución (protege el cupo de la app)')
const muchas = Array.from({ length: 120 }, (_, i) => ({
  track: { id: `t${i}`, uri: `spotify:track:t${i}`, name: `S${i}`, type: 'track', is_local: false, artists: [] }
}))
function spotifyConPlaylistLarga () {
  const base = fakeSpotify({ playlists })
  return { ...base, apiPaged: async () => muchas }
}
const enCola = await runMacro(
  { id: 'q', source: { type: 'playlist_all', playlistId: 'A' }, action: { type: 'queue' }, target: null,
    cursor: { seen: [], lastRunAt: null }, stats: { runs: 0, applied: 0, lastResult: '' } },
  spotifyConPlaylistLarga())
check('encolar procesa como mucho 40 por vuelta', enCola.applied, 40)
check('y avisa de que ha quedado a medias', enCola.limited, true)

console.log('\nEl fichero no arrastra bytes corruptos')
const fuente = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/composables/useMacros.js', import.meta.url)))
check('sin bytes NUL en useMacros.js', fuente.includes(0), false)

console.log('\nNo se usan endpoints retirados por Spotify')
// Spotify jubiló estas rutas: siguen existiendo pero responden 403 «Forbidden»
// incluso sobre playlists propias. Volver a escribirlas rompería TODAS las macros.
const texto = fuente.toString('utf8')
for (const [etiqueta, patron] of [
  ['/playlists/{id}/tracks', /\/playlists\/\$\{[^}]+\}\/tracks/],
  ['POST /users/{id}/playlists', /\/users\/\$\{[^}]+\}\/playlists/],
  ['PUT|DELETE /me/tracks', /'\/me\/tracks'/]
]) check(`no aparece ${etiqueta}`, patron.test(texto), false)

console.log('\nPuente con el servicio nativo')
{
  // Plugin de Capacitor de mentira: anota lo que la app le manda y responde
  // como respondería el servicio de Android.
  const recibido = { macros: null, ejecutado: 0 }

  // Se imita la regla de MacroRunner.esDeSegundoPlano: los orígenes de playlist
  // necesitan su playlist, y el resto los gobierna el servicio.
  const gobernadas = (m) => (m || [])
    .filter(x => x.enabled && (
      x.source === 'current_track'
      || (['playlist_new', 'playlist_all'].includes(x.source) && x.sourcePlaylistId)
      || ['recently_played', 'liked_new', 'top_tracks'].includes(x.source)
    ))
    .map(x => x.id)

  globalThis.window.Capacitor = {
    Plugins: {
      NotifListener: {
        setBackgroundMacros: async ({ macros: m }) => {
          recibido.macros = m
          return { ids: gobernadas(m), stats: [] }
        },
        getBackgroundMacroState: async () => ({
          ids: gobernadas(recibido.macros),
          stats: [{ id: (recibido.macros || []).find(x => x.source === 'current_track')?.id,
                    runs: 7, applied: 5, lastResult: 'En segundo plano: «X» a la cola', lastRunAt: 1788000000000 }]
        }),
        runBackgroundMacrosNow: async () => {
          recibido.ejecutado++
          const id = (recibido.macros || []).find(x => x.source === 'current_track')?.id
          return { track: 'spotify:track:abc', detalle: [{ id, status: 0, message: 'ok', matched: 1, applied: 1 }] }
        }
      }
    }
  }

  const api = useMacros()

  const enVivo = createMacro({
    name: 'la que suena → cola',
    source: { type: 'current_track' },
    action: { type: 'queue' },
    target: null
  })
  const dePlaylist = createMacro({
    name: 'novedades → me gusta',
    source: { type: 'playlist_new', playlistId: 'A', playlistName: 'Mía' },
    action: { type: 'copy' },
    target: { type: 'liked' }
  })

  await nextTick()
  await api.sincronizarConNativo()

  check('las macros llegan al servicio', Array.isArray(recibido.macros), true)
  check('en la forma reducida que entiende',
    JSON.stringify(recibido.macros.find(m => m.id === enVivo.id)),
    JSON.stringify({ id: enVivo.id, name: enVivo.name, enabled: true, source: 'current_track', action: 'queue', target: '', targetPlaylistId: '', sourcePlaylistId: '' }))

  check('el servicio gobierna la de canción actual', api.correEnSegundoPlano(enVivo), true)
  // Con la playlist de origen puesta, esta también la gobierna el servicio.
  check('y también la de novedades de playlist', api.correEnSegundoPlano(dePlaylist), true)

  await api.refrescarEstadoNativo()
  check('sus estadísticas llegan a la app', api.estadisticasNativas(enVivo)?.runs, 7)

  // «Ejecutar» sobre una macro del servicio NO debe correr aquí: si corriera en
  // los dos sitios, la canción entraría dos veces en la playlist destino.
  const spy = fakeSpotify({ playlists })
  const r = await api.runMacro(enVivo)
  check('«Ejecutar» se delega al servicio', recibido.ejecutado, 1)
  check('y devuelve lo aplicado', r.applied, 1)
  check('sin escribir nada desde la app', spy.writes.length, 0)

  // La vista previa se resuelve siempre en la app: no escribe nada.
  const antes = recibido.ejecutado
  await api.runMacro(enVivo, { dryRun: true })
  check('la vista previa no molesta al servicio', recibido.ejecutado, antes)

  deleteMacro(enVivo.id)
  deleteMacro(dePlaylist.id)
  await nextTick()
  delete globalThis.window.Capacitor
}

console.log('\nSesión: el nativo es el dueño del refresco')
{
  const { adoptarSesionNativa } = await import('../src/composables/useSpotify.js')
  globalThis.localStorage.setItem('skippify-spotify-token', JSON.stringify({
    access_token: 'VIEJO', refresh_token: 'R', scope: 'a b', expires_at: 1000
  }))
  globalThis.window.Capacitor = {
    Plugins: {
      NotifListener: {
        getSpotifySession: async () => ({
          connected: true, accessToken: 'NUEVO', expiresAt: 999999999999, scope: 'a b'
        })
      }
    }
  }
  const adoptado = await adoptarSesionNativa()
  check('la app adopta el token que refrescó el servicio', adoptado, true)
  const guardado = JSON.parse(globalThis.localStorage.getItem('skippify-spotify-token'))
  check('y lo guarda', guardado.access_token, 'NUEVO')
  check('conservando el refresh token, que no viaja de vuelta', guardado.refresh_token, 'R')

  // Si el de la app es más fresco, no se pisa: el servicio puede llevar días
  // sin ejecutarse mientras la app ha renovado por su cuenta.
  globalThis.window.Capacitor.Plugins.NotifListener.getSpotifySession =
    async () => ({ connected: true, accessToken: 'ANTIGUO', expiresAt: 1, scope: '' })
  check('no adopta uno más viejo', await adoptarSesionNativa(), false)
  check('y el bueno sigue en su sitio',
    JSON.parse(globalThis.localStorage.getItem('skippify-spotify-token')).access_token, 'NUEVO')

  // Sin puente nativo no pasa nada: la app funciona igual que siempre.
  delete globalThis.window.Capacitor
  check('sin servicio nativo, no adopta nada', await adoptarSesionNativa(), false)
}

// ── Historial de 7 días ──────────────────────────────────────────────────────
// Un contador acumulado no dice si la macro sigue viva: sube igual si lo último
// que hizo fue anteayer. Estas comprobaciones son sobre el día a día.
{
  console.log('\nHistorial de los últimos 7 días')
  delete globalThis.window.Capacitor

  const m = createMacro({
    name: 'historial',
    source: { type: 'current_track' },
    action: { type: 'copy' },
    target: { type: 'liked' }
  })

  // Con una canción sonando: se aplica y queda anotado.
  const conCancion = fakeSpotify({})
  const apiOriginal = conCancion.api
  conCancion.api = async (path, options) => (path.startsWith('/me/player/currently-playing')
    ? { item: { id: 'x1', uri: 'spotify:track:x1', name: 'X', type: 'track', artists: [{ name: 'A' }] } }
    : apiOriginal(path, options))

  await runMacro(m, conCancion)
  check('la ejecución queda anotada', m.historial.length, 1)
  check('con lo aplicado', m.historial[0].applied, 1)
  check('y marcada como de la app', m.historial[0].origen, 'app')

  // Un fallo también deja rastro, que es justo lo que interesa poder mirar.
  const roto = fakeSpotify({})
  roto.api = async () => { const e = new Error('Forbidden'); e.status = 403; e.path = '/me/library'; throw e }
  await runMacro(m, roto)
  check('los errores también', m.historial[0].status, 2)
  check('sin perder la anterior', m.historial.length, 2)

  // Lo de hace ocho días se cae solo.
  m.historial.push({ at: Date.now() - 8 * 24 * 3600 * 1000, status: 0, applied: 3, message: 'viejo', origen: 'app' })
  check('lo de hace más de 7 días no cuenta', historialDe(m).some(e => e.message === 'viejo'), false)

  // Y lo del servicio se mezcla con lo de la app, más reciente primero.
  globalThis.window.Capacitor = {
    Plugins: {
      NotifListener: {
        setBackgroundMacros: async () => ({ ids: [m.id], stats: [] }),
        getBackgroundMacroState: async () => ({
          ids: [m.id],
          stats: [{ id: m.id, runs: 2, applied: 2, lastResult: 'ok', lastRunAt: Date.now(),
                    historial: [{ at: Date.now(), status: 0, applied: 2, message: 'desde el servicio' }] }]
        })
      }
    }
  }
  const api2 = useMacros()
  await api2.refrescarEstadoNativo()
  check('se mezcla con lo del servicio', historialDe(m)[0].origen, 'servicio')
  check('agrupado por días', historialPorDia(m)[0].dia, new Date().toISOString().slice(0, 10))
  check('con el total del día', historialPorDia(m)[0].ejecuciones >= 3, true)

  delete globalThis.window.Capacitor
  deleteMacro(m.id)
}

// ── Disparador «tras N escuchas» ─────────────────────────────────────────────
{
  console.log('\nDisparador «tras N escuchas»')
  const DIA = 24 * 3600 * 1000
  const ahora = Date.now()

  check('N por defecto 3 y ventana 7', JSON.stringify(normalizeAfterPlays({})), '{"plays":3,"windowDays":7}')
  check('N fuera de rango vuelve a 3', normalizeAfterPlays({ plays: 11 }).plays, 3)
  check('N=2 y N=10 valen', normalizeAfterPlays({ plays: 2 }).plays + normalizeAfterPlays({ plays: 10 }).plays, 12)
  check('la ventana de 30 días vale', normalizeAfterPlays({ windowDays: 30 }).windowDays, 30)
  check('otra ventana vuelve a 7', normalizeAfterPlays({ windowDays: 14 }).windowDays, 7)

  check('sin llegar a N faltan', decidirTrasEscuchas(2, 3, 0, ahora, 7 * DIA), 'faltan')
  check('al alcanzar N toca', decidirTrasEscuchas(3, 3, 0, ahora, 7 * DIA), 'toca')
  check('ya ejecutada no se repite', decidirTrasEscuchas(8, 3, ahora - DIA, ahora, 7 * DIA), 'ya_hecha')
  check('ventana vencida con N nuevas vuelve a tocar', decidirTrasEscuchas(3, 3, ahora - 8 * DIA, ahora, 7 * DIA), 'toca')
  check('ventana vencida con pocas no toca', decidirTrasEscuchas(1, 3, ahora - 8 * DIA, ahora, 7 * DIA), 'faltan')

  check('mayúsculas y tildes dan la misma clave',
    claveCancion('Canción de CUNA', 'Ñengo Flow'), claveCancion('cancion de cuna', 'nengo flow'))
  check('sólo el primer artista', claveCancion('Tema', 'Ana, Luis & Eva'), claveCancion('Tema', 'ana'))
  check('sin título no hay clave', claveCancion(' ', 'x'), '')

  const eventos = [
    { played_at: new Date(ahora - 2 * DIA).toISOString(), track: 'CANCION DE CUNA', artist: 'nengo flow' },
    { played_at: new Date(ahora - 1 * DIA).toISOString(), track: 'canción de cuna', artist: 'Ñengo Flow' },
    { played_at: new Date(ahora - 9 * DIA).toISOString(), track: 'Canción de Cuna', artist: 'Ñengo Flow' },
    { played_at: new Date(ahora - DIA).toISOString(), track: 'Otra', artist: 'Alguien' }
  ]
  check('cuenta con tildes y mayúsculas, dentro de la ventana',
    contarEscuchas(eventos, 'Canción de Cuna', 'Ñengo Flow', ahora - 7 * DIA), 2)
  check('con 30 días entra la de hace 9', contarEscuchas(eventos, 'Canción de Cuna', 'Ñengo Flow', ahora - 30 * DIA), 3)

  check('describe el origen con N y ventana',
    describeMacro({ source: { type: 'after_plays', plays: 4, windowDays: 30 }, action: { type: 'copy' }, target: { type: 'liked' } }),
    /Canción tras 4 escuchas en 30 días → copiar → Tus me gusta/)
  const base = { action: { type: 'copy' }, target: { type: 'liked' } }
  check('valida N en rango', validateDraft({ ...base, source: { type: 'after_plays', plays: 3, windowDays: 7 } }), '')
  check('rechaza N=1', validateDraft({ ...base, source: { type: 'after_plays', plays: 1, windowDays: 7 } }), /entre 2 y 10/)
  check('rechaza ventana rara', validateDraft({ ...base, source: { type: 'after_plays', plays: 3, windowDays: 5 } }), /7 o 30/)
  check('mover no vale con este origen',
    validateDraft({ source: { type: 'after_plays', plays: 3, windowDays: 7 }, action: { type: 'move' }, target: { type: 'liked' } }), /Mover solo/)

  const guardada = createMacro({ name: 't', source: { type: 'after_plays', plays: 99, windowDays: 3 }, action: { type: 'copy' }, target: { type: 'liked' } })
  check('al guardar se sanean los ajustes', JSON.stringify([guardada.source.plays, guardada.source.windowDays]), '[3,7]')

  // Ejecución con Spotify falso: la canción suena y tiene ya 2 escuchas previas.
  const sp = fakeSpotify({})
  const original = sp.api
  sp.api = async (path, options) => (path.startsWith('/me/player/currently-playing')
    ? { item: { id: 'c1', uri: 'spotify:track:c1', name: 'Canción de Cuna', type: 'track', artists: [{ name: 'Ñengo Flow' }] } }
    : original(path, options))
  const m = createMacro({ name: 'tras', source: { type: 'after_plays', plays: 3, windowDays: 7 }, action: { type: 'copy' }, target: { type: 'liked' } })

  let r = await runMacro(m, sp, { events: eventos.slice(0, 1) })
  check('con 2 de 3 no actúa', r.applied, 0)
  check('y lo explica', r.nota, /2 de 3/)
  check('sin escrituras', sp.writes.length, 0)

  r = await runMacro(m, sp, { dryRun: true, events: eventos })
  check('la vista previa dice que se procesaría', r.matched, 1)
  check('sin escribir', sp.writes.length, 0)

  r = await runMacro(m, sp, { events: eventos })
  check('con 3 de 3 actúa', r.applied, 1)
  check('una sola escritura, en Tus me gusta', sp.writes.length === 1 && /\/me\/library/.test(sp.writes[0]), true)
  check('queda anotada la canción', Object.keys(m.cursor.tras).length, 1)

  r = await runMacro(m, sp, { events: eventos })
  check('la segunda vez no se repite', r.applied, 0)
  check('y lo dice', r.nota, /Ya se ejecutó/)
  check('sigue habiendo una sola escritura', sp.writes.length, 1)

  const nada = fakeSpotify({})
  r = await runMacro(m, nada, { events: eventos })
  check('sin canción sonando no hace nada', r.applied, 0)
  deleteMacro(m.id)
  deleteMacro(guardada.id)
}

console.log('\nvalidateDraft corta al crear la macro')
check('destino no escribible',
  validateDraft({ source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'B', playlistWritable: false } }),
  /no es tuya ni colaborativa/)
check('destino escribible pasa',
  validateDraft({ source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A', playlistWritable: true } }), '')

console.log(failures ? `\nFallos: ${failures}` : '\nMacros: todo correcto.')
process.exit(failures ? 1 : 0)
}

main()
