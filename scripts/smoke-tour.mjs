/**
 * Tour de la app (estado, render del panel) y las reglas de modo de escucha y
 * permisos que siguen vivas en Funciones y Configuración.
 *
 * Del modo de escucha se comprueba la máquina de estados en la que se apoya
 * «¿ha elegido el usuario un modo alguna vez?» —«¿ha elegido el usuario un modo alguna vez?»—, que es la parte capaz
 * de romperse sin hacer ruido: `listeningMode` siempre tiene valor, así que un
 * despiste devolvería «sí» para un usuario recién instalado y el paso dejaría
 * de bloquear sin que se note en pantalla. El render del panel se comprueba
 * aparte, en smoke-ssr.
 *
 *   npx vite build --ssr scripts/smoke-tour.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-tour.js
 */
import { createSSRApp, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '../src/router/routes.js'
import AppTour from '../src/components/AppTour.vue'
import { useFeatures, sanitizeListeningMode } from '../src/composables/useFeatures.js'
import { useNotifListener } from '../src/composables/useNotifListener.js'
import { useTour, TOUR_STEPS, TOUR_KEY } from '../src/composables/useTour.js'

const failures = []
const FEATURES_KEY = 'skippify-features'

function check (label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(label)
    console.error(`  ✗ ${label} ${extra}`)
  }
}

function contiene (label, real, fragmento) {
  check(`${label}`, typeof real === 'string' && real.includes(fragmento),
    `(recibido: ${JSON.stringify(real).slice(0, 80)})`)
}

function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener () {},
    removeEventListener () {},
    querySelectorAll: () => [],
    createElement: () => ({ innerHTML: '', content: { firstChild: null } })
  }
  globalThis.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/', hash: '' },
    localStorage: globalThis.localStorage,
    addEventListener () {},
    removeEventListener () {},
    matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  }
}

/**
 * Renderiza el panel de la guía. AppTour cambia de pestaña en cada paso, así
 * que necesita un router; sin `isReady()` el render espera a la primera
 * navegación y no termina nunca.
 */
async function renderizarGuia () {
  const app = createSSRApp({
    components: { AppTour },
    template: '<AppTour />'
  })
  // El panel se pinta si el estado compartido dice «abierto».
  const t = useTour()
  t.reset()
  t.autoStart()
  const router = createRouter({ history: createMemoryHistory(), routes })
  app.use(router)
  await router.push('/')
  await router.isReady()
  return renderToString(app)
}

