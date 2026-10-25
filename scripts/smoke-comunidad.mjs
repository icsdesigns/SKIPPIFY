/**
 * Simulación de la pestaña Comunidad con un ranking ya publicado.
 *
 * El ranking sólo lo escribe la publicación semanal, así que en un portátil sin
 * credenciales de Firebase la pantalla nunca llega a enseñar una ficha de
 * miembro: no hay forma de ver si las cifras salen y si los nombres largos
 * caben. Aquí se inyecta una publicación de mentira en el estado del composable
 * y se renderiza la vista en servidor, que es donde se comprueba el HTML.
 *
 *   npx vite build --ssr scripts/smoke-comunidad.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-comunidad.js
 */
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'

function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/', hash: '' },
    localStorage: globalThis.localStorage,
    addEventListener () {},
    removeEventListener () {},
    matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  }
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener () {},
    removeEventListener () {},
    querySelectorAll: () => []
  }
}

const GROUP_ID = 'grupo-simulado'
const GRUPO_LOCAL = 'lh_0011223344556677'
const NOMBRE_LOCAL_LARGO = 'Los del garaje de la calle Reyes'

/** Tres fichas: una con todas las cifras nuevas y dos anteriores a la v4.0.1. */
const MIEMBROS = [
  {
    uid: 'uid-ana',
    displayName: 'Ana',
    totalMinutes: 612.4,
    totalTracks: 184,
    completedTracks: 151,
    activeDays: 6,
    score: 700.9,
    topArtist: 'Rosalía',
    topArtistPlays: 31,
    topTrack: 'Despechá',
    topTrackPlays: 12,
    distinctArtists: 42,
    distinctTracks: 118,
    varietyIndex: 0.641,
    peakHour: 21,
    peakHourPlays: 24,
    completionRate: 0.82,
    busiestDay: '2026-09-16',
    busiestDayMinutes: 130,
    longestSessionMinutes: 95,
    sessionCount: 11,
    artistCounts: [['Rosalía', 31], ['Bad Bunny', 20], ['Quevedo', 10]]
  },
  {
    uid: 'uid-largo',
    displayName: 'Bartolomé de las Casas Fernández',
    totalMinutes: 410,
    totalTracks: 96,
    completedTracks: 80,
    activeDays: 5,
    score: 460,
    topArtist: 'Nick Cave and the Bad Seeds feat. Kylie Minogue',
    topArtistPlays: 9,
    topTrack: 'Everything Is Embarrassing (Sky Ferreira Extended Remix Version)',
    topTrackPlays: 7,
    distinctArtists: 21,
    distinctTracks: 60,
    varietyIndex: 0.625,
    peakHour: 0,
    peakHourPlays: 11,
    artistCounts: [['Rosalía', 10], ['Nick Cave and the Bad Seeds feat. Kylie Minogue', 9]]
  },
  {
    // Resultado antiguo: sin repertorio, variedad ni hora punta.
    uid: 'uid-viejo',
    displayName: 'Carlos',
    totalMinutes: 95.5,
    totalTracks: 30,
    completedTracks: 22,
    activeDays: 2,
    score: 110.5,
    topArtist: '',
    topArtistPlays: 0,
    topTrack: '',
    topTrackPlays: 0
  }
]

