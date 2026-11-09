/**
 * Aviso de versión nueva: el plazo de 6 horas desde la publicación, en el lado
 * JS (el nativo se prueba en scripts/native-tests/PruebasActualizaciones.java).
 *
 *   node scripts/smoke-actualizaciones.mjs
 *
 * Reglas que se comprueban:
 *   · una release de menos de 6 h NO se anuncia al abrir la app (comprobación
 *     automática) y se programa una nueva mirada para cuando cumpla el plazo;
 *   · con 6 h o más SÍ, y sin fecha legible (published_at/created_at) también;
 *   · la búsqueda manual («Buscar actualizaciones») ignora el plazo;
 *   · «Ahora no» y «Posponer 1 semana» siguen funcionando.
 */
import {
  RETRASO_AVISO_MS, TOLERANCIA_RELOJ_MS, parsearFecha, fechaDeRelease, evaluarRetraso
} from '../src/lib/avisoActualizacion.js'

let fallos = 0
function check (etiqueta, ok, detalle = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok || !detalle ? '' : `\n      ${detalle}`}`)
  if (!ok) fallos += 1
}

const H = 60 * 60 * 1000
const MIN = 60 * 1000
const AHORA = Date.parse('2026-06-10T12:00:00Z')

// ── Entorno mínimo: reloj y temporizadores falsos, localStorage, plugin y GitHub ──
let reloj = AHORA
Date.now = () => reloj
const temporizadores = []
globalThis.setTimeout = (fn, ms) => {
  const t = { fn, ms, cancelado: false, unref () {} }
  temporizadores.push(t)
  return t
}
globalThis.clearTimeout = t => { if (t) t.cancelado = true }
const pendientes = () => temporizadores.filter(t => !t.cancelado)

const almacen = new Map()
globalThis.localStorage = {
  getItem: k => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: k => almacen.delete(k)
}
globalThis.window = { Capacitor: { Plugins: { Updater: {
  getStatus: async () => ({ versionName: '4.5.5', versionCode: 455, canInstall: true }),
  addListener: async () => ({ remove () {} })
} } } }

let release = null
globalThis.fetch = async () => ({ ok: true, json: async () => release })

const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z')
function nueva ({ code = 460, publicada, creada } = {}) {
  const r = { tag_name: `v4.6.0-b${code}`, body: '', assets: [{ name: 'a.apk', browser_download_url: 'https://x/a.apk', size: 1 }] }
  if (publicada !== undefined) r.published_at = publicada
  if (creada !== undefined) r.created_at = creada
  return r
}

let n = 0
async function modulo () {
  almacen.clear()
  temporizadores.length = 0
  reloj = AHORA
  const { useAppUpdate } = await import(`../src/composables/useAppUpdate.js?caso=${n += 1}`)
  return useAppUpdate()
}

// ── Fechas y regla pura ──
console.log('Fecha y regla del plazo (JS)')
{
  check('el plazo son 6 horas', RETRASO_AVISO_MS === 6 * H)
  check('published_at ISO UTC se lee', parsearFecha('2026-06-10T11:00:00Z') === AHORA - H)
  check('con zona horaria se lee', parsearFecha('2026-06-10T13:00:00+02:00') === AHORA - H)
  check('sin zona se toma como UTC', parsearFecha('2026-06-10T11:00:00') === AHORA - H)
  check('basura, vacío y nulo dan 0', parsearFecha('ayer') === 0 && parsearFecha('') === 0 && parsearFecha(null) === 0)
  check('created_at vale si falta published_at', fechaDeRelease({ created_at: '2026-06-10T11:00:00Z' }) === AHORA - H)
  check('published_at manda sobre created_at', fechaDeRelease({ published_at: '2026-06-10T11:00:00Z', created_at: '2026-01-01T00:00:00Z' }) === AHORA - H)
  check('published_at ilegible cae a created_at', fechaDeRelease({ published_at: '??', created_at: '2026-06-10T11:00:00Z' }) === AHORA - H)
  check('sin ninguna fecha, 0', fechaDeRelease({}) === 0)
  check('a 1 ms del plazo sigue retenida', evaluarRetraso(AHORA, AHORA - 6 * H + 1).retenida === true)
  check('justo a las 6 h ya no', evaluarRetraso(AHORA, AHORA - 6 * H).retenida === false)
  check('sin fecha no se retiene', evaluarRetraso(AHORA, 0).retenida === false)
  check('reloj unos minutos atrasado: retenida', evaluarRetraso(AHORA, AHORA + 5 * MIN).retenida === true)
  check('reloj muy atrasado (fecha > tolerancia): no se retiene', evaluarRetraso(AHORA, AHORA + TOLERANCIA_RELOJ_MS + 1).retenida === false)
}

console.log('\nAviso al abrir la app (comprobación automática)')
{
  let u = await modulo()
  release = nueva({ publicada: iso(AHORA - 1 * H) })
  check('publicada hace 1 h: no se anuncia', (await u.check()) === false && u.shouldPrompt.value === false && u.status.value === 'idle')
  const t = pendientes()
  check('y se programa volver a mirar al cumplirse el plazo (+1 min)', t.length === 1 && t[0].ms === 5 * H + 1 * MIN, JSON.stringify(t.map(x => x.ms)))

  // Cumplido el plazo con la app aún abierta: salta el temporizador y se anuncia.
  reloj = AHORA + 5 * H + 2 * MIN
  await t[0].fn()
  check('al saltar el temporizador (plazo cumplido) se anuncia', u.shouldPrompt.value === true && u.status.value === 'available')

  u = await modulo()
  release = nueva({ publicada: iso(AHORA - 6 * H) })
  check('publicada hace justo 6 h: se anuncia', (await u.check()) === true && u.shouldPrompt.value === true && pendientes().length === 0)

  u = await modulo()
  release = nueva({ publicada: iso(AHORA - 3 * 24 * H) })
  check('publicada hace días: se anuncia al momento', (await u.check()) === true && u.shouldPrompt.value === true)

  u = await modulo()
  release = nueva()
  check('sin ninguna fecha: se anuncia (comportamiento previo)', (await u.check()) === true && u.shouldPrompt.value === true)

  u = await modulo()
  release = nueva({ creada: iso(AHORA - 1 * H) })
  check('sin published_at, created_at reciente: se retiene', (await u.check()) === false && u.shouldPrompt.value === false)

  u = await modulo()
  release = nueva({ publicada: iso(AHORA + 3 * 24 * H) })
  check('reloj del móvil días atrasado: no se espera a un futuro absurdo', (await u.check()) === true && u.shouldPrompt.value === true)

  u = await modulo()
  release = nueva({ code: 455, publicada: iso(AHORA - 1 * H) })
  check('misma versión instalada: ni se retiene ni se anuncia', (await u.check()) === false && pendientes().length === 0 && u.shouldPrompt.value === false)

  // Varias releases dentro del plazo: sólo cuenta la última, desde su propia hora.
  u = await modulo()
  release = nueva({ code: 460, publicada: iso(AHORA - 5 * H) })
  await u.check()
  release = nueva({ code: 461, publicada: iso(AHORA - 10 * MIN) })
  await u.check()
  const vivos = pendientes()
  check('una release más nueva sustituye a la retenida (un solo temporizador)', vivos.length === 1 && vivos[0].ms === 6 * H - 10 * MIN + 1 * MIN, JSON.stringify(vivos.map(x => x.ms)))
  reloj = AHORA + 6 * H
  await vivos[0].fn()
  check('pasado su plazo se anuncia la última (b461), no la anterior', u.shouldPrompt.value === true && u.latest.value.versionCode === 461)
}

console.log('\nBúsqueda manual: ignora el plazo')
{
  const u = await modulo()
  release = nueva({ publicada: iso(AHORA - 10 * MIN) })
  check('publicada hace 10 min, comprobación manual: se muestra', (await u.check({ manual: true })) === true && u.shouldPrompt.value === true)
  check('y no deja temporizador pendiente', pendientes().length === 0)

  const v = await modulo()
  release = nueva({ publicada: iso(AHORA - 10 * MIN) })
  await v.check()
  check('(antes, la automática la retenía)', v.shouldPrompt.value === false)
  check('la manual posterior la saca al momento', (await v.check({ manual: true })) === true && v.shouldPrompt.value === true)
}

console.log('\n«Ahora no» y «Posponer 1 semana» siguen funcionando')
{
  let u = await modulo()
  release = nueva({ publicada: iso(AHORA - 7 * H) })
  await u.check()
  check('el aviso sale', u.shouldPrompt.value === true)
  u.dismiss()
  check('«Ahora no» lo oculta', u.shouldPrompt.value === false && almacen.get('skippify.update.skipped') === '460')
  check('y la siguiente comprobación automática no lo repite', (await u.check()) === false && u.shouldPrompt.value === false)
  check('la manual sí lo enseña de nuevo', (await u.check({ manual: true })) === true && u.shouldPrompt.value === true)

  u = await modulo()
  release = nueva({ publicada: iso(AHORA - 7 * H) })
  await u.check()
  u.postpone()
  const guardado = JSON.parse(almacen.get('skippify.update.postponed'))
  check('«Posponer 1 semana» lo oculta y guarda la build y 7 días', u.shouldPrompt.value === false && guardado.code === 460 && guardado.until === AHORA + 7 * 24 * H)
  reloj = AHORA + 3 * 24 * H
  check('a los 3 días la automática sigue sin avisar', (await u.check()) === false && u.shouldPrompt.value === false)
  reloj = AHORA + 8 * 24 * H
  check('pasada la semana vuelve a avisar', (await u.check()) === true && u.shouldPrompt.value === true)

  u = await modulo()
  release = nueva({ code: 460, publicada: iso(AHORA - 7 * H) })
  await u.check()
  u.postpone()
  release = nueva({ code: 461, publicada: iso(AHORA - 7 * H) })
  check('otra build nueva (ya pasadas 6 h) recupera el aviso pese al pospuesto', (await u.check()) === true && u.shouldPrompt.value === true)
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) con error.`)
  process.exit(1)
}
console.log('\nEl plazo de 6 horas antes de avisar de una versión nueva funciona.')
