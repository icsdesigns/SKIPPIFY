/**
 * Comprobación de humo de los paneles de Inicio.
 *
 * Se generan historiales sintéticos con el resultado conocido de antemano y se
 * contrasta con lo que calculan `useAnalytics` y `useDuplicateStats`: es la
 * única forma de saber que «canciones de esta semana» o «+42 %» dicen lo que
 * parece que dicen y no lo que sale por casualidad con los datos reales.
 */
function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.document = {
    createElement: () => ({}),
    addEventListener () {},
    removeEventListener () {},
    visibilityState: 'visible'
  }
  globalThis.window = {
    localStorage: globalThis.localStorage,
    location: { origin: 'http://localhost' },
    addEventListener () {},
    removeEventListener () {}
  }
}
installBrowserGlobals()

const DIA = 86400000

async function main () {
  const { useEventStore } = await import('../src/stores/events.js')
  const { useAnalytics } = await import('../src/composables/useAnalytics.js')
  const { useDuplicateStats } = await import('../src/composables/useDuplicateStats.js')

  let fallos = 0
  function check (etiqueta, real, esperado) {
    const ok = esperado instanceof RegExp ? esperado.test(real) : Object.is(real, esperado)
    console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : `\n      esperado: ${JSON.stringify(esperado)} · recibido: ${JSON.stringify(real)}`}`)
    if (!ok) fallos++
  }

  const store = useEventStore()
  const analytics = useAnalytics()

  /** Crea una escucha `diasAtras` días antes de ahora (con minutos de desempate). */
  function escucha (diasAtras, track, artist, minutos = 0) {
    return {
      played_at: new Date(Date.now() - diasAtras * DIA + minutos * 60000).toISOString(),
      track,
      artist,
      duration_ms: 200000,
      ms_played: 180000
    }
  }

  // ── Canciones y artistas de la semana, con variación ───────────────────────
  console.log('\nCanciones y artistas (semana) con variación sobre la anterior')
  store.setEvents([
    // Semana en curso: 4 canciones distintas, 2 artistas distintos
    escucha(1, 'A', 'Ana'), escucha(2, 'B', 'Ana'), escucha(3, 'C', 'Beto'), escucha(4, 'D', 'Beto'),
    escucha(5, 'A', 'Ana', 5), // repetida: no debe contar dos veces
    // Semana anterior: 2 canciones distintas, 1 artista
    escucha(9, 'E', 'Ana'), escucha(10, 'F', 'Ana')
  ])
  check('canciones distintas de la semana', analytics.kpiTracks.value, 4)
  check('artistas distintos de la semana', analytics.kpiArtists.value, 2)
  check('canciones de la semana anterior', analytics.kpiTracksPrevWeek.value, 2)
  check('artistas de la semana anterior', analytics.kpiArtistsPrevWeek.value, 1)
  check('variación de canciones (4 vs 2)', analytics.kpiTracksChangePct.value, 100)
  check('variación de artistas (2 vs 1)', analytics.kpiArtistsChangePct.value, 100)

  console.log('\nCaídas y ausencia de base de comparación')
  store.setEvents([escucha(1, 'A', 'Ana'), escucha(9, 'B', 'Ana'), escucha(10, 'C', 'Ana'), escucha(11, 'D', 'Ana'), escucha(12, 'E', 'Ana')])
  check('variación negativa (1 vs 4)', analytics.kpiTracksChangePct.value, -75)
  store.setEvents([escucha(1, 'A', 'Ana'), escucha(2, 'B', 'Ana')])
  check('sin semana anterior no se inventa un porcentaje', analytics.kpiTracksChangePct.value, null)
  store.setEvents([])
  check('historial vacío da 0 canciones', analytics.kpiTracks.value, 0)
  check('y tampoco se pinta pastilla de porcentaje', analytics.kpiTracksChangePct.value, null)

  // ── Sesiones del año ──────────────────────────────────────────────────────
  console.log('\nSesiones del último año (corte a los 30 min de silencio)')
  store.setEvents([
    // Sesión 1: tres escuchas seguidas dentro de 20 min → dura 20 min
    escucha(3, 'A', 'Ana', 0), escucha(3, 'B', 'Ana', 10), escucha(3, 'C', 'Ana', 20),
    // Hueco de 60 min → sesión 2, de 10 min
    escucha(3, 'D', 'Ana', 80), escucha(3, 'E', 'Ana', 90),
    // Escucha de hace dos años: fuera de la ventana anual
    escucha(730, 'Z', 'Zoe', 0)
  ])
  check('sesiones detectadas en el año', analytics.sessionsYear.value.count, 2)
  check('duración media (20 y 10 min)', analytics.sessionsYear.value.averageMinutes, 15)
  check('la escucha de hace dos años queda fuera', analytics.yearEvents.value.length, 5)

  // ── Escuchas por día (el panel «Escuchas por día») ────────────────────────
  console.log('\nEscuchas por día')
  store.setEvents([escucha(0, 'A', 'Ana'), escucha(0, 'B', 'Ana', 1), escucha(2, 'C', 'Ana')])
  const chart = analytics.chartData.value
  check('siete columnas', chart.labels.length, 7)
  check('hoy suma 2', chart.data[6], 2)
  check('hace dos días suma 1', chart.data[4], 1)
  check('total de la semana', chart.data.reduce((a, b) => a + b, 0), 3)

  // ── Duplicadas de la semana ───────────────────────────────────────────────
  console.log('\nDuplicadas iniciadas y saltadas (semana)')
  function sello (diasAtras) {
    const d = new Date(Date.now() - diasAtras * DIA)
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  }
  const dias = [
    { day: sello(0), duplicates: 5, skipped: 4 },
    { day: sello(3), duplicates: 7, skipped: 2 },
    { day: sello(6), duplicates: 1, skipped: 1 },
    // Fuera de la semana en curso: cuentan para la anterior
    { day: sello(8), duplicates: 100, skipped: 50 },
    { day: sello(13), duplicates: 3, skipped: 3 },
    // Muy antiguo: no cuenta en ninguna de las dos
    { day: sello(40), duplicates: 999, skipped: 999 }
  ]
  globalThis.localStorage.setItem('skippify-duplicate-daily', JSON.stringify(dias))
  globalThis.window.Capacitor = {
    Plugins: { NotifListener: { getDailyStatsHistory: async () => ({ days: dias }) } }
  }
  const dup = useDuplicateStats()
  await dup.refresh()
  check('duplicadas iniciadas esta semana (5+7+1)', dup.weekDuplicates.value, 13)
  check('duplicadas saltadas esta semana (4+2+1)', dup.weekSkipped.value, 7)
  check('la semana anterior no se mezcla (100+3)', dup.previousWeek.value.duplicates, 103)
  check('lo de hace 40 días queda fuera', dup.week.value.duplicates + dup.previousWeek.value.duplicates, 116)
  check('hay dato, así que se pinta cifra y no «—»', dup.hasData.value, true)

  // ── Carteles de la semana (canción y artista) ─────────────────────────────
  console.log('\nCanción y artista de la semana')
  const { cancionTop, artistaTop, calcularVariedad, calcularExclusividad } = await import('../src/lib/inicioStats.js')
  store.setEvents([
    escucha(0, 'Canción X', 'Ana', 0), escucha(1, 'canción x ', 'ANA', 1), escucha(2, 'Canción X', 'Ana', 2),
    escucha(1, 'Y', 'Ana', 3), escucha(1, 'Z', 'Beto', 4), escucha(1, 'Z', 'Beto', 5),
    // Fuera de la semana: no cuenta
    escucha(9, 'Z', 'Beto', 6), escucha(9, 'Z', 'Beto', 7), escucha(9, 'Z', 'Beto', 8), escucha(9, 'Z', 'Beto', 9)
  ])
  const ct = cancionTop(analytics.weekEvents.value)
  check('canción de la semana (normalizada, sin lo de hace 9 días)', ct && ct.track, 'Canción X')
  check('recuento de la canción', ct && ct.count, 3)
  const at = artistaTop(analytics.weekEvents.value)
  check('artista de la semana por nombre normalizado', at && at.artist.toLowerCase(), 'ana')
  check('recuento del artista (3+1)', at && at.count, 4)
  check('sin escuchas no hay canción (sin NaN)', cancionTop([]), null)
  check('sin escuchas no hay artista', artistaTop([]), null)
  check('en empate gana la más reciente', cancionTop([
    { track: 'A', artist: 'a', played_at: '2026-01-01T10:00:00Z' },
    { track: 'B', artist: 'b', played_at: '2026-01-02T10:00:00Z' }
  ]).track, 'B')

  // ── Variedad y exclusividad (mensual) ─────────────────────────────────────
  console.log('\nVariedad y exclusividad')
  // 20 registradas + 5 saltadas = 25 iniciadas; 10 duplicadas → (25-10)/25 = 60 %
  check('variedad: (20+5-10)/(20+5)', calcularVariedad(20, 10, 5), 60)
  check('variedad sin duplicadas es 100 %', calcularVariedad(20, 0, 0), 100)
  check('variedad sin escuchas es null (no NaN)', calcularVariedad(0, 0, 0), null)
  check('variedad nunca baja de 0 %', calcularVariedad(1, 50, 0), 0)
  check('exclusividad: 5 de 10 = 50 %', calcularExclusividad(10, 5), 50)
  check('exclusividad sin duplicadas es null', calcularExclusividad(0, 0), null)
  check('exclusividad tope 100 %', calcularExclusividad(2, 9), 100)
  // Con el histórico del motor: hace 8 días (semana anterior) entra en el mes; hace 40 no
  check('el mes suma 5+7+1+100+3 duplicadas (sin lo de hace 40 días)', dup.monthDuplicates.value, 116)
  check('el mes suma 4+2+1+50+3 saltadas', dup.monthSkipped.value, 60)
  store.setEvents([escucha(0, 'A', 'Ana'), escucha(29, 'B', 'Ana'), escucha(31, 'C', 'Ana')])
  check('últimos 30 días: la de hace 31 queda fuera', analytics.last30Events.value.length, 2)

  // ── Rachas (actual / mejor) ───────────────────────────────────────────────
  console.log('\nRachas: actual / mejor')
  const W = await import('../src/lib/wrapped.js')
  const ahora = Date.now()
  // Hoy, ayer y anteayer (racha de 3) + otra racha anterior de 5 días seguidos
  const diasConEscucha = [0, 1, 2, 10, 11, 12, 13, 14]
  const r1 = W.calcularRacha(diasConEscucha.map(d => escucha(d, 'A', 'Ana')), ahora)
  check('racha actual de 3 días', r1.current, 3)
  check('mejor racha de 5 días', r1.best, 5)
  check('días activos', r1.activeDays, 8)
  check('sin escuchas no hay NaN', JSON.stringify(W.calcularRacha([], ahora)), '{"current":0,"best":0,"activeDays":0}')
  const r2 = W.calcularRacha([escucha(0, 'A', 'Ana')], ahora)
  check('la racha actual nunca supera a la mejor', r2.current <= r2.best, true)

  // ── Este dispositivo vs otros ─────────────────────────────────────────────
  console.log('\nEste dispositivo vs otros (30 días, campo source)')
  const conFuente = (dias, source, ms = 180000) => ({ ...escucha(dias, `Tema ${dias}`, 'Ana'), source, ms_played: ms })
  const rep = W.repartoDispositivos([
    conFuente(1, 'notification'), conFuente(2, 'notification_background'), conFuente(3, 'notification'),
    conFuente(4, 'spotify_api', 360000),
    { ...escucha(5, 'Sin fuente', 'Ana') }, // sin source: cuenta como este dispositivo
    conFuente(40, 'spotify_api') // fuera de los 30 días
  ], ahora)
  check('4 escuchas de este dispositivo (3 + sin fuente)', rep.este.count, 4)
  check('1 de otros dispositivos', rep.otros.count, 1)
  check('80 % este dispositivo', rep.pctEste, 80)
  check('20 % otros', rep.pctOtros, 20)
  check('los porcentajes suman 100', rep.pctEste + rep.pctOtros, 100)
  check('porcentaje por tiempo (720 s de 1080 s = 67 %)', rep.pctEsteTiempo, 67)
  check('hay lectura por API', rep.hayApi, true)
  const sinApi = W.repartoDispositivos([conFuente(1, 'notification')], ahora)
  check('sin API: 100 % este dispositivo', sinApi.pctEste, 100)
  check('sin API: no hay otros', sinApi.hayApi, false)
  const vacioRep = W.repartoDispositivos([], ahora)
  check('vacío: marca vacio y 0/0 sin NaN', JSON.stringify([vacioRep.vacio, vacioRep.pctEste, vacioRep.pctOtros, vacioRep.pctEsteTiempo]), '[true,0,0,null]')
  check('anuncios no cuentan', W.repartoDispositivos([{ ...conFuente(1, 'notification'), track: 'Anuncio' }], ahora).total, 0)

  // ── Wrapped: cálculos ─────────────────────────────────────────────────────
  console.log('\nWrapped: cálculos')
  const h = (dias, hora) => {
    const d = new Date(ahora - dias * DIA); d.setHours(hora, 0, 0, 0); return d.toISOString()
  }
  const hist = [
    { ...escucha(1, 'Uno', 'Ana'), played_at: h(1, 21) }, { ...escucha(1, 'uno', 'ANA'), played_at: h(1, 21) },
    { ...escucha(2, 'Uno', 'Ana'), played_at: h(2, 21) },
    { ...escucha(2, 'Dos', 'Beto'), played_at: h(2, 8) }, { ...escucha(3, 'Dos', 'Beto'), played_at: h(3, 8) },
    { ...escucha(3, 'Tres', 'Beto'), played_at: h(3, 21) },
    { ...escucha(3, 'Cuatro', 'Cleo'), played_at: h(3, 21) },
    { ...escucha(20, 'Antigua', 'Zoe'), played_at: h(20, 3) },
    { ...escucha(1, 'Anuncio', 'Spotify'), played_at: h(1, 5) }
  ]
  const ws = W.calcularWrapped(hist, 'week', ahora, { variedad: 82.4 })
  check('semana: 7 escuchas (sin anuncio ni la de hace 20 días)', ws.escuchas, 7)
  check('top 1 canción (agrupa mayúsculas y tildes)', ws.canciones[0].titulo, 'Uno')
  check('top 1 canción con 3 escuchas', ws.canciones[0].count, 3)
  check('máximo 3 canciones', ws.canciones.length, 3)
  check('top 1 artista', ws.artistas[0].nombre, 'Ana')
  check('hora favorita 21:00', ws.horaFavorita.etiqueta, '21:00')
  check('mejor racha de la semana (días 1, 2 y 3)', ws.mejorRacha, 3)
  check('variedad redondeada', ws.variedad, 82)
  check('tiempo total: 7 × 3 min = 21 min', ws.tiempo, '21 min')
  check('el mes sí incluye la de hace 20 días', W.calcularWrapped(hist, 'month', ahora).escuchas, 8)
  check('periodo desconocido cae en semana', W.calcularWrapped(hist, 'x', ahora).periodo, 'week')
  const wv = W.calcularWrapped([], 'year', ahora)
  check('vacío: sin NaN y con marca', JSON.stringify([wv.vacio, wv.escuchas, wv.tiempo, wv.horaFavorita, wv.mejorRacha, wv.variedad]), '[true,0,"0 min",null,0,null]')
  check('formato de duración con horas', W.formatearDuracion(3 * 3600000 + 5 * 60000), '3 h 5 min')
  check('formato de duración exacta', W.formatearDuracion(2 * 3600000), '2 h')

  // ── Wrapped: dibujo (contexto simulado) y recorte con measureText ─────────
  console.log('\nWrapped: imagen')
  const { recortarTexto, dibujarWrapped, WRAPPED_ANCHO, WRAPPED_ALTO } = await import('../src/lib/wrappedImagen.js')
  const ctxMedida = { measureText: t => ({ width: String(t).length * 10 }) }
  check('texto corto no se recorta', recortarTexto(ctxMedida, 'Hola', 100), 'Hola')
  const largo = recortarTexto(ctxMedida, 'Un título larguísimo que no cabe en la tarjeta', 150)
  check('texto largo termina en puntos suspensivos', largo.endsWith('…'), true)
  check('texto largo mide como mucho el máximo', largo.length * 10 <= 150, true)
  check('hueco nulo da cadena vacía', recortarTexto(ctxMedida, 'Hola', 0), '')
  globalThis.Path2D = class { constructor (d) { this.d = d } }
  const dibujados = []
  const grad = { addColorStop () {} }
  const ctxFalso = new Proxy({}, {
    get: (o, k) => {
      if (k === 'measureText') return t => ({ width: String(t).length * 14 })
      if (k === 'fillText') return (t, x) => dibujados.push({ t, x, align: o.textAlign })
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad
      if (k in o) return o[k]
      return () => {}
    },
    set: (o, k, v) => { o[k] = v; return true }
  })
  const lienzoFalso = { getContext: () => ctxFalso }
  const largoTit = 'Título extraordinariamente largo '.repeat(8)
  dibujarWrapped(lienzoFalso, W.calcularWrapped([
    { ...escucha(1, largoTit, 'Artista con un nombre también larguísimo '.repeat(6)), played_at: h(1, 10) }
  ], 'week', ahora, { variedad: 90 }))
  check('lienzo de 1080 × 1920', `${lienzoFalso.width}x${lienzoFalso.height}`, `${WRAPPED_ANCHO}x${WRAPPED_ALTO}`)
  check('ningún texto dibujado supera el ancho de la tarjeta', dibujados.every(d => d.t.length * 14 <= 952), true)
  check('el título largo se recortó con puntos suspensivos', dibujados.some(d => d.t.startsWith('Título extra') && d.t.endsWith('…')), true)
  dibujarWrapped(lienzoFalso, W.calcularWrapped([], 'month', ahora))
  check('sin datos también se dibuja', dibujados.some(d => d.t === 'Aún sin escuchas en este periodo'), true)

  // ── Compartir / guardar ───────────────────────────────────────────────────
  console.log('\nCompartir imagen')
  const { compartirPng } = await import('../src/lib/compartirImagen.js')
  const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
  let compartidos = 0
  const navOk = { canShare: () => true, share: async () => { compartidos++ } }
  check('con navigator.share de archivos se comparte', (await compartirPng(png, 'a.png', {}, { navigator: navOk, nativo: true })).estado, 'compartido')
  check('se llamó a share una vez', compartidos, 1)
  const navCancel = { canShare: () => true, share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e } }
  check('cancelar no guarda ni falla', (await compartirPng(png, 'a.png', {}, { navigator: navCancel, nativo: true })).estado, 'cancelado')
  let guardado = ''
  const guardar = async (b, n) => { guardado = n }
  const navSin = { canShare: () => false, share: async () => {} }
  const rg = await compartirPng(png, 'w.png', {}, { navigator: navSin, nativo: true, guardar })
  check('sin soporte en nativo se guarda en Documentos', rg.estado, 'guardado')
  check('y se devuelve la ruta', rg.ruta, 'Documents/Skippify/wrapped/w.png')
  check('el archivo se escribió', guardado, 'w.png')
  const navRoto = { canShare: () => true, share: async () => { throw new Error('NotAllowedError') } }
  check('si share falla en nativo se guarda', (await compartirPng(png, 'w.png', {}, { navigator: navRoto, nativo: true, guardar })).estado, 'guardado')

  console.log(fallos ? `\nFallos: ${fallos}` : '\nInicio: todo correcto.')
  process.exit(fallos ? 1 : 0)
}

main()
