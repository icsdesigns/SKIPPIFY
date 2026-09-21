/**
 * Simulación del cartel «Reproducción actual» de la pantalla de inicio.
 *
 * Se renderiza el componente suelto con una reproducción en marcha y con la
 * pantalla parada, y se comprueba el marcado: que el contenido va centrado
 * —disco, título, artista y fichas sobre un mismo eje— y que el anillo, la
 * barra y los tiempos salen con los valores que tocan.
 *
 *   npx vite build --ssr scripts/smoke-inicio.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-inicio.js
 */
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

function installBrowserGlobals () {
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener () {},
    removeEventListener () {}
  }
}

let fallos = 0
function check (etiqueta, ok, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
  if (!ok) fallos += 1
}

async function pintar (NowPlaying, state) {
  const app = createSSRApp({ render: () => h(NowPlaying, { state }) })
  app.config.warnHandler = (msg) => console.warn(`  ! aviso: ${msg}`)
  return renderToString(app)
}

async function main () {
  installBrowserGlobals()
  const { default: NowPlaying } = await import('../src/components/NowPlaying.vue')

  const sonando = await pintar(NowPlaying, {
    mode: 'playing',
    track: 'Everything Is Embarrassing',
    artist: 'Sky Ferreira',
    album: 'Night Time, My Time',
    durationMs: 240000,
    progressPct: 25,
    progressSyncedAt: Date.now()
  })

  if (process.argv.includes('--html')) console.log(sonando.replace(/></g, '>\n<'))

  console.log('\nContenido centrado')
  // El eje es uno solo: el rótulo, el disco con el texto y la fila de fichas.
  check('el rótulo va centrado',
    /<div class="flex items-center justify-center gap-2"/.test(sonando),
    'la fila del punto de estado y «Reproducción actual» sigue alineada a la izquierda')
  check('el disco y el texto van centrados y con el texto al medio',
    /items-center gap-4 text-center[^"]*sm:justify-center/.test(sonando),
    'el bloque disco + texto no está centrado')
  check('el disco ya no se pega arriba a la izquierda en móvil',
    !/self-start/.test(sonando),
    '`self-start` dejaba el disco alineado al borde en la columna de móvil')
  check('las fichas de álbum y duración van centradas',
    /flex flex-wrap items-center justify-center gap-1\.5/.test(sonando))

  console.log('\nCifras del cartel')
  check('el título y el artista se pintan',
    sonando.includes('Everything Is Embarrassing') && sonando.includes('Sky Ferreira'))
  check('la duración sale como reloj', sonando.includes('4:00'))
  check('el porcentaje de avance sale', sonando.includes('25%'))
  check('el transcurrido sale', sonando.includes('1:00'))
  check('mientras suena hay ecualizador, no icono',
    sonando.includes('sk-eq-bar'))

  const parado = await pintar(NowPlaying, { mode: 'stopped' })

  console.log('\nSin reproducción')
  check('texto de reposo', parado.includes('Sin música'))
  check('sin barra de avance', !parado.includes('tabular-nums'))
  check('sigue centrado', /<div class="flex items-center justify-center gap-2"/.test(parado))

  if (fallos) {
    console.error(`\n${fallos} comprobación(es) con error.`)
    process.exit(1)
  }
  console.log('\nEl cartel de inicio se pinta centrado y con sus cifras.')
  process.exit(0)
}

main()
