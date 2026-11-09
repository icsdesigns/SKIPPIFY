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
import GuiaInteractiva from '../src/components/GuiaInteractiva.vue'
import { guiaMacros, guiaFunciones, guiaGrupos, GUIAS, guiaDeRuta } from '../src/guias/index.js'
import { GRUPOS_GUIDE_KEY, GRUPOS_GUIDE_STEPS } from '../src/guias/grupos.js'
import { FUNCIONES_GUIDE_KEY, FUNCIONES_GUIDE_STEPS } from '../src/guias/funciones.js'
import { crearGuia } from '../src/composables/crearGuia.js'
import { MACROS_GUIDE_STEPS, MACROS_GUIDE_KEY } from '../src/guias/macros.js'

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
  const puntos = (html.match(/<li><div class="[^"]*rounded-xl border/g) || []).length
  check('con entre dos y cuatro tarjetas de opción', puntos >= 2 && puntos <= 4, `(hay ${puntos})`)
  check('compactas (tesela de 40 px, no la grande)', html.includes('h-10 w-10 rounded-xl') && !html.includes('h-14 w-14'))
  check('y sin viñetas sueltas', !html.includes('rounded-full bg-brand-400'))

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

  console.log('\nGuía animada de Macros')

  const g = guiaMacros
  g.reset()
  check('antes de la primera visita no hay icono en la cabecera', g.showHeaderIcon.value === false)
  check('la primera visita la abre sola', g.autoStart() === true && g.state.open === true)
  check('desde el primer paso', g.state.step === 0)
  check('con el panel abierto no se enseña el icono', g.showHeaderIcon.value === false)

  const pintarG = () => renderToString(createSSRApp({
    components: { GuiaInteractiva },
    setup: () => ({ guia: guiaMacros }),
    template: '<GuiaInteractiva :guia="guia" />'
  }))
  const htmlG = await pintarG()
  check('el panel se pinta', htmlG.includes('Cómo funciona la pestaña Macros'))
  check('son cuatro pasos', htmlG.includes('1 / 4') && MACROS_GUIDE_STEPS === 4 && (htmlG.match(/class="[^"]*gi-dot[ "]/g) || []).length === MACROS_GUIDE_STEPS)
  check('la clave es la v2 (el contenido cambió: se vuelve a ver)', MACROS_GUIDE_KEY === 'skippify.macros-guide.v2')
  check('los puntos son tarjetas de opción compactas', htmlG.includes('h-10 w-10 rounded-xl') && htmlG.includes('Tú decides cuándo'))
  check('el primero es la ejecución manual', htmlG.includes('Origen: ejecución manual') && htmlG.includes('mg-tap'))

  g.next()
  const htmlCopiar = await pintarG()
  check('el segundo es copiar, con las notas viajando',
    htmlCopiar.includes('Acción: copiar') && htmlCopiar.includes('mg-note'))

  g.next()
  const htmlMeGusta = await pintarG()
  check('el tercero es Tus me gusta, con la misma macro de ejemplo',
    htmlMeGusta.includes('Destino: Tus me gusta') && htmlMeGusta.includes('Ejecución manual') && htmlMeGusta.includes('mg-heart'))

  g.next()
  const htmlBoton = await pintarG()
  check('el cuarto aplica la macro al botón de los auriculares',
    htmlBoton.includes('botón de los auriculares') && htmlBoton.includes('Guardar lo que suena') && htmlBoton.includes('Aviso sonoro'))
  check('sin aviso flotante que se solape con las tarjetas (ya no hay mg-toast)', !htmlBoton.includes('mg-toast'))
  check('y en el último «Siguiente» pasa a «Entendido»', htmlBoton.includes('Entendido'))
  g.next()
  check('no se pasa del último paso', g.state.step === MACROS_GUIDE_STEPS - 1)

  g.minimize()
  check('al cerrarla queda el icono en la cabecera', g.showHeaderIcon.value === true)
  check('conservando el paso', g.state.step === MACROS_GUIDE_STEPS - 1)
  g.open()
  check('el icono la reabre en el mismo paso', g.state.open === true && g.state.step === MACROS_GUIDE_STEPS - 1)
  g.finish()
  check('terminarla la cierra y la próxima empieza de cero', g.state.open === false && g.state.step === 0)
  check('pero el icono se queda para repasarla', g.showHeaderIcon.value === true)
  check('y ya no se abre sola', g.autoStart() === false && g.state.open === false)
  const guardadoG = JSON.parse(globalThis.localStorage.getItem(MACROS_GUIDE_KEY) || '{}')
  check('lo visto se guarda', guardadoG.seen === true)

  console.log('\nGuía animada de Funciones')

  const gf = guiaFunciones
  gf.reset()
  check('tiene su propia clave de localStorage', gf.clave === FUNCIONES_GUIDE_KEY && gf.clave !== MACROS_GUIDE_KEY)
  check('está registrada para la ruta de Funciones', guiaDeRuta('/features') === gf && GUIAS.includes(gf))
  check('Macros sigue en su ruta', guiaDeRuta('/macros') === guiaMacros)
  check('tiene un paso por funcionalidad', FUNCIONES_GUIDE_STEPS === 6)
  check('la primera visita la abre sola, una vez', gf.autoStart() === true && gf.autoStart() === false)
  const pintarF = () => renderToString(createSSRApp({
    components: { GuiaInteractiva },
    setup: () => ({ guia: guiaFunciones }),
    template: '<GuiaInteractiva :guia="guia" />'
  }))
  const titulosF = ['Salto de duplicadas', 'Elige un modo de escucha', 'Calibra el salto', 'Silencia los anuncios', 'Temporizador', 'Ajustes rápidos']
  const clavesEscena = ['fg-skip', 'Descubrimiento', 'Prueba guiada', 'Anuncio detectado', 'Música pausada', 'Anuncios']
  for (let i = 0; i < titulosF.length; i++) {
    gf.goTo(i)
    const h = await pintarF()
    check(`paso ${i + 1}: «${titulosF[i]}» con su escena y tarjetas compactas`,
      h.includes(titulosF[i]) && h.includes(clavesEscena[i]) && h.includes('h-10 w-10 rounded-xl') && h.includes(`${i + 1} / 6`))
  }
  check('y todos los puntos llevan icono propio (sin emoji)',
    guiaFunciones.pasos.every(p => p.puntos.every(pt => /^(ajuste|feature|macro):/.test(pt.icono) && !/\p{Extended_Pictographic}/u.test(pt.titulo + pt.detalle))))
  gf.finish()
  const guardadoF = JSON.parse(globalThis.localStorage.getItem(FUNCIONES_GUIDE_KEY) || '{}')
  check('lo visto se guarda en su clave', guardadoF.seen === true)

  console.log('\nGuía animada de Grupos')

  const gg = guiaGrupos
  gg.reset()
  check('tiene su propia clave de localStorage', gg.clave === GRUPOS_GUIDE_KEY && gg.clave !== FUNCIONES_GUIDE_KEY && gg.clave !== MACROS_GUIDE_KEY)
  check('está registrada para la ruta de Grupos', guiaDeRuta('/comunidad') === gg && GUIAS.includes(gg))
  check('Macros y Funciones siguen en las suyas', guiaDeRuta('/macros') === guiaMacros && guiaDeRuta('/features') === guiaFunciones)
  check('cinco pasos', GRUPOS_GUIDE_STEPS === 5)
  check('la primera visita la abre sola, una vez', gg.autoStart() === true && gg.autoStart() === false)
  const pintarGr = () => renderToString(createSSRApp({
    components: { GuiaInteractiva },
    setup: () => ({ guia: guiaGrupos }),
    template: '<GuiaInteractiva :guia="guia" />'
  }))
  const titulosGr = ['Grupos sin servidor', 'Crea un grupo o únete', 'Resumen y ranking', 'Escucha común', 'Privacidad y app cerrada']
  const clavesGr = ['Cifrado, sin servidor', 'Invitación exprés', 'Cifras provisionales', 'en común', 'Sólo ven IP']
  for (let i = 0; i < titulosGr.length; i++) {
    gg.goTo(i)
    const h = await pintarGr()
    check(`paso ${i + 1}: «${titulosGr[i]}» con su escena y tarjetas compactas`,
      h.includes(titulosGr[i]) && h.includes(clavesGr[i]) && h.includes('h-10 w-10 rounded-xl') && h.includes(`${i + 1} / 5`))
  }
  const textoGr = guiaGrupos.pasos.map(p => p.puntos.map(pt => pt.titulo + ' ' + pt.detalle).join(' ')).join(' ')
  check('explica cifrado, invitación de 1 hora, administrador, relays y la app cerrada',
    /cifrad/i.test(textoGr) && /1 hora/.test(textoGr) && /administrador/i.test(textoGr) && /relays/i.test(textoGr) && /app cerrada/i.test(textoGr))
  check('los puntos llevan icono propio, sin emoji y con tarjetas acotadas (título ≤ 60, detalle ≤ 140)',
    guiaGrupos.pasos.every(p => p.puntos.every(pt => /^(ajuste|feature|macro):/.test(pt.icono) && !/\p{Extended_Pictographic}/u.test(pt.titulo + pt.detalle) && pt.titulo.length <= 60 && pt.detalle.length <= 140)))
  gg.finish()
  check('lo visto se guarda en su clave', JSON.parse(globalThis.localStorage.getItem(GRUPOS_GUIDE_KEY) || '{}').seen === true)

  console.log('\nFábrica de guías')

  const guiaPrueba = crearGuia({
    id: 'prueba', clave: 'skippify.prueba-guide.v1', ruta: '/prueba', etiqueta: 'Prueba',
    pasos: [
      { id: 'a', titulo: 'Uno', puntos: [{ icono: 'ajuste:ayuda', titulo: 'T', detalle: 'D' }] },
      { id: 'b', titulo: 'Dos', puntos: [{ icono: 'macro:copiar', titulo: 'T2', detalle: 'D2' }] }
    ]
  })
  check('cada guía tiene su propia clave y su propio estado',
    guiaPrueba.clave !== MACROS_GUIDE_KEY && guiaPrueba.state !== guiaMacros.state)
  check('la cabecera encuentra la guía por la ruta', guiaDeRuta('/prueba') === guiaPrueba && guiaDeRuta('/macros') === guiaMacros)
  check('una pestaña sin guía no tiene botón', guiaDeRuta('/stats') === null)
  check('Macros figura en la lista de guías', GUIAS.includes(guiaMacros))
  guiaPrueba.autoStart(); guiaPrueba.next(); guiaPrueba.next()
  check('la guía nueva avanza y se detiene en el último paso', guiaPrueba.state.step === 1)
  check('y guarda en su clave, no en la de Macros',
    JSON.parse(globalThis.localStorage.getItem('skippify.prueba-guide.v1') || '{}').seen === true)

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
