/**
 * Simulación del panel «Temporizador» de Funciones.
 *
 * Comprueba la lectura de la duración en hh:mm, el formato de la cuenta atrás
 * y que el panel se pinta tanto parado como en marcha.
 *
 *   npx vite build --ssr scripts/smoke-temporizador.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-temporizador.js
 */
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

let fallos = 0
function check (etiqueta, ok, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
  if (!ok) fallos += 1
}

async function main () {
  const {
    duracionMs, formatoCuenta, formatoDuracion, useSleepTimer
  } = await import('../src/composables/useSleepTimer.js')

  console.log('\nDuración en hh:mm')
  check('01:30 son 90 minutos', duracionMs('01', '30') === 90 * 60_000)
  check('00:00 no vale', duracionMs('00', '00') === 0)
  check('minutos por encima de 59 no valen', duracionMs('0', '75') === 0)
  check('24 horas no caben en hh:mm', duracionMs('24', '00') === 0)
  check('23:59 es el tope', duracionMs('23', '59') === (23 * 60 + 59) * 60_000)
  check('texto que no es número no vale', duracionMs('a', 'b') === 0)
  check('campos vacíos no valen', duracionMs('', '') === 0)

  console.log('\nFormato')
  check('cuenta sin horas', formatoCuenta(4 * 60_000 + 7_000) === '4:07', formatoCuenta(247_000))
  check('cuenta con horas', formatoCuenta(3_909_000) === '1:05:09', formatoCuenta(3_909_000))
  check('nunca en negativo', formatoCuenta(-5_000) === '0:00')
  check('duraciones de los presets', formatoDuracion(90) === '1 h 30 min' && formatoDuracion(60) === '1 h' && formatoDuracion(15) === '15 min')

  console.log('\nPanel')
  const { default: SleepTimerSettings } = await import('../src/components/SleepTimerSettings.vue')
  const pintar = () => renderToString(createSSRApp({ render: () => h(SleepTimerSettings) }))

  const parado = await pintar()
  check('parado ofrece los presets', parado.includes('1 h 30 min') && parado.includes('Iniciar temporizador'))
  check('explica el orden del cierre', parado.includes('Pausar al acabar la canción') && parado.includes('Sonido de aviso'))
  check('ya no ofrece nada de Bluetooth', !/bluetooth/i.test(parado))

  const { state } = useSleepTimer()
  state.phase = 'counting'
  state.now = Date.now()
  state.endAt = state.now + 30 * 60_000
  const enMarcha = await pintar()
  check('en marcha enseña la cuenta atrás', enMarcha.includes('30:00'))
  check('en marcha se puede cancelar y alargar', enMarcha.includes('Cancelar') && enMarcha.includes('+15 min'))

  state.phase = 'waiting'
  const esperando = await pintar()
  check('agotado el tiempo espera a que acabe la canción', esperando.includes('Esperando a que acabe la canción'))

  console.log(fallos ? `\n${fallos} comprobación(es) fallida(s)` : '\nTemporizador: todo correcto')
  if (fallos) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
