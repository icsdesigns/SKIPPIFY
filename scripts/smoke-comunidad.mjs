/**
 * Simulación de la pestaña Grupos con un ranking ya calculado.
 *
 * Se inyectan miembros y resultados de mentira en el estado de useLocalLeague y
 * se renderiza la vista en servidor, que es donde se comprueba el HTML.
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

const GRUPO_LOCAL = 'lh_0011223344556677'
const NOMBRE_LOCAL_LARGO = 'Los del garaje de la calle Reyes'

/** Tres fichas: una con todas las cifras nuevas y dos más sencillas. */
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

  localStorage.setItem('skippify-localhost-state', JSON.stringify({
    displayName: 'Ana',
    groups: [{ groupId: GRUPO_LOCAL, name: NOMBRE_LOCAL_LARGO, role: 'owner', relays: [] }],
    activeGroupId: GRUPO_LOCAL
  }))

  const { useLocalLeague } = await import('../src/composables/useLocalLeague.js')
  const liga = useLocalLeague()
  const yoSoy = (uid) => MIEMBROS.map(m => ({
    uid: m.uid,
    displayName: m.displayName,
    role: m.uid === 'uid-ana' ? 'owner' : 'member',
    you: m.uid === uid
  }))
  liga.members[GRUPO_LOCAL] = yoSoy('uid-ana')
  const semana = (weekKey, members) => ({ weekKey, weekStart: weekKey, weekEnd: weekKey, provisional: false, members })
  liga.semanas[GRUPO_LOCAL] = {
    actual: semana('2026-09-14', MIEMBROS),
    pasada: semana('2026-09-07', MIEMBROS.slice(0, 1)),
    hace2: semana('2026-08-31', [])
  }

  const { routes } = await import('../src/router/routes.js')
  const { default: App } = await import('../src/App.vue')

  async function render (ruta) {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const app = createSSRApp(App)
    app.use(router)
    app.config.warnHandler = (msg) => console.warn(`  ! aviso: ${msg}`)
    await router.push(ruta)
    await router.isReady()
    return renderToString(app)
  }

  const html = await render('/comunidad')
  if (process.argv.includes('--html')) {
    console.log(html.slice(html.indexOf('data-selector-grupos')).replace(/></g, '>\n<'))
  }

  let fallos = 0
  const check = (etiqueta, ok, detalle = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
    if (!ok) fallos += 1
  }
  const texto = (t) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const detalle = html.slice(html.indexOf('data-grupo-detalle'))

  console.log('\nPestaña y desplegable')
  {
    const selector = html.slice(html.indexOf('data-selector-grupos'), html.indexOf('data-grupo-detalle'))
    check('la pestaña se llama Grupos', routes.find(r => r.path === '/comunidad').meta.title === 'Grupos')
    check('el selector es un desplegable con el grupo actual', selector.includes('aria-haspopup="listbox"') && selector.includes(NOMBRE_LOCAL_LARGO))
    check('la cuenta de grupos', texto(selector).includes('1 / 5'))
    check('las opciones de alta no están a la vista', !html.includes('Tu nombre en los rankings') && !html.includes('Crear grupo'))
    check('ya no hay modo con servidor', !html.includes('data-raiz') && !html.includes('Con servidor') && !html.includes('comunidad-alta-servidor'))
  }

  console.log('\nGrupo: cabecera, ranking, escucha común e invitar/abandonar')
  {
    check('título y número de miembros', detalle.includes('3 miembros') && detalle.includes(NOMBRE_LOCAL_LARGO))
    check('botón de actualizar sólo con icono', /aria-label="Actualizar"[^>]*>\s*<svg/.test(detalle) && !detalle.includes('>Actualizar<'))
    check('Ranking y Escucha común, en ese orden',
      detalle.indexOf('data-seccion="ranking"') > 0 && detalle.indexOf('data-seccion="comun"') > detalle.indexOf('data-seccion="ranking"'))
    check('cada una con su desplegable de semana',
      detalle.split('aria-label="Semana del ranking"').length === 2 &&
      detalle.split('aria-label="Semana de la escucha común"').length === 2 &&
      detalle.includes('Semana pasada') && detalle.includes('Hace 2 semanas'))
    check('Ranking desplegado y Escucha común plegada',
      /aria-expanded="true"[^>]*aria-controls="seccion-ranking"|aria-controls="seccion-ranking"[^>]*aria-expanded="true"/.test(detalle) &&
      /aria-expanded="false"[^>]*aria-controls="seccion-comun"|aria-controls="seccion-comun"[^>]*aria-expanded="false"/.test(detalle))
    check('botones Invitar y Abandonar', /Invitar\s*<\/button>/.test(detalle) && /Abandonar/.test(detalle))
    check('nada de invitación larga, vincular ni copia de seguridad',
      !html.includes('Invitación larga') && !html.includes('Vincular') && !html.includes('Copia de seguridad'))
    check('ni las pestañas antiguas ni la portada de cifras', !html.includes('data-pestana') && !html.includes('Líder'))
  }

  console.log('\nFichas del ranking')
  {
    const cifra = (clave) => {
      const i = html.indexOf(`data-cifra="${clave}"`)
      return i < 0 ? '' : html.slice(i, html.indexOf('</li>', i))
    }
    check('las cifras nuevas van en el mosaico', cifra('terminadas').includes('82 %') && cifra('sesion').includes('11 sesiones'), cifra('terminadas'))
    check('la ficha propia viene desplegada y las demás plegadas',
      /data-miembro="uid-ana"[\s\S]*?aria-expanded="true"/.test(html) && /data-miembro="uid-largo"[\s\S]*?aria-expanded="false"/.test(html))
    check('el podio lleva medallas', /oro text-black/.test(html) && /plata text-black/.test(html) && /bronce text-black/.test(html))
    check('el ranking va por tiempo de escucha', html.indexOf('Ana') < html.indexOf('Bartolomé') && html.indexOf('Bartolomé') < html.indexOf('Carlos'))
    check('el orden visual lo da `order`, sin mover nodos', /order: ?1/.test(html) && /order: ?2/.test(html))
    check('aparece la escucha común entre dos miembros con datos', html.includes('Ana · Bartolomé de las Casas Fernández'))
    check('una ficha antigua no genera una pareja', !html.includes('Carlos ·') && !html.includes('· Carlos'))
    check('el administrador puede expulsar a otros pero no a sí mismo',
      html.includes('data-expulsar="uid-largo"') && html.includes('data-expulsar="uid-viejo"') && !html.includes('data-expulsar="uid-ana"'))
    check('sin huecos ni NaN', !html.includes('undefined') && !html.includes('NaN'))
    check('el panel «¿Cómo funciona?» va plegado con grupos', /data-info-comunidad[\s\S]{0,400}aria-expanded="false"/.test(html))
  }

  console.log('\nUn miembro que no es administrador')
  {
    liga.members[GRUPO_LOCAL] = yoSoy('uid-largo')
    const h2 = await render('/comunidad')
    const d2 = h2.slice(h2.indexOf('data-grupo-detalle'))
    check('no ve Invitar ni Expulsar', !/Invitar/.test(d2) && !h2.includes('data-expulsar'))
    check('pero sí Abandonar', /Abandonar/.test(d2))
  }

  console.log('\nAjustes')
  {
    const h3 = await render('/settings')
    check('sin paneles de grupos con servidor ni de comunidad',
      !h3.includes('Grupos con servidor') && !h3.includes('Comunidad sin servidor') && !h3.includes('data-ajuste="grupos-con-servidor"'))
  }

  if (fallos) {
    console.error(`\n${fallos} comprobación(es) con error.`)
    process.exit(1)
  }
  console.log('\nGrupos pinta el ranking completo.')
  process.exit(0)
}

main()