async function main () {
  installBrowserGlobals()

  const { state: features, setListeningMode } = useFeatures()

  console.log('\n¿Ha elegido el usuario un modo de escucha?')

  check('un usuario recién instalado, no', features.listeningModeChosen === false)
  check('aunque listeningMode ya tenga un valor por defecto',
    typeof features.listeningMode === 'string' && features.listeningMode.length > 0)

  setListeningMode('casual')
  check('elegir Casual lo marca como elegido', features.listeningModeChosen === true)
  check('y aplica el modo', features.listeningMode === 'casual')

  setListeningMode('discovery')
  check('cambiar de idea lo mantiene elegido', features.listeningModeChosen === true)
  check('con el modo nuevo', features.listeningMode === 'discovery')

  setListeningMode('custom')
  check('personalizado también cuenta como elección',
    features.listeningModeChosen === true && features.listeningMode === 'custom')

  console.log('\nLa marca sobrevive al guardado')

  // El watch que persiste el estado se vacía en microtarea: leerlo antes de
  // ceder el turno daba un fallo que era de la prueba, no del producto.
  await nextTick()
  const guardado = JSON.parse(globalThis.localStorage.getItem(FEATURES_KEY) || '{}')
  check('se persiste en skippify-features', guardado.listeningModeChosen === true)

  console.log('\nUn valor inventado no cuela')
  setListeningMode('lo-que-sea')
  check('el modo no cambia', features.listeningMode === 'custom')
  check('sanitizeListeningMode cae al de por defecto', sanitizeListeningMode('lo-que-sea') === 'custom')

  console.log('\nEl panel de la guía se renderiza')

  const html = await renderizarGuia()

  check('el panel se pinta', html.includes('Tour de Skippify'))
  check('empieza por la pestaña Inicio', html.includes('>Inicio</h3>'))
  check('y son seis pasos, uno por pantalla', html.includes('1 / 6'))
  check('con un punto por paso', (html.match(/class="[^"]*tour-dot[ "]/g) || []).length === 6)
  check('el primero marcado como actual', /class="(is-current tour-dot|tour-dot is-current)"/.test(html))
  check('muestra la versión', html.includes('tour-badge'))
  check('el esquema es de adorno (inert)', /tour-screen[^>]*inert/.test(html))
  check('y se construye con los componentes de la app (StatTile)', html.includes('sk-stat-hint') || html.includes('sk-eyebrow'))
  check('tiene el botón «Abrir esta ventana»', html.includes('Abrir esta ventana'))
  check('en el primer paso «Anterior» está desactivado', /disabled[^>]*>\s*Anterior/.test(html))
  const puntos = (html.match(/<li class="flex items-start gap-2\.5/g) || []).length
  check('con entre dos y cuatro viñetas', puntos >= 2 && puntos <= 4, `(hay ${puntos})`)

  console.log('\nEstado del tour')

  const tour = useTour()
  tour.reset()
  globalThis.localStorage.removeItem(TOUR_KEY)
  tour.load()
  check('recién instalado: nada empezado', tour.state.started === false && tour.state.open === false)
  check('y sin icono en la cabecera', tour.showHeaderIcon.value === false)

  tour.autoStart()
  check('la primera vez se abre solo en el paso 1', tour.state.open === true && tour.state.step === 0)
  tour.autoStart()
  check('y no se reabre a la fuerza si ya se empezó', tour.state.step === 0)

  tour.next(); tour.next()
  check('Siguiente avanza', tour.state.step === 2)
  tour.prev()
  check('Anterior retrocede', tour.state.step === 1)
  tour.goTo(99)
  check('saltar más allá del final se queda en el último paso', tour.state.step === TOUR_STEPS - 1)
  tour.goTo(-3)
  check('y antes del principio, en el primero', tour.state.step === 0)

  tour.goTo(3)
  tour.minimize()
  check('cerrar sin terminar minimiza', tour.state.open === false && tour.state.minimized === true)
  check('la cabecera ofrece retomarlo', tour.showHeaderIcon.value === true)
  check('en el mismo paso', tour.state.step === 3)

  // Recargar la página: el estado en memoria se pierde, lo guardado no.
  tour.reset()
  tour.load()
  check('al recargar se recuerda el paso', tour.state.step === 3)
  check('y sigue minimizado', tour.showHeaderIcon.value === true)

  tour.resume()
  check('retomar abre el panel', tour.state.open === true && tour.state.minimized === false)
  tour.reset()
  tour.load()
  check('recargar con el panel abierto lo deja abierto', tour.state.open === true && tour.state.step === 3)

  tour.goTo(TOUR_STEPS - 1)
  tour.finish()
  check('terminar cierra el panel', tour.state.open === false && tour.state.finished === true)
  check('y quita el icono de la cabecera', tour.showHeaderIcon.value === false)
  tour.reset()
  tour.load()
  check('al recargar sigue terminado y no se reabre', tour.state.finished === true && tour.state.open === false)
  const guardadoTour = JSON.parse(globalThis.localStorage.getItem(TOUR_KEY) || '{}')
  check('del progreso sólo queda la marca de terminado', guardadoTour.finished === true && guardadoTour.step === undefined)

  tour.start()
  check('desde Configuración se puede repetir, desde el paso 1',
    tour.state.open === true && tour.state.finished === false && tour.state.step === 0)
  tour.minimize()
  tour.goTo(2)
  tour.start()
  check('y si iba a medias, Configuración lo retoma donde estaba', tour.state.step === 2)
  tour.reset()
  globalThis.localStorage.removeItem(TOUR_KEY)

  // ── Permisos: intento, ayuda manual y regla para poder terminar ───────────
  //
  // Las dos reglas de la guía son distintas a propósito. Funciones exige haber
  // ELEGIDO modo, que depende sólo del usuario. Configuración exige haber
  // INTENTADO cada permiso que falte, no tenerlo concedido: hay capas de Android
  // que no dejan abrir el ajuste de batería desde la app, y el permiso de
  // notificaciones deja de preguntarse tras dos negativas, así que exigir el
  // resultado encerraba al usuario en la guía.

  console.log('\nAyuda manual de los permisos')

  const { activarPermiso, permisoIntentado, permisosResueltos, ayudaManual } = useNotifListener()

  check('sin intentarlo no se explica nada', ayudaManual('battery', false) === '')
  check('ni consta como intentado', permisoIntentado('battery') === false)

  await activarPermiso('battery')
  check('pulsar «Activar» deja constancia', permisoIntentado('battery') === true)
  const ayuda = ayudaManual('battery', false)
  check('y si sigue sin concederse, se explica cómo hacerlo a mano', ayuda.length > 0)
  check('nombrando dónde está el ajuste', ayuda.includes('Optimización de batería'))

  check('un permiso concedido no necesita instrucciones', ayudaManual('battery', true) === '')

  await activarPermiso('notif-access')
  contiene('el acceso a notificaciones tiene su propia ruta',
    ayudaManual('notif-access', false), 'Acceso a notificaciones')

  await activarPermiso('post-notifications')
  contiene('y el de mostrar notificaciones avisa de que Android deja de preguntar',
    ayudaManual('post-notifications', false), 'deja de preguntar')

  console.log('\nCuándo se deja terminar la guía')

  // `battery`, `notif-access` y `post-notifications` ya constan como intentados
  // por las comprobaciones de arriba; `sin-tocar` no.
  const ninguno = [{ id: 'sin-tocar', granted: false }]
  const intentado = [{ id: 'battery', granted: false }]
  const concedido = [{ id: 'sin-tocar', granted: true }]

  check('en el navegador se puede terminar siempre',
    permisosResueltos(ninguno, false) === true)
  check('en la app, un permiso sin conceder ni intentar bloquea',
    permisosResueltos(ninguno, true) === false)
  check('haberlo intentado basta, aunque Android no lo concediera',
    permisosResueltos(intentado, true) === true)
  check('y un permiso concedido no hace falta intentarlo',
    permisosResueltos(concedido, true) === true)
  check('basta con que UNO quede sin tocar para seguir bloqueando',
    permisosResueltos([...intentado, ...ninguno], true) === false)

  console.log(`\nGuía rápida: ${failures.length ? `${failures.length} fallo(s)` : 'todo correcto'}.`)
  // Salida explícita: montar la app deja temporizadores vivos (el reloj de
  // reproducción, entre otros) y Node se quedaría esperándolos para siempre,
  // colgando la tanda entera de comprobaciones.
  process.exit(failures.length ? 1 : 0)
}

main().catch((err) => {
  console.error('La comprobación no pudo completarse:', err)
  process.exit(2)
})
