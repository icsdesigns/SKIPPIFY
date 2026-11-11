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

  // Avisos de Spotify: ni «A continuación» ni «Up next» del DJ pueden ser la canción de la semana
  const { esExcluida } = await import('../src/lib/wrapped.js')
  const avisos = [
    { track: 'A continuación', artist: 'DJ', played_at: '2026-01-05T10:00:00Z' },
    { track: 'A continuación', artist: 'DJ', played_at: '2026-01-05T10:05:00Z' },
    { track: 'Up next', artist: 'Spotify', played_at: '2026-01-05T10:10:00Z' },
    { track: 'Up Next', artist: 'DJ X', played_at: '2026-01-05T10:15:00Z' },
    { track: 'Up next', artist: 'Alguien', played_at: '2026-01-05T10:20:00Z' },
    { track: 'Advertisement', artist: 'Spotify', played_at: '2026-01-05T10:25:00Z' },
    { track: 'Canción real', artist: 'Ana', played_at: '2026-01-05T11:00:00Z' }
  ]
  check('los avisos del DJ y los anuncios están excluidos',
    avisos.filter(esExcluida).map(e => e.track).join('|'),
    'A continuación|A continuación|Up next|Up Next|Up next|Advertisement')
  check('la canción de la semana ignora los avisos de Spotify', cancionTop(avisos).track, 'Canción real')
  check('el artista de la semana ignora a «DJ»', artistaTop(avisos).artist, 'Ana')
  check('una canción real parecida sí cuenta', esExcluida({ track: 'Up Where We Belong', artist: 'Banda' }), false)
  check('el aviso con texto detrás también se excluye', esExcluida({ track: 'A continuación: tu mezcla', artist: 'DJ' }), true)
  check('«Siguiente» como canción real sí cuenta', esExcluida({ track: 'Siguiente', artist: 'Banda' }), false)
  check('sólo avisos: no hay canción de la semana', cancionTop(avisos.slice(0, 4)), null)

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

  // ── Wrapped: cálculos (sólo mensual, últimos 30 días) ─────────────────
  console.log('\nWrapped: cálculos (mes = últimos 30 días)')
  const h = (dias, hora, min = 0) => {
    const d = new Date(ahora - dias * DIA); d.setHours(hora, min, 0, 0); return d.toISOString()
  }
  const hist = [
    // Día 1: sesión de 20 min (21:00, 21:10, 21:20)
    { ...escucha(1, 'Uno', 'Ana'), played_at: h(1, 21, 0) }, { ...escucha(1, 'uno', 'ANA'), played_at: h(1, 21, 10) },
    { ...escucha(1, 'Úno', 'Ána'), played_at: h(1, 21, 20) },
    // Día 2: sesión de 10 min (8:00, 8:10); el anuncio de las 8:05 cae dentro
    { ...escucha(2, 'Dos', 'Beto'), played_at: h(2, 8, 0) }, { ...escucha(2, 'Dos', 'Beto'), played_at: h(2, 8, 10) },
    { ...escucha(2, 'Anuncio', 'Spotify'), played_at: h(2, 8, 5) },
    // Día 3: 21:00 y una escucha sin título a las 21:05 → sesión de 5 min
    { ...escucha(3, 'Tres', 'Beto'), played_at: h(3, 21, 0) },
    { ...escucha(3, '', 'Beto'), played_at: h(3, 21, 5) },
    // Día 20: dentro del mes; 3:00 y 3:30 (justo 30 min: no parte la sesión)
    { ...escucha(20, 'Cuatro', 'Cleo'), played_at: h(20, 3, 0) }, { ...escucha(20, 'Cinco', 'Zoe'), played_at: h(20, 3, 30) },
    // Fuera de los 30 días
    { ...escucha(31, 'Antigua', 'Yago'), played_at: h(31, 3) }
  ]
  const wm = W.calcularWrapped(hist, ahora, { variedad: 82.4 })
  check('ventana de 30 días', W.DIAS_WRAPPED, 30)
  check('título y rango mensuales', `${wm.titulo} · ${wm.rango}`, 'Tu mes en música · Últimos 30 días')
  check('trae las fechas del rango', /^\d{1,2} \S+ – \d{1,2} \S+$/.test(wm.fechas), true)
  check('tiempo: 9 escuchas × 3 min (sin anuncio ni la de hace 31 días)', wm.tiempo, '27 min')
  check('top 1 canción (agrupa mayúsculas y tildes)', wm.canciones[0].titulo, 'Uno')
  check('top 1 canción con 3 escuchas', wm.canciones[0].count, 3)
  check('top 2 canción', wm.canciones[1].titulo, 'Dos')
  check('máximo 3 canciones', wm.canciones.length, 3)
  check('top 1 artista: Beto (4, con la escucha sin título)', wm.artistas[0].nombre, 'Beto')
  check('top 2 artista: Ana', wm.artistas[1].nombre, 'Ana')
  check('máximo 3 artistas', wm.artistas.length, 3)
  check('artistas distintos: Ana, Beto, Cleo y Zoe (sin Spotify ni Yago)', wm.artistasDistintos, 4)
  check('canciones distintas: Uno, Dos, Tres, Cuatro y Cinco', wm.cancionesDistintas, 5)
  check('variedad redondeada', wm.variedad, 82)
  check('variedad fuera de rango se acota', W.calcularWrapped(hist, ahora, { variedad: 140 }).variedad, 100)
  check('sin variedad queda null (la imagen pinta «—»)', W.calcularWrapped(hist, ahora).variedad, null)
  check('4 sesiones en el mes', wm.sesiones, 4)
  check('duración media de la sesión: (20 + 10 + 5 + 30) / 4 → 16 min', wm.sesionMediaMin, 16)
  check('y con formato', wm.sesionMedia, '16 min')
  const ses = W.calcularSesiones([
    { played_at: h(5, 10, 0) }, { played_at: h(5, 10, 31) }, { played_at: h(5, 11, 0) }
  ])
  check('un hueco de más de 30 min parte la sesión', ses.count, 2)
  check('misma definición que Inicio (media de 0 y 29 min → 15)', ses.averageMinutes, 15)
  check('sesión de más de una hora con formato', W.calcularWrapped([
    { ...escucha(1, 'A', 'B'), played_at: h(1, 10, 0) }, { ...escucha(1, 'C', 'D'), played_at: h(1, 10, 25) },
    { ...escucha(1, 'E', 'F'), played_at: h(1, 10, 50) }, { ...escucha(1, 'G', 'H'), played_at: h(1, 11, 15) }
  ], ahora).sesionMedia, '1 h 15 min')
  const wv = W.calcularWrapped([], ahora)
  check('vacío: sin NaN y con marca', JSON.stringify([wv.vacio, wv.tiempo, wv.artistasDistintos, wv.cancionesDistintas, wv.variedad, wv.sesiones, wv.sesionMedia]), '[true,"0 min",0,0,null,0,null]')
  check('vacío: listas vacías', wv.canciones.length + wv.artistas.length, 0)
  check('sólo los datos pedidos (ni hora favorita ni racha)', ['horaFavorita', 'mejorRacha', 'escuchas', 'periodo'].some(k => k in wm), false)
  check('formato de duración con horas', W.formatearDuracion(3 * 3600000 + 5 * 60000), '3 h 5 min')
  check('formato de duración exacta', W.formatearDuracion(2 * 3600000), '2 h')

  // ── Wrapped: dibujo (contexto simulado) y recorte con measureText ─────────
  console.log('\nWrapped: imagen')
  const {
    recortarTexto, dibujarWrapped, WRAPPED_ANCHO, WRAPPED_ALTO, DISPOSICION, PANELES, REJILLA, ALTO_CAP,
    M: MARGEN, CW: ANCHO_UTIL, DISPOSICION_DESCUBRIMIENTO, PANELES_DESCUBRIMIENTO, disposicionPara
  } = await import('../src/lib/wrappedImagen.js')
  const ctxMedida = { measureText: t => ({ width: String(t).length * 10 }) }
  check('texto corto no se recorta', recortarTexto(ctxMedida, 'Hola', 100), 'Hola')
  const largo = recortarTexto(ctxMedida, 'Un título larguísimo que no cabe en la tarjeta', 150)
  check('texto largo termina en puntos suspensivos', largo.endsWith('…'), true)
  check('texto largo mide como mucho el máximo', largo.length * 10 <= 150, true)
  check('hueco nulo da cadena vacía', recortarTexto(ctxMedida, 'Hola', 0), '')

  // ── Geometría de la rejilla (constantes de REJILLA en todo el dibujo) ──────
  const casi = (a, b) => Math.abs(a - b) < 0.01
  const { margen: RM, hueco: RH, relleno: RP } = REJILLA
  check('margen exterior = REJILLA.margen', MARGEN, RM)
  const paneles = PANELES.map(([nombre, p]) => ({ nombre, ...p }))
  check('margen izquierdo igual en todos los paneles de la columna izquierda',
    paneles.filter(p => p.x < WRAPPED_ANCHO / 2).every(p => casi(p.x, RM)), true)
  check('margen derecho igual al izquierdo',
    paneles.filter(p => p.x + p.w > WRAPPED_ANCHO / 2).every(p => casi(WRAPPED_ANCHO - (p.x + p.w), RM)), true)
  const filasPaneles = [DISPOSICION.tiempo, DISPOSICION.canciones, DISPOSICION.artistas, DISPOSICION.celdas[0], DISPOSICION.celdas[2]]
  check('separación vertical igual entre paneles consecutivos',
    filasPaneles.every((p, i) => i === 0 || casi(p.y - (filasPaneles[i - 1].y + filasPaneles[i - 1].h), RH)), true)
  const [c0, c1, c2, c3] = DISPOSICION.celdas
  check('separación horizontal entre celdas = la vertical',
    casi(c1.x - (c0.x + c0.w), RH) && casi(c3.x - (c2.x + c2.w), RH), true)
  check('las cuatro celdas miden igual', [c1, c2, c3].every(c => casi(c.w, c0.w) && casi(c.h, c0.h)), true)
  check('las celdas tienen altura suficiente (≥ 160 px)', c0.h >= 160, true)
  check('la marca empieza en el margen superior', casi(DISPOSICION.cab.y, RM), true)
  check('el pie apoya en el margen inferior', casi(DISPOSICION.pie.y + DISPOSICION.pie.h, WRAPPED_ALTO - RM), true)
  check('título → primer panel y última celda → pie con la misma separación',
    casi(DISPOSICION.tiempo.y - (DISPOSICION.titulo.y + DISPOSICION.titulo.h), REJILLA.seccion) &&
    casi(DISPOSICION.pie.y - (c3.y + c3.h), REJILLA.seccion), true)
  const solapan = (a, b, tol = 0.5) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.y0 < b.y1 - tol && b.y0 < a.y1 - tol
  const caja = p => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h })
  check('ningún panel solapa a otro', paneles.every((a, i) => paneles.every((b, j) => i === j || !solapan(caja(a), caja(b)))), true)

  // Contexto falso que mide según el tamaño de la fuente (0,6 × px por letra)
  // y apunta cada texto con su caja (línea base y alto de mayúscula).
  globalThis.Path2D = class { constructor (d) { this.d = d } }
  const grad = { addColorStop () {} }
  function lienzoDePrueba () {
    const dibujados = []
    const pxDe = f => Number((/(\d+(?:\.\d+)?)px/.exec(f || '') || [])[1] || 10)
    const ctx = new Proxy({}, {
      get: (o, k) => {
        if (k === 'measureText') return t => ({ width: String(t).length * pxDe(o.font) * 0.6 })
        if (k === 'fillText') {
          return (t, x, y) => {
            const px = pxDe(o.font)
            const w = String(t).length * px * 0.6
            const x0 = o.textAlign === 'center' ? x - w / 2 : (o.textAlign === 'right' ? x - w : x)
            dibujados.push({ t: String(t), x0, x1: x0 + w, y, y0: y - px * ALTO_CAP, y1: y })
          }
        }
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad
        if (k in o) return o[k]
        return () => {}
      },
      set: (o, k, v) => { o[k] = v; return true }
    })
    return { lienzo: { getContext: () => ctx }, dibujados, registro: [] }
  }
  // Área útil (dentro del margen exterior) y área interior de cada panel.
  const util = { x0: RM, y0: RM, x1: WRAPPED_ANCHO - RM, y1: WRAPPED_ALTO - RM }
  const interior = p => ({ x0: p.x + RP, y0: p.y + RP, x1: p.x + p.w - RP, y1: p.y + p.h - RP })
  const contiene = (a, d, tol = 0.5) => d.x0 >= a.x0 - tol && d.x1 <= a.x1 + tol && d.y0 >= a.y0 - tol && d.y1 <= a.y1 + tol
  const dentro = d => contiene(util, d)
  /** Cada texto va dentro del área útil y, si cae en un panel, dentro de su interior. */
  const enSuPanel = (d, lista = paneles) => {
    const p = lista.find(q => solapan(caja(q), d, 0))
    return p ? contiene(interior(p), d) : dentro(d)
  }
  /** Ningún texto pisa a otro (salvo el número que va dentro de su puesto, que no es texto). */
  const sinSolapes = lista => lista.every((a, i) => lista.every((b, j) => j <= i || !solapan(a, b)))
  /**
   * Relleno de cada panel según lo que se dibujó en él: el contenido empieza a
   * `relleno` del borde izquierdo y del superior, acaba a `relleno` del inferior
   * y nunca pasa del derecho (las listas y el tiempo llegan justo a él).
   */
  function rellenos (registro, lista = paneles) {
    return lista.map(p => {
      const cs = registro.filter(r => r.zona === p.nombre)
      const u = cs.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), y0: Math.min(a.y0, r.y0), x1: Math.max(a.x1, r.x1), y1: Math.max(a.y1, r.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
      return { nombre: p.nombre, izq: u.x0 - p.x, arr: u.y0 - p.y, aba: p.y + p.h - u.y1, der: p.x + p.w - u.x1 }
    })
  }
  function comprobarGeometria (caso, l, lista = paneles) {
    check(`${caso}: todo texto dentro del área útil`, l.dibujados.every(dentro), true)
    check(`${caso}: cada texto dentro del interior de su panel`, l.dibujados.every(d => enSuPanel(d, lista)), true)
    check(`${caso}: ningún texto se solapa con otro`, sinSolapes(l.dibujados), true)
    const r = rellenos(l.registro, lista)
    const mal = r.filter(x => !(casi(x.izq, RP) && casi(x.arr, RP) && casi(x.aba, RP) && x.der >= RP - 0.01))
    check(`${caso}: mismo relleno interior en todos los paneles${mal.length ? ' ' + JSON.stringify(mal) : ''}`, mal.length, 0)
    check(`${caso}: tiempo, listas y descubrimiento llegan justo al relleno derecho`,
      r.filter(x => ['tiempo', 'canciones', 'artistas', 'descubrimiento'].includes(x.nombre)).every(x => casi(x.der, RP)), true)
    check(`${caso}: la marca y la pastilla tocan los márgenes laterales`,
      casi(Math.min(...l.registro.filter(x => x.zona === 'cab').map(x => x.x0)), RM) &&
      casi(Math.max(...l.registro.filter(x => x.zona === 'cab').map(x => x.x1)), WRAPPED_ANCHO - RM), true)
  }

  const normal = lienzoDePrueba()
  dibujarWrapped(normal.lienzo, wm, normal.registro)
  check('lienzo de 1080 × 1920', `${normal.lienzo.width}x${normal.lienzo.height}`, `${WRAPPED_ANCHO}x${WRAPPED_ALTO}`)
  comprobarGeometria('datos normales', normal)
  for (const t of ['Tiempo de escucha', '27', 'min', 'Top 3 canciones', 'Top 3 artistas', 'Uno', 'Beto', '4', '5', '82', '%', '16', 'Sesión media', 'Variedad', 'Artistas distintos', 'Canciones distintas', 'según escuchas']) {
    check(`se dibuja «${t}»`, normal.dibujados.some(d => d.t === t), true)
  }
  check('nada de racha ni hora favorita', normal.dibujados.some(d => /RACHA|HORA FAVORITA|racha|hora favorita/.test(d.t)), false)
  check('sin emoji en la imagen', normal.dibujados.some(d => /\p{Extended_Pictographic}/u.test(d.t)), false)
  // Barras proporcionales: Uno (3 escuchas) llena la pista; Dos (2) dos tercios.
  const barrasCan = normal.registro.filter(r => r.zona === 'canciones' && r.y1 - r.y0 === 8)
  check('las canciones llevan tres barras con la misma pista', barrasCan.length === 3 && barrasCan.every(b => casi(b.x1 - b.x0, barrasCan[0].x1 - barrasCan[0].x0)), true)
  // La cifra protagonista: el número es el texto más grande de la imagen.
  const mayor = normal.dibujados.reduce((a, d) => (d.y1 - d.y0 > a.y1 - a.y0 ? d : a))
  check('la cifra más grande es el tiempo de escucha', mayor.t, '27')

  const largoTit = 'Título extraordinariamente largo '.repeat(8)
  const largoArt = 'Artista con un nombre también larguísimo '.repeat(6)
  const enorme = lienzoDePrueba()
  const datosLargos = W.calcularWrapped([1, 2, 3].map(i => (
    { ...escucha(1, largoTit + i, largoArt + i), played_at: h(1, 10, i) }
  )), ahora, { variedad: 100 })
  datosLargos.tiempo = '1234 h 59 min'
  datosLargos.sesionMedia = '23 h 59 min'
  datosLargos.artistasDistintos = 123456
  datosLargos.cancionesDistintas = 1234567
  dibujarWrapped(enorme.lienzo, datosLargos, enorme.registro)
  comprobarGeometria('títulos larguísimos', enorme)
  check('el título largo se recortó con puntos suspensivos', enorme.dibujados.some(d => d.t.startsWith('Título extra') && d.t.endsWith('…')), true)
  check('el artista largo también', enorme.dibujados.some(d => d.t.startsWith('Artista con') && d.t.endsWith('…')), true)
  check('las cifras largas se dibujan enteras (encogen, no se cortan)',
    ['1234', '59', '23', '123456', '1234567'].every(t => enorme.dibujados.some(d => d.t === t)), true)

  const vacio = lienzoDePrueba()
  dibujarWrapped(vacio.lienzo, W.calcularWrapped([], ahora), vacio.registro)
  comprobarGeometria('sin datos', vacio)
  check('sin datos: mensaje en las dos listas', vacio.dibujados.filter(d => d.t === 'Aún sin escuchas este mes').length, 2)
  check('sin datos: variedad «—» con su pista', vacio.dibujados.some(d => d.t === '—') && vacio.dibujados.some(d => d.t === 'aún sin datos'), true)
  check('sin datos: sesión media «—» con su pista', vacio.dibujados.some(d => d.t === 'sin sesiones'), true)

  const parcial = lienzoDePrueba()
  const datosParciales = W.calcularWrapped([escucha(1, 'Sola', 'Única'), escucha(2, 'Otra', 'Única')], ahora)
  dibujarWrapped(parcial.lienzo, datosParciales, parcial.registro)
  comprobarGeometria('datos parciales (2 canciones, 1 artista, sin variedad)', parcial)
  check('datos parciales: «—» en la variedad y el resto con cifras', parcial.dibujados.some(d => d.t === '—') && parcial.dibujados.some(d => d.t === 'Sola'), true)
  check('datos parciales: los puestos sin dato siguen numerados', ['1', '2', '3'].every(n => parcial.dibujados.filter(d => d.t === n).length >= 2), true)

  // ── Wrapped con «Descubrimiento del mes» (disposición compacta) ──────────
  console.log('\nWrapped: descubrimiento del mes')
  check('sin descubrimiento se usa la disposición de siempre', disposicionPara(wm), DISPOSICION)
  check('sin descubrimiento no hay panel nuevo', DISPOSICION.descubrimiento, null)
  check('sin descubrimiento no se dibuja el panel', normal.dibujados.some(d => /Descubrimiento|NUEVO/.test(d.t)), false)
  const DD = DISPOSICION_DESCUBRIMIENTO
  const panelesD = PANELES_DESCUBRIMIENTO.map(([nombre, p]) => ({ nombre, ...p }))
  check('con descubrimiento hay un panel más', panelesD.length, paneles.length + 1)
  check('margen izquierdo y derecho iguales (compacta)',
    panelesD.every(p => (p.x >= WRAPPED_ANCHO / 2 || casi(p.x, RM)) && (p.x + p.w <= WRAPPED_ANCHO / 2 || casi(WRAPPED_ANCHO - (p.x + p.w), RM))), true)
  const filasD = [DD.tiempo, DD.canciones, DD.artistas, DD.descubrimiento, DD.celdas[0], DD.celdas[2]]
  check('separación vertical igual entre paneles (compacta)',
    filasD.every((p, i) => i === 0 || casi(p.y - (filasD[i - 1].y + filasD[i - 1].h), RH)), true)
  const [d0, d1, d2, d3] = DD.celdas
  check('separación horizontal entre celdas = la vertical (compacta)', casi(d1.x - (d0.x + d0.w), RH) && casi(d3.x - (d2.x + d2.w), RH), true)
  check('las cuatro celdas miden igual (compacta)', [d1, d2, d3].every(c => casi(c.w, d0.w) && casi(c.h, d0.h)), true)
  check('las celdas compactas caben (≥ 140 px)', d0.h >= 140, true)
  check('el panel nuevo ocupa unos 200 px', DD.descubrimiento.h >= 180 && DD.descubrimiento.h <= 240, true)
  check('marca, título y pie en el mismo sitio (compacta)',
    casi(DD.cab.y, RM) && casi(DD.pie.y + DD.pie.h, WRAPPED_ALTO - RM) &&
    casi(DD.tiempo.y - (DD.titulo.y + DD.titulo.h), REJILLA.seccion) && casi(DD.pie.y - (d3.y + d3.h), REJILLA.seccion), true)
  check('ningún panel solapa a otro (compacta)', panelesD.every((a, i) => panelesD.every((b, j) => i === j || !solapan(caja(a), caja(b)))), true)

  const descNormal = {
    artista: 'Lumi', cancionesNuevas: 5, cancionesDistintas: 5, escuchas: 23, diasActivos: 6,
    canciones: [{ titulo: 'Primera luz', escuchas: 8 }, { titulo: 'Norte', escuchas: 6 }, { titulo: 'Marea', escuchas: 4 }]
  }
  const conDesc = lienzoDePrueba()
  const datosDesc = { ...wm, descubrimiento: descNormal }
  check('con descubrimiento se usa la disposición compacta', disposicionPara(datosDesc), DD)
  dibujarWrapped(conDesc.lienzo, datosDesc, conDesc.registro)
  comprobarGeometria('con descubrimiento', conDesc, panelesD)
  for (const t of ['Descubrimiento del mes', 'NUEVO', 'Lumi', '5 canciones nuevas · 23 escuchas', 'Primera luz', 'Norte', 'Marea', 'Tiempo de escucha', 'en 30 días', 'Top 3 canciones', 'Top 3 artistas', 'Variedad', 'Sesión media', 'Artistas distintos', 'Canciones distintas']) {
    check(`con descubrimiento se dibuja «${t}»`, conDesc.dibujados.some(d => d.t === t), true)
  }
  const mayorD = conDesc.dibujados.reduce((a, d) => (d.y1 - d.y0 > a.y1 - a.y0 ? d : a))
  check('con descubrimiento la cifra más grande sigue siendo el tiempo', mayorD.t, '27')
  check('con descubrimiento, sin emoji', conDesc.dibujados.some(d => /\p{Extended_Pictographic}/u.test(d.t)), false)
  const nombreD = conDesc.dibujados.find(d => d.t === 'Lumi')
  check('el artista es el texto más grande del panel', conDesc.dibujados
    .filter(d => contiene(caja(DD.descubrimiento), d))
    .every(d => d.y1 - d.y0 <= nombreD.y1 - nombreD.y0 + 0.01), true)

  const enormeD = lienzoDePrueba()
  const largoNombre = 'Orquesta Sinfónica Experimental de Nombres Larguísimos '.repeat(4)
  dibujarWrapped(enormeD.lienzo, {
    ...datosLargos,
    descubrimiento: {
      artista: largoNombre, cancionesNuevas: 123456, cancionesDistintas: 123456, escuchas: 9876543,
      canciones: [1, 2, 3].map(i => ({ titulo: `${largoTit} ${i}`, escuchas: 10 - i }))
    }
  }, enormeD.registro)
  comprobarGeometria('con descubrimiento y textos larguísimos', enormeD, panelesD)
  check('el artista larguísimo se recortó con puntos suspensivos', enormeD.dibujados.some(d => d.t.startsWith('Orquesta') && d.t.endsWith('…')), true)
  check('las canciones larguísimas del descubrimiento también',
    enormeD.dibujados.filter(d => contiene(caja(DD.descubrimiento), d) && d.t.startsWith('Título extra') && d.t.endsWith('…')).length, 3)
  check('con descubrimiento las cifras largas se dibujan enteras',
    ['1234', '59', '23', '123456', '1234567'].every(t => enormeD.dibujados.some(d => d.t === t)), true)

  const vacioD = lienzoDePrueba()
  dibujarWrapped(vacioD.lienzo, { ...W.calcularWrapped([], ahora), descubrimiento: { ...descNormal, canciones: [] } }, vacioD.registro)
  comprobarGeometria('con descubrimiento sin canciones ni datos del mes', vacioD, panelesD)

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
