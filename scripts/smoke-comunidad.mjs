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
    peakHourPlays: 24
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
    peakHourPlays: 11
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
  check('aparece el ranking y no el aviso de «sin publicar»',
    !html.includes('Todavía no hay ranking publicado'))
  check('cifras de la ficha completa', html.includes('10h 12m') && html.includes('184 canciones'),
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
  const LINEA_RECORTADA = 'class="mt-0.5 truncate text-[11px] text-slate-500"'
  check('el artista top va en su propia línea recortada',
    /mt-0\.5 truncate text-\[11px\] text-slate-500"[^>]*>\s*🎤/u.test(html),
    `no se encontró «<p ${LINEA_RECORTADA} …>🎤 …»: un nombre largo se sale de la tarjeta`)
  check('la canción top va en su propia línea recortada',
    /mt-0\.5 truncate text-\[11px\] text-slate-500"[^>]*>\s*🎵/u.test(html))
  check('el nombre entero queda accesible en el title',
    html.includes('title="Everything Is Embarrassing (Sky Ferreira Extended Remix Version)"'))
  check('sin artista ni canción no se rellena con «sin datos»',
    !html.includes('sin datos'),
    'la ficha de quien no tiene top gastaba dos renglones en decir que no hay nada')
  check('un nombre de miembro largo se lee en dos líneas, no recortado',
    /<p class="sk-clamp-2 text-sm font-semibold text-white"/.test(html))

  if (fallos) {
    console.error(`\n${fallos} comprobación(es) con error.`)
    process.exit(1)
  }
  console.log('\nComunidad pinta el ranking completo.')
  process.exit(0)
}

main()
