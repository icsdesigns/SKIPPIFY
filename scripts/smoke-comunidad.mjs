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

  // El detalle del grupo se monta con <Teleport defer> dentro del panel abierto.
  // En servidor no hay clic que abra nada, así que se renderiza el panel con el
  // grupo ya abierto y se lee lo teletransportado del contexto.
  const { default: LocalHostPanel } = await import('../src/components/LocalHostPanel.vue')
  async function renderDetalle (abierto = GRUPO_LOCAL) {
    const app = createSSRApp(LocalHostPanel, { abierto })
    app.config.warnHandler = (msg) => console.warn(`  ! aviso: ${msg}`)
    const ctx = {}
    await renderToString(app, ctx)
    return ctx.teleports?.[`#grupo-cuerpo-${GRUPO_LOCAL}`] || ''
  }
  const detalle = await renderDetalle()
  // El panel de cada grupo lee el estado en vivo, que no se conecta hasta que se
  // monta LocalHostPanel (después de pintar la lista): en la segunda pasada ya está.
  const htmlVivo = await render('/comunidad')
  if (process.argv.includes('--html')) {
    console.log(html.slice(html.indexOf('data-grupo-panel')).replace(/></g, '>\n<'))
    console.log(detalle.replace(/></g, '>\n<'))
  }

  let fallos = 0
  const check = (etiqueta, ok, detalle = '') => {
    console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
    if (!ok) fallos += 1
  }
  const texto = (t) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  console.log('\nPestaña: paneles de grupos y opciones de alta')
  {
    const panel = htmlVivo.slice(htmlVivo.indexOf('data-grupo-panel'), htmlVivo.indexOf('data-anadir-grupo'))
    const anadir = html.slice(html.indexOf('data-anadir-grupo'))
    check('la pestaña se llama Grupos', routes.find(r => r.path === '/comunidad').meta.title === 'Grupos')
    check('cada grupo es un panel plegado con su nombre y sus miembros',
      panel.includes(NOMBRE_LOCAL_LARGO) && texto(panel).includes('3 miembros') && /aria-expanded="false"/.test(panel) && !/aria-expanded="true"/.test(panel))
    check('ya no hay desplegable de grupos', !html.includes('aria-haspopup="listbox"') && !html.includes('data-selector-grupos'))
    check('al final, las opciones de añadir grupo con su cuenta',
      html.indexOf('data-anadir-grupo') > html.indexOf('data-grupo-panel') &&
      texto(anadir).includes('Crear grupo') && texto(anadir).includes('Unirme') && texto(anadir).includes('1 / 5'))
    check('el formulario de alta sólo sale en la hoja', !html.includes('Tu nombre en los rankings'))
    check('ya no hay modo con servidor', !html.includes('data-raiz') && !html.includes('Con servidor') && !html.includes('comunidad-alta-servidor'))
  }

  console.log('\nGrupo abierto: ranking, escucha común e invitar/abandonar')
  {
    check('el detalle se monta dentro del panel del grupo', detalle.includes('data-grupo-detalle'))
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
    check('el administrador ve el lápiz para cambiar el nombre', detalle.includes('data-renombrar'))
    check('nada de invitación larga, vincular ni copia de seguridad',
      !html.includes('Invitación larga') && !html.includes('Vincular') && !html.includes('Copia de seguridad'))
    check('ni las pestañas antiguas ni la portada de cifras', !html.includes('data-pestana') && !html.includes('Líder'))
    check('el aviso «provisional» ya no está en el ranking', !/Provisional:/.test(detalle))
  }

  console.log('\nFichas del ranking')
  {
    const cifra = (clave) => {
      const i = detalle.indexOf(`data-cifra="${clave}"`)
      return i < 0 ? '' : detalle.slice(i, detalle.indexOf('</li>', i))
    }
    check('las cifras nuevas van en el mosaico', cifra('terminadas').includes('82 %') && cifra('sesion').includes('11 sesiones'), cifra('terminadas'))
    check('todas las fichas vienen plegadas, también la propia',
      /data-miembro="uid-ana"[\s\S]*?aria-expanded="false"/.test(detalle) && /data-miembro="uid-largo"[\s\S]*?aria-expanded="false"/.test(detalle) &&
      !/data-miembro="uid-ana"[\s\S]{0,900}aria-expanded="true"/.test(detalle))
    check('el podio lleva medallas', /oro text-black/.test(detalle) && /plata text-black/.test(detalle) && /bronce text-black/.test(detalle))
    check('el ranking va por tiempo de escucha', detalle.indexOf('Ana') < detalle.indexOf('Bartolomé') && detalle.indexOf('Bartolomé') < detalle.indexOf('Carlos'))
    check('el orden visual lo da `order`, sin mover nodos', /order: ?1/.test(detalle) && /order: ?2/.test(detalle))
    check('aparece la escucha común entre dos miembros con datos', detalle.includes('Ana · Bartolomé de las Casas Fernández'))
    check('una ficha antigua no genera una pareja', !detalle.includes('Carlos ·') && !detalle.includes('· Carlos'))
    const dentro = (uid) => {
      const ficha = detalle.indexOf(`id="ficha-${uid}"`)
      return ficha > 0 && detalle.indexOf(`data-expulsar="${uid}"`) > ficha
    }
    check('el administrador puede expulsar a otros pero no a sí mismo',
      detalle.includes('data-expulsar="uid-largo"') && detalle.includes('data-expulsar="uid-viejo"') && !detalle.includes('data-expulsar="uid-ana"'))
    check('«Expulsar» vive dentro de la ficha desplegable, no a la vista', dentro('uid-largo') && dentro('uid-viejo'))
    check('con tres miembros no hay «Ver todos»', !detalle.includes('data-ver-todos'))
    check('sin huecos ni NaN', !detalle.includes('undefined') && !detalle.includes('NaN'))
    check('el panel «¿Cómo funciona?» va plegado con grupos', /data-info-comunidad[\s\S]{0,400}aria-expanded="false"/.test(html))
    check('el aviso «provisional» está en «¿Cómo funciona?»', /provisionales/.test(html.slice(html.indexOf('data-info-comunidad'))))
  }

  console.log('\nTop 3 con «Ver todos»')
  {
    const extra = ['uid-d', 'uid-e'].map((uid, i) => ({
      uid, displayName: i ? 'Elena' : 'Diego', totalMinutes: 50 - i * 10, totalTracks: 10, completedTracks: 8, activeDays: 1, score: 50,
      topArtist: '', topArtistPlays: 0, topTrack: '', topTrackPlays: 0
    }))
    const todos = [...MIEMBROS, ...extra]
    liga.members[GRUPO_LOCAL] = todos.map(m => ({ uid: m.uid, displayName: m.displayName, role: m.uid === 'uid-ana' ? 'owner' : 'member', you: m.uid === 'uid-ana' }))
    liga.semanas[GRUPO_LOCAL] = { ...liga.semanas[GRUPO_LOCAL], actual: semana('2026-09-14', todos) }
    const d5 = await renderDetalle()
    check('con cinco miembros sólo salen tres fichas', (d5.match(/data-miembro="/g) || []).length === 3)
    check('el botón «Ver todos» los cuenta', /data-ver-todos[\s\S]{0,200}Ver todos \(5\)/.test(d5))
    liga.members[GRUPO_LOCAL] = yoSoy('uid-ana')
    liga.semanas[GRUPO_LOCAL] = { ...liga.semanas[GRUPO_LOCAL], actual: semana('2026-09-14', MIEMBROS) }
  }

  console.log('\nUn miembro que no es administrador')
  {
    liga.members[GRUPO_LOCAL] = yoSoy('uid-largo')
    const d2 = await renderDetalle()
    check('no ve Invitar, Expulsar ni el lápiz de renombrar', !/Invitar/.test(d2) && !d2.includes('data-expulsar') && !d2.includes('data-renombrar'))
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