async function main () {
  installBrowserGlobals()

  // Un grupo sin servidor en la caché de useLocalLeague: el árbol lo lee de ahí
  // sin cargar ese modo. Nombre de 32 caracteres, el máximo del formulario.
  localStorage.setItem('skippify-localhost-state', JSON.stringify({
    displayName: 'Ana',
    groups: [{ groupId: GRUPO_LOCAL, name: NOMBRE_LOCAL_LARGO, role: 'owner', relays: [] }],
    activeGroupId: GRUPO_LOCAL
  }))

  // Los grupos con servidor están apagados por defecto; las comprobaciones de
  // abajo son las del modo con servidor, así que se encienden. Más abajo se
  // comprueba también el estado por defecto.
  localStorage.setItem('skippify-community-firebase-groups', '1')

  const { useLeague } = await import('../src/composables/useLeague.js')
  const liga = useLeague()

  liga.state.value = {
    uid: 'uid-ana',
    displayName: 'Ana',
    groups: [{ groupId: GROUP_ID, inviteCode: 'ABC123', name: 'Los del garaje', role: 'owner' }],
    activeGroupId: GROUP_ID,
    lastSyncAt: new Date().toISOString(),
    lastSeenWeekKeys: { [GROUP_ID]: '2026-09-14' }
  }
  liga.members[GROUP_ID] = MIEMBROS.map(m => ({
    uid: m.uid,
    displayName: m.displayName,
    role: m.uid === 'uid-ana' ? 'owner' : 'member',
    joinedAt: new Date('2026-06-01T10:00:00Z')
  }))
  liga.leaderboards[GROUP_ID] = {
    weekKey: '2026-09-14',
    weekStart: '2026-09-14T00:00:00.000Z',
    weekEnd: '2026-09-21T00:00:00.000Z',
    publishedAt: new Date('2026-09-21T13:00:00Z'),
    members: MIEMBROS
  }

  const { routes } = await import('../src/router/routes.js')
  const { default: App } = await import('../src/App.vue')

  const router = createRouter({ history: createMemoryHistory(), routes })
  const app = createSSRApp(App)
  app.use(router)
  app.config.warnHandler = (msg) => console.warn(`  ! aviso: ${msg}`)
  await router.push('/comunidad')
  await router.isReady()

  const html = await renderToString(app)

  // `--html` vuelca el fragmento del ranking: es la forma de mirar el marcado
  // real cuando algo «se ve mal» y no se tiene el móvil delante.
  if (process.argv.includes('--html')) {
    const i = html.indexOf('Resultados semanales')
    console.log(html.slice(i, i + 4000).replace(/></g, '>\n<'))
  }

  let fallos = 0
  const check = (etiqueta, ok, detalle = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
    if (!ok) fallos += 1
  }

  console.log('\nFichas del ranking')
  check('las cifras nuevas de la ficha completa', html.includes('82 % terminadas') && html.includes('Día top: mié 16 sept') && html.includes('Sesión más larga: 1 h 35 min'),
    html.slice(html.indexOf('terminadas') - 80, html.indexOf('terminadas') + 200))
  check('el perfil horario sale de la hora punta', html.includes('De noche') && html.includes('Noctámbulo'))
  check('las veces repetido van junto al artista y al tema', html.includes('×31') && html.includes('×12'))
  check('ya no se enseñan puntos', !html.includes('700.9') && !html.includes('700,9') && !html.includes('460.0'))
  check('el ranking va por tiempo de escucha', html.indexOf('Ana') < html.indexOf('Bartolomé') && html.indexOf('Bartolomé') < html.indexOf('Carlos'))
  check('aparece la escucha en común entre dos miembros con datos', html.includes('Escucha en común') && html.includes('Ana · Bartolomé de las Casas Fernández'))
  check('una ficha antigua no genera una pareja', !html.includes('Carlos ·') && !html.includes('· Carlos'))
  check('miembros y resultados son un solo panel', html.includes('Miembros y resultados') && !html.includes('Resultados semanales') && html.split('Miembros y resultados').length === 2)
  check('el papel de administrador va en la fila del ranking', html.split('>Admin<').length === 2 && html.indexOf('>Admin<') > html.indexOf('Miembros y resultados'))
  check('aparece el ranking y no el aviso de «sin publicar»',
    !html.includes('Todavía no hay ranking publicado'))
  check('cifras de la ficha completa', html.includes('10 h 12 min') && html.includes('184 canciones'),
    'no se encontraron minutos/canciones de Ana')
  check('artista y canción top', html.includes('Rosalía') && html.includes('Despechá'))
  check('repertorio distinto', html.includes('42 artistas') && html.includes('118 temas'))
  check('índice de variedad en porcentaje', html.includes('64 % variedad'))
  check('hora punta como franja', html.includes('21–22 h'))
  check('la medianoche (peakHour = 0) se pinta', html.includes('0–1 h'),
    'peakHour 0 es falsy: si se comprueba por verdadero/falso desaparece')
  check('la ficha antigua no enseña huecos',
    !html.includes('undefined') && !html.includes('NaN'))

  console.log('\nNombres largos y huecos')
  // El artista y la canción top van en líneas propias y recortadas: juntos y
  // sin recorte, un título largo se partía en tres renglones y el punto medio
  // de separación quedaba en mitad del texto.
  check('el artista top va en su propia línea recortada',
    /title="Nick Cave and the Bad Seeds feat\. Kylie Minogue"[^>]*>(?:(?!<\/p>)[\s\S])*<span class="truncate">Nick Cave/.test(html),
    'un nombre largo se sale de la tarjeta')
  check('la canción top va en su propia línea recortada',
    /<span class="truncate">Despechá<\/span>/.test(html))
  check('el nombre entero queda accesible en el title',
    html.includes('title="Everything Is Embarrassing (Sky Ferreira Extended Remix Version)"'))
  check('sin artista ni canción no se rellena con «sin datos»',
    !html.includes('sin datos'),
    'la ficha de quien no tiene top gastaba dos renglones en decir que no hay nada')
  check('sin emoji en las fichas', !/[🌀-🫿]/u.test(html))
  check('el detalle del grupo enseña quién va primero', html.includes('Los del garaje') && html.includes('Va primero'))
  check('el listado de miembros trae su aportación', html.includes('Sin escuchas esta semana') === false && html.includes('esta semana'))
  check('un nombre de miembro largo se lee en dos líneas, no recortado',
    /<p class="sk-clamp-2 text-sm font-semibold text-white"/.test(html))

  console.log('\nÁrbol de modos y grupos')
  {
    const inicio = html.indexOf('aria-label="Grupos de Comunidad"')
    const arbol = html.slice(inicio, html.indexOf('</nav>', inicio))
    const migas = (arbol.match(/<ol[^>]*data-migas[^>]*>([\s\S]*?)<\/ol>/) || [])[1] || ''
    const texto = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    check('las migas dicen modo y grupo', /Con servidor .*Los del garaje/.test(texto(migas)),
      `migas: «${texto(migas)}»`)
    check('las dos raíces están en el árbol',
      arbol.includes('data-raiz="servidor"') && arbol.includes('data-raiz="local"'))
    check('el grupo abierto se marca como la ubicación actual',
      new RegExp(`aria-current="location"[^>]*data-grupo="${GROUP_ID}"`).test(arbol))
    // El otro modo empieza plegado, pero su raíz ya dice cuántos grupos tiene y
    // a cuál se volvería, leído de la caché sin cargar el modo sin servidor.
    check('la raíz sin servidor resume sus grupos sin abrir ese modo',
      texto(arbol).includes(`Sin servidor 1 grupo · ${NOMBRE_LOCAL_LARGO}`), texto(arbol).slice(-300))
    check('sólo se despliega el modo actual',
      arbol.includes(`data-grupo="${GROUP_ID}"`) && !arbol.includes(`data-grupo="${GRUPO_LOCAL}"`) &&
      arbol.includes('data-desplegar="local"'))
    check('el grupo sin servidor no se marca como actual estando en el otro modo',
      !new RegExp(`aria-current="location"[^>]*data-grupo="${GRUPO_LOCAL}"`).test(arbol))
    check('el modo actual tiene su entrada para crear o unirse', arbol.includes('data-alta="servidor"'))
    check('el nodo trae miembros y cifras de la semana', /3 miembros · \d+ h \d{2} de escucha/.test(texto(arbol)),
      texto(arbol).slice(0, 300))
    check('la cuenta de grupos por modo', texto(arbol).includes('1 / 5'))
    check('el panel sin servidor (libsodium) no se monta en el modo con servidor',
      !html.includes('comunidad-alta-local'))
    check('ya no queda la lista duplicada «Tus grupos»', !html.includes('Tus grupos'))
  }

  console.log('\nDesvelado del domingo a las 15:00')
  {
    const { resultadoVisible, resultadoPendiente, ultimoDesvelado } = await import('../src/composables/useLeague.js')
    const doc = {
      weekKey: '2026-10-11',
      members: [{ uid: 'a' }],
      next: { weekKey: '2026-10-18', revealAt: '2026-10-18T13:00:00.000Z', members: [{ uid: 'b' }] }
    }
    const a = (iso) => Date.parse(iso)
    check('a las 14:59 se ve todavía la semana anterior',
      resultadoVisible(doc, a('2026-10-18T12:59:59Z')).weekKey === '2026-10-11')
    check('a las 15:00 en punto se ve la nueva',
      resultadoVisible(doc, a('2026-10-18T13:00:00Z')).weekKey === '2026-10-18')
    check('lo de next no se cuela en la vista anterior',
      !('next' in resultadoVisible(doc, a('2026-10-18T12:00:00Z'))))
    check('el último desvelado en verano son las 13:00 UTC',
      new Date(ultimoDesvelado(a('2026-10-18T16:00:00Z'))).toISOString() === '2026-10-18T13:00:00.000Z')
    check('y en invierno las 14:00 UTC',
      new Date(ultimoDesvelado(a('2026-12-06T14:30:00Z'))).toISOString() === '2026-12-06T14:00:00.000Z')
    check('el sábado no hay nada pendiente',
      !resultadoPendiente({ weekKey: 'x', members: [] }, a('2026-10-17T12:00:00Z')))
    check('a las 15:05 sin la semana nueva se dice que se está calculando',
      resultadoPendiente({ weekKey: '2026-10-04', weekEnd: '2026-10-11T13:00:00.000Z', members: [] }, a('2026-10-18T13:05:00Z')))
    check('con la semana ya en next no hay nada pendiente',
      !resultadoPendiente(doc, a('2026-10-18T13:05:00Z')))
    check('el martes ya no se dice «calculando»',
      !resultadoPendiente({ weekKey: 'x', members: [] }, a('2026-10-20T13:05:00Z')))
  }

  console.log('\nGrupos con servidor: apagados por defecto')
  {
    const { useAjustesComunidad } = await import('../src/composables/useAjustesComunidad.js')
    const { gruposConServidor } = useAjustesComunidad()
    gruposConServidor.value = false
    localStorage.setItem('skippify-community-mode', 'servidor')
    const router2 = createRouter({ history: createMemoryHistory(), routes })
    const app2 = createSSRApp(App)
    app2.use(router2)
    await router2.push('/comunidad')
    await router2.isReady()
    const html2 = await renderToString(app2)
    check('sin el ajuste no sale la raíz «Con servidor»', !html2.includes('data-raiz="servidor"') && html2.includes('data-raiz="local"'))
    check('ni el ranking de Firebase aunque hubiera uno guardado', !html2.includes('Despechá'))
    check('tampoco la alta de grupos con servidor', !html2.includes('comunidad-alta-servidor'))

    const router3 = createRouter({ history: createMemoryHistory(), routes })
    const app3 = createSSRApp(App)
    app3.use(router3)
    await router3.push('/settings')
    await router3.isReady()
    const html3 = await renderToString(app3)
    const i3 = html3.indexOf('aria-label="Mostrar los grupos con servidor"')
    check('Ajustes trae el interruptor de los grupos con servidor', i3 > 0 && html3.includes('Grupos con servidor'))
    check('y viene apagado por defecto', i3 > 0 && /aria-checked="false"/.test(html3.slice(Math.max(0, i3 - 120), i3 + 120)),
      html3.slice(Math.max(0, i3 - 120), i3 + 120))

    // Encendido, vuelve el modo con servidor.
    gruposConServidor.value = true
    const router4 = createRouter({ history: createMemoryHistory(), routes })
    const app4 = createSSRApp(App)
    app4.use(router4)
    await router4.push('/comunidad')
    await router4.isReady()
    const html4 = await renderToString(app4)
    check('con el ajuste encendido vuelve la raíz «Con servidor»', html4.includes('data-raiz="servidor"'))
    gruposConServidor.value = true
  }

  if (fallos) {
    console.error(`\n${fallos} comprobación(es) con error.`)
    process.exit(1)
  }
  console.log('\nComunidad pinta el ranking completo.')
  process.exit(0)
}

main()
