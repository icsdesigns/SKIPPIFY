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

  // ── Wrapped: cálculos (sólo mensual, mes natural anterior) ─────────────────
  console.log('\nWrapped: cálculos (mes natural anterior)')
  // «Hoy» = día 1 del mes en curso a mediodía: el Wrapped enseña el mes que acaba de cerrarse.
  const hoyM = new Date()
  const ahoraW = new Date(hoyM.getFullYear(), hoyM.getMonth(), 1, 12).getTime()
  const h = (dias, hora, min = 0) => {
    const d = new Date(ahoraW - dias * DIA); d.setHours(hora, min, 0, 0); return d.toISOString()
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
    // Fuera del mes (anterior a ese)
    { ...escucha(31, 'Antigua', 'Yago'), played_at: h(40, 3) }
  ]
  const wm = W.calcularWrapped(hist, ahoraW, { variedad: 82.4 })
  const mes = W.mesAnterior(ahoraW)
  check('el mes es el natural anterior (día 1 a día 1)', new Date(mes.inicio).getDate() === 1 && new Date(mes.fin).getDate() === 1 && new Date(mes.fin).getMonth() === new Date(ahoraW).getMonth(), true)
  check('el rango lo nombra con mes y año', /^[^ ]+ (de )?[0-9]{4}$/.test(wm.rango), true)
  check('el día 1 del mes en curso a las 00:00 aún no cuenta', W.calcularWrapped([{ ...escucha(0, 'Nueva', 'Ana'), played_at: new Date(mes.fin).toISOString() }], ahoraW).vacio, true)
  check('el último ms del mes anterior sí cuenta', W.calcularWrapped([{ ...escucha(0, 'Última', 'Ana'), played_at: new Date(mes.fin - 1).toISOString() }], ahoraW).vacio, false)
  check('el día 1 a las 00:00 del mes anterior sí cuenta', W.calcularWrapped([{ ...escucha(0, 'Primera', 'Ana'), played_at: new Date(mes.inicio).toISOString() }], ahoraW).vacio, false)
  check('a mitad del mes en curso sigue saliendo el mes anterior', W.calcularWrapped(hist, mes.fin + 15 * DIA).tiempo, wm.tiempo)
  check('título mensual', wm.titulo, 'Tu mes en música')
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
  check('variedad fuera de rango se acota', W.calcularWrapped(hist, ahoraW, { variedad: 140 }).variedad, 100)
  check('sin variedad queda null (la imagen pinta «—»)', W.calcularWrapped(hist, ahoraW).variedad, null)
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
  ], ahoraW).sesionMedia, '1 h 15 min')
  const wv = W.calcularWrapped([], ahoraW)
  check('vacío: sin NaN y con marca', JSON.stringify([wv.vacio, wv.tiempo, wv.artistasDistintos, wv.cancionesDistintas, wv.variedad, wv.sesiones, wv.sesionMedia]), '[true,"0 min",0,0,null,0,null]')
  check('vacío: listas vacías', wv.canciones.length + wv.artistas.length, 0)
  check('sólo los datos pedidos (ni hora favorita ni racha)', ['horaFavorita', 'mejorRacha', 'escuchas', 'periodo'].some(k => k in wm), false)
  const casi0 = (a, b) => Math.abs(a - b) < 1e-9
  check('formato de duración con horas', W.formatearDuracion(3 * 3600000 + 5 * 60000), '3 h 5 min')
  check('formato de duración exacta', W.formatearDuracion(2 * 3600000), '2 h')
  check('horas del mes: por debajo de media hora, «<1»', wm.horas, '<1')
  check('horas redondeadas y sin minutos', W.formatearHoras(61.6 * 3600000), '62')
  check('horas: sin escucha, «0»', W.formatearHoras(0), '0')
  check('mejor día: el de más tiempo (3 escuchas, 9 min)', wm.mejorDia?.tiempo, '9 min')
  check('mejor día: por encima de una hora, sólo horas', W.formatearHoras(6.2 * 3600000, { minutosSiMenos: true }), '6 h')
  check('mejor día: fecha legible y sin puntos', /^\p{L}+ \d{1,2} \p{L}+$/u.test(wm.mejorDia?.texto || ''), true)
  check('gráfica del año: doce meses', wm.anio?.horas?.length, 12)
  check('gráfica del año: el mes del Wrapped lleva sus horas', casi0(wm.anio.horas[wm.anio.mes], wm.totalMs / 3600000), true)
  check('gráfica del año: los meses posteriores van sin dato', wm.anio.horas.slice(wm.anio.mes + 1).every(v => v === null), true)

  // ── Wrapped: dibujo (contexto simulado) y recorte con measureText ─────────
  console.log('\nWrapped: imagen (A1·2, para Instagram Stories)')
  const {
    recortarTexto, dibujarWrapped, WRAPPED_ANCHO, WRAPPED_ALTO, DISPOSICION, BLOQUES, REJILLA, ALTO_CAP,
    M: MARGEN, ZONA_SEGURA
  } = await import('../src/lib/wrappedImagen.js')
  const ctxMedida = { measureText: t => ({ width: String(t).length * 10 }) }
  check('texto corto no se recorta', recortarTexto(ctxMedida, 'Hola', 100), 'Hola')
  const largo = recortarTexto(ctxMedida, 'Un título larguísimo que no cabe en la tarjeta', 150)
  check('texto largo termina en puntos suspensivos', largo.endsWith('…'), true)
  check('texto largo mide como mucho el máximo', largo.length * 10 <= 150, true)
  check('hueco nulo da cadena vacía', recortarTexto(ctxMedida, 'Hola', 0), '')

  // ── Geometría: todo en la zona que no tapa Instagram ─────────────────────
  const casi = (a, b) => Math.abs(a - b) < 0.01
  const segura = { x0: MARGEN, y0: ZONA_SEGURA.arriba, x1: WRAPPED_ANCHO - MARGEN, y1: WRAPPED_ALTO - ZONA_SEGURA.abajo }
  const bloques = BLOQUES.map(([nombre, p]) => ({ nombre, ...p }))
  const caja = p => ({ x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h })
  const contiene = (a, d, tol = 0.5) => d.x0 >= a.x0 - tol && d.x1 <= a.x1 + tol && d.y0 >= a.y0 - tol && d.y1 <= a.y1 + tol
  const solapan = (a, b, tol = 0.5) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.y0 < b.y1 - tol && b.y0 < a.y1 - tol
  check('zona segura de Stories: 250 px arriba y 340 abajo', `${ZONA_SEGURA.arriba}/${ZONA_SEGURA.abajo}`, '250/340')
  check('todos los bloques dentro de la zona segura', bloques.every(b => contiene(segura, caja(b))), true)
  check('mismo hueco entre bloques consecutivos', bloques.every((b, i) => i === 0 || casi(b.y - (bloques[i - 1].y + bloques[i - 1].h), REJILLA.hueco)), true)
  check('ningún bloque solapa a otro', bloques.every((a, i) => bloques.every((b, j) => i === j || !solapan(caja(a), caja(b)))), true)
  check('los paneles van de margen a margen', [DISPOSICION.principal, DISPOSICION.cifras].every(p => casi(p.x, MARGEN) && casi(WRAPPED_ANCHO - (p.x + p.w), MARGEN)), true)
  check('la gráfica es más estrecha que los paneles y va centrada',
    DISPOSICION.anio.w < DISPOSICION.principal.w && casi(DISPOSICION.anio.x - MARGEN, WRAPPED_ANCHO - MARGEN - (DISPOSICION.anio.x + DISPOSICION.anio.w)), true)
  const [c0, c1, c2, c3] = DISPOSICION.celdas
  check('las cuatro celdas miden igual y llenan su panel',
    [c1, c2, c3].every(c => casi(c.w, c0.w) && casi(c.h, c0.h)) && casi(c0.w * 2, DISPOSICION.cifras.w) && casi(c0.h * 2, DISPOSICION.cifras.h), true)

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
            dibujados.push({ t: String(t), x0, x1: x0 + w, y, y0: y - px * ALTO_CAP, y1: y, px })
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
  /** Interior de cada panel (con su relleno) o la caja del bloque si no es panel. */
  const interiorDe = nombre => {
    const b = bloques.find(x => x.nombre === nombre)
    if (nombre === 'principal' || nombre === 'cifras') return { x0: b.x + REJILLA.rellenoX, y0: b.y, x1: b.x + b.w - REJILLA.rellenoX, y1: b.y + b.h }
    return caja(b)
  }
  function comprobarGeometria (caso, l) {
    check(`${caso}: todo texto en la zona segura`, l.dibujados.every(d => contiene(segura, d)), true)
    const fuera = l.registro.filter(r => !contiene(interiorDe(r.zona), r))
    check(`${caso}: cada elemento dentro de su bloque${fuera.length ? ' ' + JSON.stringify(fuera.slice(0, 3)) : ''}`, fuera.length, 0)
    const textos = l.dibujados
    check(`${caso}: ningún texto se solapa con otro`, textos.every((a, i) => textos.every((b, j) => j <= i || !solapan(a, b))), true)
  }

  const descNormal = { artista: 'Lumi', cancionesNuevas: 5, cancionesDistintas: 5, escuchas: 23, diasActivos: 6, canciones: [] }
  const normal = lienzoDePrueba()
  const datosImagen = { ...wm, descubrimiento: descNormal }
  dibujarWrapped(normal.lienzo, datosImagen, normal.registro)
  check('lienzo de 1080 × 1920', `${normal.lienzo.width}x${normal.lienzo.height}`, `${WRAPPED_ANCHO}x${WRAPPED_ALTO}`)
  comprobarGeometria('datos normales', normal)
  for (const t of [wm.horas, 'horas', 'de música este mes', 'Tu mejor día:', 'TU CANCIÓN', 'TU ARTISTA', 'DESCUBRIMIENTO', 'NUEVO', 'Uno', 'Beto', 'Lumi', '5 canciones', 'artistas', 'canciones', 'variedad', 'sesión media', '82', '%', 'Skippify']) {
    check(`se dibuja «${t}»`, normal.dibujados.some(d => d.t === t), true)
  }
  check('las horas sin minutos', /min/.test(wm.horas), false)
  check('el mejor día con su fecha', normal.dibujados.some(d => d.t === `${wm.mejorDia.texto} · ${wm.mejorDia.tiempo}`), true)
  check('las doce iniciales de los meses', ['E', 'F', 'M', 'A', 'J', 'S', 'O', 'N', 'D'].every(m => normal.dibujados.some(d => d.t === m)) &&
    normal.dibujados.filter(d => d.t.length === 1 && /[A-Z]/.test(d.t)).length >= 12, true)
  check('sin emoji en la imagen', normal.dibujados.some(d => /\p{Extended_Pictographic}/u.test(d.t)), false)
  const mayor = normal.dibujados.reduce((a, d) => (d.y1 - d.y0 > a.y1 - a.y0 ? d : a))
  check('la cifra más grande son las horas', mayor.t, wm.horas)
  const barras = normal.registro.filter(r => r.barra)
  check('doce barras en la gráfica del año', barras.length, 12)
  check('las barras de los meses que no han llegado son una raya', barras.filter(b => b.valor === null).every(b => casi(b.y1 - b.y0, 6)), true)
  check('todas las barras apoyan en la misma línea', barras.every(b => casi(b.y1, barras[0].y1)), true)

  const largoTit = 'Título extraordinariamente largo '.repeat(8)
  const largoArt = 'Artista con un nombre también larguísimo '.repeat(6)
  const enorme = lienzoDePrueba()
  const datosLargos = W.calcularWrapped([1, 2, 3].map(i => (
    { ...escucha(1, largoTit + i, largoArt + i), played_at: h(1, 10, i) }
  )), ahoraW, { variedad: 100 })
  datosLargos.horas = '12345'
  datosLargos.sesionMediaMin = 1439
  datosLargos.artistasDistintos = 123456
  datosLargos.cancionesDistintas = 1234567
  datosLargos.rango = 'Septiembre de 2026 con un texto muy largo de prueba'
  datosLargos.descubrimiento = { ...descNormal, artista: 'Orquesta Sinfónica Experimental de Nombres Larguísimos '.repeat(3), cancionesNuevas: 123456 }
  dibujarWrapped(enorme.lienzo, datosLargos, enorme.registro)
  comprobarGeometria('textos y cifras larguísimos', enorme)
  check('el título largo se recortó con puntos suspensivos', enorme.dibujados.some(d => d.t.startsWith('Título extra') && d.t.endsWith('…')), true)
  check('el artista largo también', enorme.dibujados.some(d => d.t.startsWith('Artista con') && d.t.endsWith('…')), true)
  check('el descubrimiento largo también', enorme.dibujados.some(d => d.t.startsWith('Orquesta') && d.t.endsWith('…')), true)
  check('las cifras largas se dibujan enteras (encogen, no se cortan)',
    ['12345', '123456', '1234567', '24'].every(t => enorme.dibujados.some(d => d.t === t)), true)

  const vacio = lienzoDePrueba()
  const datosVacios = W.calcularWrapped([], ahoraW)
  dibujarWrapped(vacio.lienzo, datosVacios, vacio.registro)
  comprobarGeometria('sin datos', vacio)
  check('sin datos: 0 horas', datosVacios.horas, '0')
  check('sin datos: mensajes en las filas', ['Aún sin escuchas', 'Ninguno este mes'].every(t => vacio.dibujados.some(d => d.t === t)), true)
  check('sin datos: mejor día «sin escuchas»', vacio.dibujados.some(d => d.t === 'sin escuchas'), true)
  check('sin datos: variedad y sesión con «—»', vacio.dibujados.filter(d => d.t === '—').length, 2)

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
